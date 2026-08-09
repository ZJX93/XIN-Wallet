package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateAccountRequest
import com.xinwallet.app.data.model.UpdateAccountRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class AccountRepository(private val api: ApiService) {
    suspend fun getAccounts() = safeApiCall { api.getAccounts() }
    suspend fun createAccount(req: CreateAccountRequest) = safeApiCall { api.createAccount(req) }
    suspend fun updateAccount(id: Int, req: UpdateAccountRequest) = safeApiCall { api.updateAccount(id, req) }
    suspend fun closeAccount(id: Int) = safeApiCall { api.closeAccount(id) }
    suspend fun deleteAccount(id: Int) = safeApiCall { api.deleteAccount(id) }
}
