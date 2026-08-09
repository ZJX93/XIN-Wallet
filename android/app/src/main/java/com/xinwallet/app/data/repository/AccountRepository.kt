package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateAccountRequest
import com.xinwallet.app.data.model.UpdateAccountRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class AccountRepository(private val apiProvider: () -> ApiService) {
    suspend fun getAccounts() = safeApiCall { apiProvider().getAccounts() }
    suspend fun createAccount(req: CreateAccountRequest) = safeApiCall { apiProvider().createAccount(req) }
    suspend fun updateAccount(id: Int, req: UpdateAccountRequest) = safeUnitCall { apiProvider().updateAccount(id, req) }
    suspend fun closeAccount(id: Int) = safeUnitCall { apiProvider().closeAccount(id) }
    suspend fun deleteAccount(id: Int) = safeUnitCall { apiProvider().deleteAccount(id) }
}
