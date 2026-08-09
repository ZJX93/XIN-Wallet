package com.xinwallet.app.data.remote

import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.model.RefreshRequest
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

/**
 * 自动注入 Bearer Token；遇到 401 时尝试用 refreshToken 刷新并重试一次。
 * apiProvider 延迟提供 ApiService，避免与 OkHttp/Retrofit 构造形成循环依赖。
 */
class AuthInterceptor(
    private val session: SessionManager,
    private val apiProvider: () -> ApiService?
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val token = runBlocking { session.accessToken() }
        val authed = if (token.isNotEmpty()) {
            original.newBuilder().header("Authorization", "Bearer $token").build()
        } else original

        val response = chain.proceed(authed)
        if (response.code == 401 && original.header("Authorization") != null) {
            val refreshed = runBlocking { tryRefresh() }
            response.close()
            if (refreshed != null) {
                val retry = original.newBuilder().header("Authorization", "Bearer $refreshed").build()
                return chain.proceed(retry)
            }
        }
        return response
    }

    private suspend fun tryRefresh(): String? {
        val rt = session.refreshToken() ?: return null
        return try {
            val api = apiProvider() ?: return null
            val resp = api.refresh(RefreshRequest(rt))
            if (resp.isSuccessful && resp.body()?.success == true) {
                val auth = resp.body()!!.data
                if (auth != null && auth.token.isNotEmpty()) {
                    session.saveTokens(auth.token, auth.refreshToken)
                    auth.token
                } else null
            } else null
        } catch (_: Exception) {
            null
        }
    }
}
