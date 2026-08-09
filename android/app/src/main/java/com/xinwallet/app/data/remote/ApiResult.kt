package com.xinwallet.app.data.remote

import com.google.gson.Gson
import com.xinwallet.app.data.model.ApiResponse
import retrofit2.Response

sealed class ApiResult<out T> {
    data class Success<out T>(val data: T) : ApiResult<T>()
    data class Error(val message: String, val code: Int = 0) : ApiResult<Nothing>()
}

/**
 * 统一封装 Retrofit 调用：
 * - 2xx 且 success=true → Success(data)
 * - 2xx 但 success=false → Error(message)
 * - 非 2xx → 尝试解析错误体中的 message，否则用 HTTP 状态码
 */
suspend fun <T> safeApiCall(call: suspend () -> Response<ApiResponse<T>>): ApiResult<T> {
    return try {
        val response = call()
        if (response.isSuccessful) {
            val body = response.body()
            if (body?.success == true && body.data != null) {
                ApiResult.Success(body.data)
            } else {
                ApiResult.Error(body?.message ?: "请求失败")
            }
        } else {
            val errorMsg = try {
                response.errorBody()?.string()?.let {
                    Gson().fromJson(it, ApiResponse::class.java)?.message
                }
            } catch (_: Exception) { null }
            ApiResult.Error(errorMsg ?: "HTTP ${response.code()}", response.code())
        }
    } catch (e: Exception) {
        ApiResult.Error(e.message ?: "网络异常")
    }
}
