package com.xinwallet.app.ui.viewmodel

import android.app.Application
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.ChatMessage
import com.xinwallet.app.data.model.ChatRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AiRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val input: String = "",
    val sending: Boolean = false,
    val thinking: Boolean = false,
    val recording: Boolean = false,
    val voiceMode: String? = null, // null | "device" | "cloud"
    val error: String? = null,
    val toast: String? = null
)

class ChatViewModel(
    private val app: Application,
    private val aiRepo: AiRepository
) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var recognizer: SpeechRecognizer? = null
    private var recorder: MediaRecorder? = null
    private var recordFile: File? = null

    val speechAvailable: Boolean get() = SpeechRecognizer.isRecognitionAvailable(app)

    fun onInputChange(text: String) { _state.value = _state.value.copy(input = text) }
    fun clearError() { _state.value = _state.value.copy(error = null) }
    fun clearToast() { _state.value = _state.value.copy(toast = null) }

    private fun appendUser(msg: ChatMessage): List<ChatMessage> {
        val next = _state.value.messages + msg
        _state.value = _state.value.copy(messages = next, input = "", sending = true, thinking = true, error = null)
        return next
    }

    private fun finalize(assistant: ChatMessage) {
        _state.value = _state.value.copy(messages = _state.value.messages + assistant, sending = false, thinking = false)
    }

    private fun fail(next: List<ChatMessage>, message: String) {
        _state.value = _state.value.copy(messages = next.dropLast(1), sending = false, thinking = false, error = message)
    }

    fun sendText(text: String? = null) {
        val content = (text ?: _state.value.input).trim()
        if (content.isBlank()) return
        val next = appendUser(ChatMessage(role = "user", content = content))
        viewModelScope.launch {
            when (val r = aiRepo.chat(ChatRequest(messages = next))) {
                is ApiResult.Success -> finalize(
                    ChatMessage(role = "assistant", content = r.data.reply, transactions = r.data.transactions)
                )
                is ApiResult.Error -> fail(next, r.message)
            }
        }
    }

    fun sendImage(imageBase64: String, mime: String) {
        val next = appendUser(ChatMessage(role = "user", content = "", imageBase64 = imageBase64, mime = mime))
        viewModelScope.launch {
            when (val r = aiRepo.chat(ChatRequest(messages = next))) {
                is ApiResult.Success -> finalize(
                    ChatMessage(role = "assistant", content = r.data.reply, transactions = r.data.transactions)
                )
                is ApiResult.Error -> fail(next, r.message)
            }
        }
    }

    // ---- 设备端语音识别（免费，依赖系统识别服务） ----
    fun startVoice(onPartial: (String) -> Unit) {
        if (!speechAvailable) {
            _state.value = _state.value.copy(error = "本机不支持语音识别，已为你切换文字输入")
            return
        }
        try {
            if (recognizer == null) recognizer = SpeechRecognizer.createSpeechRecognizer(app)
            recognizer?.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { _state.value = _state.value.copy(thinking = false) }
                override fun onError(error: Int) {
                    _state.value = _state.value.copy(thinking = false, voiceMode = null, error = "语音识别失败（code $error）")
                }
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayListExtra(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if (text.isNotBlank()) _state.value = _state.value.copy(input = (_state.value.input + text).trim())
                    _state.value = _state.value.copy(thinking = false, voiceMode = null)
                }
                override fun onPartialResults(partialResults: Bundle?) {
                    val text = partialResults?.getStringArrayListExtra(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                    if (text.isNotBlank()) onPartial(text)
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            }
            _state.value = _state.value.copy(thinking = true, voiceMode = "device")
            recognizer?.startListening(intent)
        } catch (e: Exception) {
            _state.value = _state.value.copy(thinking = false, voiceMode = null, error = "无法启动语音识别：${e.message}")
        }
    }

    fun stopVoice() {
        try { recognizer?.stopListening() } catch (_: Exception) {}
        _state.value = _state.value.copy(voiceMode = null)
    }

    // ---- 云端语音转写（设备端不可用时的回退，需 RECORD_AUDIO 权限） ----
    fun startCloudVoice() {
        if (recorder != null) return
        try {
            val dir = File(app.cacheDir, "audio").apply { mkdirs() }
            val file = File(dir, "voice_${System.currentTimeMillis()}.m4a")
            recordFile = file
            recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(app) else MediaRecorder()
            recorder?.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            _state.value = _state.value.copy(recording = true, voiceMode = "cloud")
        } catch (e: Exception) {
            _state.value = _state.value.copy(recording = false, voiceMode = null, error = "无法录音：${e.message}")
        }
    }

    fun stopCloudVoice() {
        val rec = recorder ?: run { _state.value = _state.value.copy(voiceMode = null); return }
        recorder = null
        _state.value = _state.value.copy(recording = false, thinking = true, voiceMode = null)
        try { rec.stop() } catch (_: Exception) {}
        try { rec.release() } catch (_: Exception) {}
        val file = recordFile ?: run { _state.value = _state.value.copy(thinking = false); return }
        viewModelScope.launch {
            try {
                val bytes = file.readBytes()
                val b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
                when (val r = aiRepo.transcribe(b64, "audio/mp4")) {
                    is ApiResult.Success -> {
                        val text = r.data.text
                        if (text.isNotBlank()) _state.value = _state.value.copy(input = (_state.value.input + text).trim(), thinking = false)
                        else _state.value = _state.value.copy(thinking = false, error = "云端转写未返回文字")
                    }
                    is ApiResult.Error -> _state.value = _state.value.copy(thinking = false, error = "云端转写失败：${r.message}")
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(thinking = false, error = "读取录音失败：${e.message}")
            } finally {
                try { file.delete() } catch (_: Exception) {}
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        try { recognizer?.destroy() } catch (_: Exception) {}
        try { recorder?.release() } catch (_: Exception) {}
    }
}
