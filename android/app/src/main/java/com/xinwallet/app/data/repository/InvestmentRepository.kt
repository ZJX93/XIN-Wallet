package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateInvestmentRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class InvestmentRepository(private val apiProvider: () -> ApiService) {
    suspend fun getTypes() = safeApiCall { apiProvider().getInvestmentTypes() }
    suspend fun getInvestments() = safeApiCall { apiProvider().getInvestments() }
    suspend fun createInvestment(req: CreateInvestmentRequest) = safeApiCall { apiProvider().createInvestment(req) }
    suspend fun deleteInvestment(id: Int) = safeApiCall { apiProvider().deleteInvestment(id) }
}
