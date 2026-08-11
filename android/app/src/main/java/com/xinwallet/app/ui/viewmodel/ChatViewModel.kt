package com.xinwallet.app.ui.viewmodel

import android.app.Application
import android.media.MediaRecorder
import android.os.Build
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
    val voiceWaiting: Boolean = false, // 系统语音输入 UI 已唤起，等待返回结果
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

    // ---- 语音输入：优先调用系统默认语音输入（尊重「设置-默认应用-语音输入」，如华为小艺）----
    //      通过 ACTION_RECOGNIZE_SPEECH 拉起系统/厂商语音 UI 并返回文字；
    //      若设备上没有可用的语音输入实现，则回退到云端 Whisper 转写 ----
    fun appendVoiceText(text: String) {
        val t = text.trim()
        if (t.isBlank()) return
        _state.value = _state.value.copy(
            input = (_state.value.input + t).trim(),
            voiceWaiting = false
        )
    }

    fun setVoiceWaiting(waiting: Boolean) {
        _state.value = _state.value.copy(voiceWaiting = waiting)
    }

    // 停止云端录音（系统语音输入走 Activity Result，无需本应用主动停止）
    fun stopVoice() {
        if (_state.value.voiceMode == "cloud") stopCloudVoice()
    }

    // 云端语音转写（录音上传后端，由 OpenAI 兼容接口的 whisper 转写）—— 系统语音输入不可用时回退
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
    }
}
