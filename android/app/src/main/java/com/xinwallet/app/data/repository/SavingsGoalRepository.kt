package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateSavingGoalRequest
import com.xinwallet.app.data.model.SavingsAllocateRequest
import com.xinwallet.app.data.model.SavingsWithdrawRequest
import com.xinwallet.app.data.model.UpdateSavingGoalRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class SavingsGoalRepository(private val apiProvider: () -> ApiService) {
    suspend fun getSavingsGoals() = safeApiCall { apiProvider().getSavingsGoals() }
    suspend fun createSavingsGoal(req: CreateSavingGoalRequest) = safeApiCall { apiProvider().createSavingsGoal(req) }
    suspend fun updateSavingsGoal(id: Int, req: UpdateSavingGoalRequest) = safeUnitCall { apiProvider().updateSavingsGoal(id, req) }
    suspend fun deleteSavingsGoal(id: Int) = safeUnitCall { apiProvider().deleteSavingsGoal(id) }
    suspend fun allocate(id: Int, req: SavingsAllocateRequest) = safeUnitCall { apiProvider().allocateSavings(id, req) }
    suspend fun withdraw(id: Int, req: SavingsWithdrawRequest) = safeUnitCall { apiProvider().withdrawSavings(id, req) }
    suspend fun getTxns(id: Int) = safeApiCall { apiProvider().getSavingsTxns(id) }
}
