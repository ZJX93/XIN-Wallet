package com.xinwallet.app.ui.viewmodel

import android.app.Application
import android.content.Intent
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.ChatMessage
import com.xinwallet.app.data.model.ChatRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AiRepository
import com.xinwallet.app.data.repository.TransactionRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val input: String = "",
    val sending: Boolean = false,
    val thinking: Boolean = false,
    val recording: Boolean = false,
    val recordingStart: Long? = null,
    val transcribing: Boolean = false,
    val error: String? = null,
    val toast: String? = null
)

class ChatViewModel(
    private val app: Application,
    private val aiRepo: AiRepository,
    private val txnRepo: TransactionRepository
) : AndroidViewModel(app) {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var inputBeforeVoice: String = ""

    fun onInputChange(text: String) { _state.value = _state.value.copy(input = text) }
    fun clearError() { _state.value = _state.value.copy(error = null) }
    fun clearToast() { _state.value = _state.value.copy(toast = null) }
    fun clearMessages() { _state.value = _state.value.copy(messages = emptyList(), input = "") }

    fun deleteTransaction(txnId: Int) {
        viewModelScope.launch {
            _state.value = _state.value.copy(toast = "正在删除…")
            when (val r = txnRepo.deleteTransaction(txnId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(toast = "已删除交易 #$txnId")
                is ApiResult.Error -> _state.value = _state.value.copy(error = "删除失败：${r.message}")
            }
        }
    }

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

    // ---- 语音识别：优先端上 SpeechRecognizer，不支持时回退 MediaRecorder + 后端转写 ----
    private var speechRecognizer: SpeechRecognizer? = null
    private var usingBackendVoice = false       // 是否在用后端转写模式
    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var recordingJob: Job? = null

    private fun ensureSpeechRecognizer(): SpeechRecognizer? {
        if (speechRecognizer != null) return speechRecognizer
        if (!SpeechRecognizer.isRecognitionAvailable(app)) return null
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(app)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onError(error: Int) {
                val msg = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH -> "未识别到语音内容"
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "没有检测到语音，请重试"
                    SpeechRecognizer.ERROR_AUDIO -> "录音错误"
                    SpeechRecognizer.ERROR_NETWORK -> "网络错误"
                    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "网络超时"
                    SpeechRecognizer.ERROR_SERVER -> "语音服务异常"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "语音识别忙，请重试"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "缺少录音权限"
                    else -> "语音识别错误($error)"
                }
                _state.value = _state.value.copy(
                    recording = false, recordingStart = null, transcribing = false,
                    input = inputBeforeVoice, error = msg
                )
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                if (!text.isNullOrBlank()) {
                    _state.value = _state.value.copy(
                        input = if (inputBeforeVoice.isBlank()) text else "$inputBeforeVoice $text"
                    )
                }
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                _state.value = _state.value.copy(
                    recording = false, recordingStart = null, transcribing = false,
                    input = if (text.isNullOrBlank()) inputBeforeVoice
                            else if (inputBeforeVoice.isBlank()) text
                            else "$inputBeforeVoice $text",
                    error = if (text.isNullOrBlank()) "未识别到语音内容" else null
                )
            }
        })
        return speechRecognizer
    }

    /** 开始语音识别 */
    fun startVoice() {
        if (_state.value.recording) return
        inputBeforeVoice = _state.value.input

        // 方案1：尝试端上 SpeechRecognizer
        val recognizer = ensureSpeechRecognizer()
        if (recognizer != null) {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
            try {
                recognizer.startListening(intent)
                usingBackendVoice = false
                _state.value = _state.value.copy(recording = true, recordingStart = System.currentTimeMillis(), error = null)
                return
            } catch (e: SecurityException) {
                // 华为等设备禁止绑定语音服务，销毁后回退
                try { speechRecognizer?.destroy() } catch (_: Exception) {}
                speechRecognizer = null
            }
        }

        // 方案2：回退到 MediaRecorder + 后端转写
        try {
            val dir = File(app.cacheDir, "voice").apply { mkdirs() }
            val file = File(dir, "voice_${System.currentTimeMillis()}.m4a")
            audioFile = file

            @Suppress("DEPRECATION")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(app)
            } else {
                MediaRecorder()
            }
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16000)
                setAudioEncodingBitRate(32000)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            usingBackendVoice = true
            _state.value = _state.value.copy(recording = true, recordingStart = System.currentTimeMillis(), error = null)
        } catch (e: Exception) {
            _state.value = _state.value.copy(error = "无法启动录音：${e.message}")
        }
    }

    /** 停止语音 → 端上模式等待 onResults；后端模式上传文件转写 */
    fun stopVoice() {
        if (!_state.value.recording) return
        _state.value = _state.value.copy(recording = false, recordingStart = null, transcribing = true)

        if (!usingBackendVoice) {
            // 端上模式：stopListening 等 onResults 回调
            speechRecognizer?.stopListening()
            viewModelScope.launch {
                delay(8000)
                if (_state.value.transcribing) {
                    // 部分设备 stopListening 后不回调 onResults，但 onPartialResults 已实时更新 input；
                    // 此时已有识别文字则视为成功，避免误报超时丢失内容
                    val hasPartial = _state.value.input.isNotBlank() && _state.value.input != inputBeforeVoice
                    _state.value = _state.value.copy(
                        transcribing = false,
                        error = if (hasPartial) null else "语音识别超时"
                    )
                }
            }
            return
        }

        // 后端模式：停止录音 → base64 → 上传后端转写
        val recorder = mediaRecorder
        val file = audioFile
        mediaRecorder = null
        audioFile = null

        recordingJob = viewModelScope.launch(Dispatchers.IO) {
            try {
                recorder?.apply {
                    try { stop() } catch (_: Exception) {}
                    release()
                }
                if (file == null || !file.exists() || file.length() < 200) {
                    _state.value = _state.value.copy(transcribing = false, error = "录音太短，请重试")
                    return@launch
                }
                val audioBase64 = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
                file.delete()

                when (val r = aiRepo.transcribe(audioBase64, "audio/mp4")) {
                    is ApiResult.Success -> {
                        val text = r.data.text.trim()
                        if (text.isNotBlank()) {
                            val newInput = if (inputBeforeVoice.isBlank()) text else "$inputBeforeVoice $text"
                            _state.value = _state.value.copy(input = newInput, transcribing = false)
                        } else {
                            _state.value = _state.value.copy(transcribing = false, error = "未识别到语音内容")
                        }
                    }
                    is ApiResult.Error -> {
                        _state.value = _state.value.copy(transcribing = false, error = "语音转写失败：${r.message}")
                    }
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(transcribing = false, error = "语音处理出错：${e.message}")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        recordingJob?.cancel()
        try { speechRecognizer?.stopListening() } catch (_: Exception) {}
        try { speechRecognizer?.destroy() } catch (_: Exception) {}
        speechRecognizer = null
        try { mediaRecorder?.apply { try { stop() } catch (_: Exception) {}; release() } } catch (_: Exception) {}
        try { audioFile?.delete() } catch (_: Exception) {}
    }
}
