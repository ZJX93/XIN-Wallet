package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateTransactionRequest
import com.xinwallet.app.data.model.CreateTransferRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class TransactionRepository(private val api: ApiService) {
    suspend fun getTransactions(
        month: String? = null,
        type: String? = null,
        accountId: Int? = null,
        limit: Int = 50
    ) = safeApiCall { api.getTransactions(month, type, accountId, limit) }

    suspend fun createTransaction(req: CreateTransactionRequest) = safeApiCall { api.createTransaction(req) }
    suspend fun deleteTransaction(id: Int) = safeApiCall { api.deleteTransaction(id) }
    suspend fun getTransfers(month: String? = null) = safeApiCall { api.getTransfers(month) }
    suspend fun createTransfer(req: CreateTransferRequest) = safeApiCall { api.createTransfer(req) }
}
