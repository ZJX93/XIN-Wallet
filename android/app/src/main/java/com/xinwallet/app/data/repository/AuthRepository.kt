package com.xinwallet.app.data.repository

import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.model.AuthResponse
import com.xinwallet.app.data.model.LoginRequest
import com.xinwallet.app.data.model.RefreshRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

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
}
