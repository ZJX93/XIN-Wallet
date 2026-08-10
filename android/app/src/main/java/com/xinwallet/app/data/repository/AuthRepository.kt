package com.xinwallet.app.data.repository

import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.model.AuthResponse
import com.xinwallet.app.data.model.LoginRequest
import com.xinwallet.app.data.model.RefreshRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import kotlinx.coroutines.withTimeoutOrNull

class AuthRepository(
    private val session: SessionManager,
    private val apiProvider: () -> ApiService
) {
    suspend fun login(username: String, password: String): ApiResult<AuthResponse> {
        return when (val r = safeApiCall { apiProvider().login(LoginRequest(username, password)) }) {
            is ApiResult.Success -> {
                r.data?.let { session.saveTokens(it.token, it.refreshToken); session.saveUsername(username) }
                r
            }
            else -> r
        }
    }

    suspend fun demoLogin(): ApiResult<AuthResponse> {
        return when (val r = safeApiCall { apiProvider().demoLogin() }) {
            is ApiResult.Success -> {
                r.data?.let { session.saveTokens(it.token, it.refreshToken); session.saveUsername("demo") }
                r
            }
            else -> r
        }
    }

    suspend fun refresh(): ApiResult<AuthResponse> {
        val rt = session.refreshToken() ?: return ApiResult.Error("未登录")
        return when (val r = safeApiCall { apiProvider().refresh(RefreshRequest(rt)) }) {
            is ApiResult.Success -> { r.data?.let { session.saveTokens(it.token, it.refreshToken) }; r }
            else -> r
        }
    }

    suspend fun hasSession(): Boolean = session.accessToken().isNotEmpty()
    suspend fun logout() = session.clearSession()
    suspend fun username(): String = session.username()

    /**
     * 冷启动时验证会话有效性：
     * - 有 refreshToken 则尝试刷新（拿到新 accessToken），成功视为已登录；
     * - refresh 失败/无 refreshToken/超时，则清空本地会话并返回 false，让 UI 回到登录页。
     * 避免仅检查 accessToken 是否存在导致的「过期 token 进首页 -> 请求 401 -> 刷新失败卡 loading」问题。
     */
    suspend fun validateSession(): Boolean {
        return withTimeoutOrNull(10_000) {
            val rt = session.refreshToken()
            if (rt.isNullOrBlank()) {
                session.clearSession()
                return@withTimeoutOrNull false
            }
            when (val r = refresh()) {
                is ApiResult.Success -> true
                is ApiResult.Error -> {
                    session.clearSession()
                    false
                }
            }
        } ?: run {
            session.clearSession()
            false
        }
    }
}
