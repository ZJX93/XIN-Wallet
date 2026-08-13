package com.xinwallet.app.ui.viewmodel

import android.app.Application
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import org.vosk.Model
import org.vosk.Recognizer
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
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream
import okhttp3.OkHttpClient
import okhttp3.Request

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val input: String = "",
    val sending: Boolean = false,
    val thinking: Boolean = false,
    val recording: Boolean = false,
    val recordingStart: Long? = null, // 录音起始时间戳（毫秒），用于显示时长
    val error: String? = null,
    val toast: String? = null,
    val voiceModelDownloading: Boolean = false, // 首次使用语音时正在下载离线模型
    val voiceModelProgress: Int = 0,            // 下载进度 0-100
    val voiceModelError: String? = null         // 模型下载/加载失败信息
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
    private val modelZipUrl = "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip" // 离线模型托管地址；可替换为自有 CDN / 对象存储
    private val modelDirName = "vosk-model-small-cn-0.22" // 解压 / 加载到 files 后的目录名

    /**
     * 确保 Vosk 模型就绪（运行时下载，不打包进 APK）：
     * 1) 已解压过则直接加载；2) 否则从 modelZipUrl 下载 zip 并解压到 files，再加载 Model。
     * 须在 IO 调度下挂起调用。
     */
    private suspend fun ensureModelLoaded(): Boolean {
        if (voskModel != null) return true
        val dest = File(app.filesDir, modelDirName)
        if (File(dest, "am/final.mdl").exists()) return tryLoadModel(dest)
        return try {
            _state.value = _state.value.copy(voiceModelDownloading = true, voiceModelProgress = 0, voiceModelError = null)
            downloadModelZip(modelZipUrl, dest)
            tryLoadModel(dest)
        } catch (e: Exception) {
            _state.value = _state.value.copy(voiceModelDownloading = false, voiceModelError = "语音模型下载失败：${e.message}")
            false
        }
    }

    private fun tryLoadModel(dest: File): Boolean = try {
        voskModel = Model(dest.absolutePath)
        _state.value = _state.value.copy(voiceModelDownloading = false, voiceModelProgress = 100)
        true
    } catch (e: Exception) {
        _state.value = _state.value.copy(voiceModelDownloading = false, voiceModelError = "语音模型加载失败：${e.message}")
        false
    }

    /** 下载 zip 到 cache，解压到 filesDir（zip 顶层含 modelDirName/，正好落到 files/modelDirName） */
    private suspend fun downloadModelZip(url: String, dest: File) = withContext(Dispatchers.IO) {
        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
        val resp = client.newCall(Request.Builder().url(url).build()).execute()
        if (!resp.isSuccessful) throw IOException("HTTP ${resp.code}")
        val tmp = File(app.cacheDir, "$modelDirName.zip")
        val total = resp.body?.contentLength() ?: -1L
        var downloaded = 0L
        var lastPct = 0
        resp.body?.byteStream()?.use { input ->
            tmp.outputStream().buffered().use { out ->
                val buf = ByteArray(8192)
                var r: Int
                while (input.read(buf).also { r = it } != -1) {
                    out.write(buf, 0, r)
                    downloaded += r
                    if (total > 0) {
                        val pct = (downloaded * 100 / total).toInt()
                        if (pct - lastPct >= 2) {
                            lastPct = pct
                            _state.value = _state.value.copy(voiceModelProgress = pct)
                        }
                    }
                }
            }
        } ?: throw IOException("空响应体")
        unzip(tmp, dest.parentFile ?: app.filesDir)
        tmp.delete()
    }

    /** 解压 zip（含子目录）到 outDir */
    private fun unzip(zip: File, outDir: File) {
        outDir.mkdirs()
        ZipInputStream(zip.inputStream().buffered()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val file = File(outDir, entry.name)
                if (entry.isDirectory) file.mkdirs()
                else {
                    file.parentFile?.mkdirs()
                    file.outputStream().buffered().use { fos -> zis.copyTo(fos) }
                }
                zis.closeEntry()
                entry = zis.nextEntry
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
                var committed = _state.value.input.trim()
                var curSeg = ""                       // 当前句：跨 partial 稳定累积，避免一两个字跳动
                var lastInput = _state.value.input    // 仅在文本真正变化时更新，减少重组抖动
                val buffer = ByteArray(bufSize)
                recordingJob = launch(Dispatchers.IO) {
                    try {
                        while (_state.value.recording) {
                            val read = rec.read(buffer, 0, buffer.size)
                            if (read <= 0) continue
                            if (recognizer.acceptWaveForm(buffer, read)) {
                                val seg = parseVoskText(recognizer.result).trim()
                                if (seg.isNotBlank()) {
                                    // 极短片段（<=2字）先留在 curSeg 继续累积，避免一句话被切成多个碎块
                                    if (seg.length <= 2 && committed.isNotEmpty()) {
                                        curSeg = if (curSeg.isEmpty()) seg else mergePartial(curSeg, seg)
                                    } else {
                                        committed = if (committed.isEmpty()) seg else committed + seg
                                        curSeg = ""
                                    }
                                    val next = if (committed.isEmpty()) curSeg else committed + curSeg
                                    if (next != lastInput) { lastInput = next; _state.value = _state.value.copy(input = next) }
                                }
                            } else {
                                val p = parseVoskText(recognizer.partialResult).trim()
                                if (p.isNotEmpty()) {
                                    curSeg = mergePartial(curSeg, p)   // 平滑合并：延长时采用新文本、回退/修正时保持前缀
                                    val next = if (committed.isEmpty()) curSeg else committed + curSeg
                                    if (next != lastInput) { lastInput = next; _state.value = _state.value.copy(input = next) }
                                }
                            }
                        }
                        // 录音结束：把当前句剩余文本固化（finalResult 通常已空，用 curSeg 兜底）
                        val fin = parseVoskText(recognizer.finalResult).trim()
                        if (fin.isNotBlank()) curSeg = mergePartial(curSeg, fin)
                        if (curSeg.isNotBlank()) {
                            committed = if (committed.isEmpty()) curSeg else committed + curSeg
                            curSeg = ""
                        }
                        if (committed != lastInput) _state.value = _state.value.copy(input = committed)
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

    /** partial 结果平滑合并：延长时采用更完整的 new；回退/修正时保留两者公共前缀；避免文字反复改写、两个字两个字地跳 */
    private fun mergePartial(old: String, new: String): String {
        if (new.isEmpty()) return old
        if (old.isEmpty()) return new
        if (new.startsWith(old)) return new        // 当前句正在变长，直接用最新假设
        if (old.startsWith(new)) return old        // Vosk 回退，保留较长者保持稳定
        val n = minOf(old.length, new.length)      // 出现分歧（修正了前面的字）：取最长公共前缀
        var i = 0
        while (i < n && old[i] == new[i]) i++
        return old.substring(0, i)
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
