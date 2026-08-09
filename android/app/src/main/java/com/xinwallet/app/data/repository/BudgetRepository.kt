package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateBudgetRequest
import com.xinwallet.app.data.model.UpdateBudgetRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class BudgetRepository(private val apiProvider: () -> ApiService) {
    suspend fun getBudgets() = safeApiCall { apiProvider().getBudgets() }
    suspend fun createBudget(req: CreateBudgetRequest) = safeApiCall { apiProvider().createBudget(req) }
    suspend fun updateBudget(id: Int, req: UpdateBudgetRequest) = safeUnitCall { apiProvider().updateBudget(id, req) }
    suspend fun deleteBudget(id: Int) = safeUnitCall { apiProvider().deleteBudget(id) }
}
