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
    val voiceMode: String? = null, // null | "cloud"
    val recordingStart: Long? = null, // 录音起始时间戳（毫秒），用于显示时长
    val error: String? = null,
    val toast: String? = null
)

class ChatViewModel(
    private val app: Application,
    private val aiRepo: AiRepository
) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var recorder: MediaRecorder? = null
    private var recordFile: File? = null

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

    // ---- 语音输入：优先设备端语音识别，不可用则回退云端 Whisper 转写 ----
    private var speechRecognizer: SpeechRecognizer? = null
    private var lastDeviceResult: String = ""

    fun startVoice() {
        if (SpeechRecognizer.isRecognitionAvailable(app)) {
            startDeviceVoice()
        } else {
            startCloudVoice()
        }
    }

    fun stopVoice() {
        when (_state.value.voiceMode) {
            "device" -> stopDeviceVoice()
            "cloud" -> stopCloudVoice()
            else -> _state.value = _state.value.copy(recording = false, voiceMode = null, recordingStart = null)
        }
    }

    // 设备端语音识别：不依赖 AI 服务商，直接把识别文字填入输入框
    private fun startDeviceVoice() {
        try {
            lastDeviceResult = ""
            speechRecognizer?.destroy()
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(app).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        _state.value = _state.value.copy(recording = true, voiceMode = "device", recordingStart = System.currentTimeMillis())
                    }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {
                        _state.value = _state.value.copy(recording = false, voiceMode = null, recordingStart = null)
                    }
                    override fun onError(error: Int) {
                        val msg = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH -> "未能识别到语音，请再试一次"
                            SpeechRecognizer.ERROR_NETWORK -> "网络异常，请检查网络后重试"
                            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "识别超时，请重试"
                            SpeechRecognizer.ERROR_AUDIO -> "麦克风异常，请检查权限"
                            SpeechRecognizer.ERROR_CLIENT -> "识别服务异常"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "缺少录音权限"
                            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "识别服务忙，请稍后再试"
                            SpeechRecognizer.ERROR_SERVER -> "识别服务暂不可用"
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有听到声音，请重试"
                            else -> "语音识别失败（错误码 $error）"
                        }
                        _state.value = _state.value.copy(recording = false, voiceMode = null, recordingStart = null, error = msg)
                    }
                    override fun onResults(results: Bundle?) {
                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = matches?.firstOrNull()?.trim() ?: ""
                        lastDeviceResult = text
                        if (text.isNotBlank()) {
                            _state.value = _state.value.copy(
                                input = (_state.value.input + text).trim(),
                                recording = false,
                                voiceMode = null,
                                recordingStart = null
                            )
                        }
                    }
                    override fun onPartialResults(partialResults: Bundle?) {
                        // 不实时写入 input，避免与最终 onResults 重复；仅记录最新中间结果用于兜底
                        partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()?.let { lastDeviceResult = it.trim() }
                    }
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                }
                startListening(intent)
            }
        } catch (e: Exception) {
            _state.value = _state.value.copy(recording = false, voiceMode = null, recordingStart = null, error = "无法启动语音识别：${e.message}，将回退云端转写")
            startCloudVoice()
        }
    }

    private fun stopDeviceVoice() {
        try {
            speechRecognizer?.stopListening()
        } catch (_: Exception) {}
        // 若已经收到 onResults，input 已自动更新；否则使用 lastDeviceResult 兜底
        if (lastDeviceResult.isNotBlank()) {
            _state.value = _state.value.copy(
                input = (_state.value.input + lastDeviceResult).trim(),
                recording = false,
                voiceMode = null,
                recordingStart = null
            )
        } else {
            _state.value = _state.value.copy(recording = false, voiceMode = null, recordingStart = null)
        }
    }

    // 云端语音转写（录音上传后端，由 OpenAI 兼容接口的 whisper 转写）—— 设备端不可用时回退
    private fun startCloudVoice() {
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
            _state.value = _state.value.copy(recording = true, voiceMode = "cloud", recordingStart = System.currentTimeMillis())
        } catch (e: Exception) {
            _state.value = _state.value.copy(recording = false, voiceMode = null, recordingStart = null, error = "无法录音：${e.message}")
        }
    }

    private fun stopCloudVoice() {
        val rec = recorder ?: run { _state.value = _state.value.copy(voiceMode = null, recordingStart = null); return }
        recorder = null
        _state.value = _state.value.copy(recording = false, thinking = true, voiceMode = null, recordingStart = null)
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
                        else _state.value = _state.value.copy(thinking = false, error = "云端转写未返回文字，请重试或改用文字输入")
                    }
                    is ApiResult.Error -> _state.value = _state.value.copy(thinking = false, error = "语音转写失败：${r.message}（请确认 AI 服务支持语音转写）")
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
        try { recorder?.release() } catch (_: Exception) {}
        try { speechRecognizer?.destroy() } catch (_: Exception) {}
    }
}
