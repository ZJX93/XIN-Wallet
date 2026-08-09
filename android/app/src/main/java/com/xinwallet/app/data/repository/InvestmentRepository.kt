package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateInvestmentRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class InvestmentRepository(private val api: ApiService) {
    suspend fun getTypes() = safeApiCall { api.getInvestmentTypes() }
    suspend fun getInvestments() = safeApiCall { api.getInvestments() }
    suspend fun createInvestment(req: CreateInvestmentRequest) = safeApiCall { api.createInvestment(req) }
    suspend fun deleteInvestment(id: Int) = safeApiCall { api.deleteInvestment(id) }
}
