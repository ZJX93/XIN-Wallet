package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateTransactionRequest
import com.xinwallet.app.data.model.CreateTransferRequest
import com.xinwallet.app.data.model.UpdateTransactionRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class TransactionRepository(private val apiProvider: () -> ApiService) {
    suspend fun getTransactions(
        month: String? = null,
        type: String? = null,
        accountId: Int? = null,
        search: String? = null,
        limit: Int = 50
    ) = safeApiCall { apiProvider().getTransactions(month, type, accountId, search?.takeIf { it.isNotBlank() }, limit) }

    suspend fun createTransaction(req: CreateTransactionRequest) = safeApiCall { apiProvider().createTransaction(req) }
    suspend fun updateTransaction(id: Int, req: UpdateTransactionRequest) = safeUnitCall { apiProvider().updateTransaction(id, req) }
    suspend fun deleteTransaction(id: Int) = safeUnitCall { apiProvider().deleteTransaction(id) }

    suspend fun getMonths() = safeApiCall { apiProvider().getTransactionMonths() }
    suspend fun getSummary(month: String) = safeApiCall { apiProvider().getTransactionSummary(month) }

    suspend fun getTransfers(month: String? = null) = safeApiCall { apiProvider().getTransfers(month) }
    suspend fun createTransfer(req: CreateTransferRequest) = safeApiCall { apiProvider().createTransfer(req) }
    suspend fun deleteTransfer(id: Int) = safeUnitCall { apiProvider().deleteTransfer(id) }
}
