package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.TransactionItem
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.TransactionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class TxUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val items: List<TransactionItem> = emptyList()
)

class TransactionsViewModel(private val repo: TransactionRepository) : ViewModel() {
    private val _state = MutableStateFlow(TxUiState(loading = true))
    val state: StateFlow<TxUiState> = _state

    fun load(month: String? = null, accountId: Int? = null) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getTransactions(month = month, accountId = accountId)) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, items = r.data ?: emptyList())
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }
}
