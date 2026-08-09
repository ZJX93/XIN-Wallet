package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateAccountRequest
import com.xinwallet.app.data.model.UpdateAccountRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class AccountRepository(private val apiProvider: () -> ApiService) {
    suspend fun getAccounts() = safeApiCall { apiProvider().getAccounts() }
    suspend fun createAccount(req: CreateAccountRequest) = safeApiCall { apiProvider().createAccount(req) }
    suspend fun updateAccount(id: Int, req: UpdateAccountRequest) = safeApiCall { apiProvider().updateAccount(id, req) }
    suspend fun closeAccount(id: Int) = safeApiCall { apiProvider().closeAccount(id) }
    suspend fun deleteAccount(id: Int) = safeApiCall { apiProvider().deleteAccount(id) }
}
