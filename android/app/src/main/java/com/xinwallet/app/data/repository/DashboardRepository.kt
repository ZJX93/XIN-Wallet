package com.xinwallet.app.data.repository

import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class DashboardRepository(private val api: ApiService) {
    suspend fun getDashboard() = safeApiCall { api.getDashboard() }
}
