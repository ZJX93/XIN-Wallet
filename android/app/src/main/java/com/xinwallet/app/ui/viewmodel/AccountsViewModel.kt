package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AccountRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AccountsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val accounts: List<Account> = emptyList(),
    val totalAssets: Double = 0.0
)

class AccountsViewModel(private val repo: AccountRepository) : ViewModel() {
    private val _state = MutableStateFlow(AccountsUiState(loading = true))
    val state: StateFlow<AccountsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getAccounts()) {
                is ApiResult.Success -> {
                    val d = r.data
                    _state.value = AccountsUiState(
                        accounts = d?.accounts ?: emptyList(),
                        totalAssets = d?.totalAssets ?: 0.0
                    )
                }
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }
}
