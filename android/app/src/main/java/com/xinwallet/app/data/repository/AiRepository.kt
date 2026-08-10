package com.xinwallet.app.data.repository

import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class AiRepository(private val apiProvider: () -> ApiService) {

    /**
     * 上传账单图片做 OCR + 交易项提取。
     * 后端 multer 限制 5MB 且只接受图片格式，字段名固定为 image。
     */
    suspend fun ocr(bytes: ByteArray, fileName: String = "bill.jpg", mime: String = "image/jpeg") =
        safeApiCall {
            val body = bytes.toRequestBody(mime.toMediaTypeOrNull())
            val part = MultipartBody.Part.createFormData("image", fileName, body)
            apiProvider().ocr(part)
        }

    suspend fun getOcrConfig() = safeApiCall { apiProvider().getOcrConfig() }

    /** AI 对话记账：把完整对话历史发给后端，后端用 function calling 建账/查账 */
    suspend fun chat(req: ChatRequest) = safeApiCall { apiProvider().chat(req) }

    /** 云端语音转写：audio 为 base64 */
    suspend fun transcribe(audio: String, mime: String? = null) =
        safeApiCall { apiProvider().transcribe(TranscribeRequest(audio, mime)) }
}
