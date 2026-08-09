package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Budget
import com.xinwallet.app.data.model.CreateBudgetRequest
import com.xinwallet.app.data.model.UpdateBudgetRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.BudgetRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class BudgetsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val budgets: List<Budget> = emptyList(),
    val submitting: Boolean = false,
    val toast: String? = null,
    val formDone: Boolean = false
)

class BudgetsViewModel(private val repo: BudgetRepository) : ViewModel() {
    private val _state = MutableStateFlow(BudgetsUiState(loading = true))
    val state: StateFlow<BudgetsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getBudgets()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, error = null, budgets = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    fun create(req: CreateBudgetRequest) = submit("预算已设置") { repo.createBudget(req).toUnit() }
    fun update(id: Int, req: UpdateBudgetRequest) = submit("预算已更新") { repo.updateBudget(id, req) }

    fun delete(id: Int) = submit("预算已删除") { repo.deleteBudget(id) }

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
