package com.xinwallet.app.ui.viewmodel

import android.app.Application
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.content.res.AssetManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.alphacephei.vosk.Model
import com.alphacephei.vosk.Recognizer
import com.xinwallet.app.data.model.ChatMessage
import com.xinwallet.app.data.model.ChatRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AiRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val input: String = "",
    val sending: Boolean = false,
    val thinking: Boolean = false,
    val recording: Boolean = false,
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

    // ---- 离线语音识别（Vosk）：手机本地把语音转成文字填入输入框 ----
    //      不依赖系统语音助手（华为小艺不暴露标准接口）也不依赖云端 AI（Anthropic 不支持转写），华为等国产 ROM 上可用 ----
    private var voskModel: Model? = null
    private var recognizer: Recognizer? = null
    private var audioRecord: AudioRecord? = null
    private var recordingJob: Job? = null
    private val modelAssetPath = "models/vosk-model-small-cn-0.22" // assets 内相对路径
    private val modelDirName = "vosk-model-small-cn-0.22"         // 拷贝到 files 后的目录名

    /** 确保 Vosk 模型就绪：首次运行把 assets 内的模型目录拷贝到 files 并加载 Model（须 IO 线程调用） */
    private fun ensureModelLoaded(): Boolean {
        if (voskModel != null) return true
        return try {
            val dest = File(app.filesDir, modelDirName)
            if (!dest.exists()) copyAssetDir(app.assets, modelAssetPath, dest)
            voskModel = Model(dest.absolutePath)
            true
        } catch (e: Exception) {
            _state.value = _state.value.copy(error = "语音模型加载失败：${e.message}")
            false
        }
    }

    /** 递归把 assets 子目录拷贝到目标 File 目录 */
    private fun copyAssetDir(am: AssetManager, assetPath: String, dest: File) {
        dest.mkdirs()
        val entries = am.list(assetPath) ?: return
        if (entries.isEmpty()) {
            am.open(assetPath).use { input ->
                File(dest, assetPath.substringAfterLast('/')).outputStream().use { out -> input.copyTo(out) }
            }
            return
        }
        for (name in entries) {
            val childAsset = if (assetPath.isEmpty()) name else "$assetPath/$name"
            val childFile = File(dest, name)
            val childList = am.list(childAsset)
            if (childList == null || childList.isEmpty()) {
                // list 返回 null 表示该路径是文件（Android 的 AssetManager.list 对文件返回 null）
                am.open(childAsset).use { input -> childFile.outputStream().use { out -> input.copyTo(out) } }
            } else {
                copyAssetDir(am, childAsset, childFile)
            }
        }
    }

    /** 开始离线语音识别：录音并通过 Vosk 流式识别，实时把文字填入输入框 */
    fun startVoice() {
        if (_state.value.recording) return
        viewModelScope.launch(Dispatchers.IO) {
            if (!ensureModelLoaded()) return@launch
            val model = voskModel ?: return@launch
            try {
                val sampleRate = 16000
                val minBuf = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                val bufSize = if (minBuf > 8192) minBuf else 8192
                val rec = AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufSize)
                val recognizer = Recognizer(model, sampleRate.toFloat())
                audioRecord = rec
                this@ChatViewModel.recognizer = recognizer
                rec.startRecording()
                _state.value = _state.value.copy(recording = true, recordingStart = System.currentTimeMillis(), error = null)
                var accumulated = _state.value.input
                val buffer = ByteArray(bufSize)
                recordingJob = launch(Dispatchers.IO) {
                    try {
                        while (_state.value.recording) {
                            val read = rec.read(buffer, 0, buffer.size)
                            if (read <= 0) continue
                            if (recognizer.acceptWaveForm(buffer, read)) {
                                val t = parseVoskText(recognizer.result)
                                if (t.isNotBlank()) {
                                    accumulated = (accumulated + t).trim()
                                    _state.value = _state.value.copy(input = accumulated)
                                }
                            } else {
                                val p = parseVoskText(recognizer.partialResult)
                                _state.value = _state.value.copy(input = (accumulated + p).trim())
                            }
                        }
                        val f = parseVoskText(recognizer.finalResult())
                        if (f.isNotBlank()) accumulated = (accumulated + f).trim()
                        _state.value = _state.value.copy(input = accumulated)
                    } catch (e: Exception) {
                        // 仅在仍在录音状态下报错；主动停止导致的协程取消不提示
                        if (_state.value.recording) _state.value = _state.value.copy(error = "语音识别中断：${e.message}")
                    } finally {
                        try { rec.stop() } catch (_: Exception) {}
                        try { rec.release() } catch (_: Exception) {}
                        audioRecord = null
                    }
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(recording = false, recordingStart = null, error = "无法启动录音：${e.message}")
            }
        }
    }

    /** 停止录音与识别，保留已识别的文字；音频资源由录音协程的 finally 释放 */
    fun stopVoice() {
        if (!_state.value.recording) return
        _state.value = _state.value.copy(recording = false, recordingStart = null)
        recordingJob = null
    }

    private fun parseVoskText(json: String): String {
        return try {
            val obj = JSONObject(json)
            obj.optString("text", obj.optString("partial", "")).trim()
        } catch (_: Exception) { "" }
    }

    override fun onCleared() {
        super.onCleared()
        recordingJob?.cancel()
        try { audioRecord?.release() } catch (_: Exception) {}
        try { recognizer?.close() } catch (_: Exception) {}
        try { voskModel?.close() } catch (_: Exception) {}
    }
}
