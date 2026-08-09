package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateTransactionRequest
import com.xinwallet.app.data.model.CreateTransferRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class TransactionRepository(private val apiProvider: () -> ApiService) {
    suspend fun getTransactions(
        month: String? = null,
        type: String? = null,
        accountId: Int? = null,
        limit: Int = 50
    ) = safeApiCall { apiProvider().getTransactions(month, type, accountId, limit) }

    suspend fun createTransaction(req: CreateTransactionRequest) = safeApiCall { apiProvider().createTransaction(req) }
    suspend fun deleteTransaction(id: Int) = safeApiCall { apiProvider().deleteTransaction(id) }
    suspend fun getTransfers(month: String? = null) = safeApiCall { apiProvider().getTransfers(month) }
    suspend fun createTransfer(req: CreateTransferRequest) = safeApiCall { apiProvider().createTransfer(req) }
}
