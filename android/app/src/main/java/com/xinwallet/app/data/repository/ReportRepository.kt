package com.xinwallet.app.data.repository

import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class ReportRepository(private val apiProvider: () -> ApiService) {
    suspend fun getReport(type: String, period: String) =
        safeApiCall { apiProvider().getReport(type, period) }
}
