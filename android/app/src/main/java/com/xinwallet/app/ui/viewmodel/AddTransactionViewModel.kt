package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.Category
import com.xinwallet.app.data.model.CreateTransactionRequest
import com.xinwallet.app.data.model.CreateTransferRequest
import com.xinwallet.app.data.model.IdResponse
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AccountRepository
import com.xinwallet.app.data.repository.CategoryRepository
import com.xinwallet.app.data.repository.TransactionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AddTxUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList()
)

class AddTransactionViewModel(
    private val txRepo: TransactionRepository,
    private val accRepo: AccountRepository,
    private val catRepo: CategoryRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AddTxUiState(loading = true))
    val state: StateFlow<AddTxUiState> = _state

    fun loadOptions() {
        viewModelScope.launch {
            val acc = accRepo.getAccounts()
            val cat = catRepo.getCategories()
            val accList = (acc as? ApiResult.Success)?.data?.accounts ?: emptyList()
            val catList = (cat as? ApiResult.Success)?.data ?: emptyList()
            _state.value = _state.value.copy(loading = false, accounts = accList, categories = catList)
        }
    }

    fun submitExpense(accountId: Int, categoryId: Int, amount: Double, note: String, type: String, date: String) {
        submit { txRepo.createTransaction(CreateTransactionRequest(accountId, categoryId, type, amount, note, "$date 00:00:00")) }
    }

    fun submitTransfer(fromId: Int, toId: Int, amount: Double, note: String, date: String) {
        submit { txRepo.createTransfer(CreateTransferRequest(fromId, toId, amount, note, "$date 00:00:00")) }
    }

    private fun submit(call: suspend () -> ApiResult<IdResponse>) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = call()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, success = true)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }
}
