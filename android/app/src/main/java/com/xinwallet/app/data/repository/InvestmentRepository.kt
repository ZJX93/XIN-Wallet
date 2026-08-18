package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateInvestmentRequest
import com.xinwallet.app.data.model.UpdateInvestmentRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class InvestmentRepository(private val apiProvider: () -> ApiService) {
    suspend fun getTypes() = safeApiCall { apiProvider().getInvestmentTypes() }
    suspend fun getInvestments() = safeApiCall { apiProvider().getInvestments() }
    suspend fun createInvestment(req: CreateInvestmentRequest) = safeApiCall { apiProvider().createInvestment(req) }
    suspend fun updateInvestment(id: Int, req: UpdateInvestmentRequest) = safeUnitCall { apiProvider().updateInvestment(id, req) }
    suspend fun deleteInvestment(id: Int) = safeUnitCall { apiProvider().deleteInvestment(id) }
    suspend fun getTransactions(id: Int) = safeApiCall { apiProvider().getInvestmentTransactions(id) }
}
