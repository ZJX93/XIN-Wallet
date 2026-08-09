package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.CreateSavingGoalRequest
import com.xinwallet.app.data.model.SavingGoal
import com.xinwallet.app.data.model.SavingsAllocateRequest
import com.xinwallet.app.data.model.SavingsTxnResponse
import com.xinwallet.app.data.model.SavingsWithdrawRequest
import com.xinwallet.app.data.model.UpdateSavingGoalRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AccountRepository
import com.xinwallet.app.data.repository.SavingsGoalRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class SavingsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val goals: List<SavingGoal> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val submitting: Boolean = false,
    val toast: String? = null,
    val formDone: Boolean = false,
    /** 选中目标的存入/取回流水 */
    val txns: SavingsTxnResponse? = null,
    val txnsLoading: Boolean = false
)

class SavingsGoalsViewModel(
    private val repo: SavingsGoalRepository,
    private val accountRepo: AccountRepository
) : ViewModel() {
    private val _state = MutableStateFlow(SavingsUiState(loading = true))
    val state: StateFlow<SavingsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            val goals = repo.getSavingsGoals()
            val accs = accountRepo.getAccounts()
            val goalList = (goals as? ApiResult.Success)?.data ?: emptyList()
            val accList = (accs as? ApiResult.Success)?.data?.accounts ?: emptyList()
            val err = (goals as? ApiResult.Error)?.message ?: (accs as? ApiResult.Error)?.message
            _state.value = _state.value.copy(
                loading = false,
                goals = goalList,
                accounts = accList,
                error = if (goalList.isEmpty() && err != null) err else null
            )
        }
    }

    fun create(req: CreateSavingGoalRequest) = submit("储蓄目标已创建") { repo.createSavingsGoal(req).toUnit() }
    fun update(id: Int, req: UpdateSavingGoalRequest) = submit("储蓄目标已更新") { repo.updateSavingsGoal(id, req) }
    fun delete(id: Int) = submit("目标已删除") { repo.deleteSavingsGoal(id) }

    fun allocate(id: Int, req: SavingsAllocateRequest) = submit("已存入目标") { repo.allocate(id, req) }
    fun withdraw(id: Int, req: SavingsWithdrawRequest) = submit("已取回") { repo.withdraw(id, req) }

    fun loadTxns(id: Int) {
        viewModelScope.launch {
            _state.value = _state.value.copy(txnsLoading = true)
            when (val r = repo.getTxns(id)) {
                is ApiResult.Success -> _state.value = _state.value.copy(txnsLoading = false, txns = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(txnsLoading = false, error = r.message)
            }
        }
    }

    fun clearTxns() { _state.value = _state.value.copy(txns = null) }

    private fun submit(okMessage: String, call: suspend () -> ApiResult<Unit>) {
        viewModelScope.launch {
            _state.value = _state.value.copy(submitting = true, error = null)
            when (val r = call()) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(submitting = false, toast = okMessage, formDone = true)
                    load()
                }
                is ApiResult.Error -> _state.value = _state.value.copy(submitting = false, error = r.message)
            }
        }
    }

    fun consumeToast() { _state.value = _state.value.copy(toast = null) }
    fun consumeError() { _state.value = _state.value.copy(error = null) }
    fun consumeFormDone() { _state.value = _state.value.copy(formDone = false) }
}

private fun <T> ApiResult<T>.toUnit(): ApiResult<Unit> = when (this) {
    is ApiResult.Success -> ApiResult.Success(Unit)
    is ApiResult.Error -> this
}
