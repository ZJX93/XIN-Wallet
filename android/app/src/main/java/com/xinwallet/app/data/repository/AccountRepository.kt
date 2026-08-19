package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.AddAccountInterestRequest
import com.xinwallet.app.data.model.CreateAccountRequest
import com.xinwallet.app.data.model.UpdateAccountRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class AccountRepository(private val apiProvider: () -> ApiService) {
    suspend fun getAccounts() = safeApiCall { apiProvider().getAccounts() }
    /** 拉取全部账户（含已销户），账户列表/详情页使用；记账等选账户场景仍用 getAccounts() */
    suspend fun getAllAccounts() = safeApiCall { apiProvider().getAccounts(all = true) }
    suspend fun createAccount(req: CreateAccountRequest) = safeApiCall { apiProvider().createAccount(req) }
    suspend fun updateAccount(id: Int, req: UpdateAccountRequest) = safeUnitCall { apiProvider().updateAccount(id, req) }
    suspend fun closeAccount(id: Int) = safeUnitCall { apiProvider().closeAccount(id) }
    suspend fun deleteAccount(id: Int) = safeUnitCall { apiProvider().deleteAccount(id) }

    /** 记利息：入账一笔利息，返回最新余额与计息日期 */
    suspend fun addInterest(accountId: Int, amount: Double, date: String?, note: String?) =
        safeApiCall { apiProvider().addAccountInterest(accountId, AddAccountInterestRequest(amount, date, note)) }
}
