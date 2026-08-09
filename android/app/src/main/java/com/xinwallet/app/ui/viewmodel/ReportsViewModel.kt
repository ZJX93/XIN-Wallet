package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.FinanceReport
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.ReportRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ReportsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    /** 当前已加载的报表；切换周期时先保留旧数据避免闪白 */
    val report: FinanceReport? = null
)

class ReportsViewModel(private val repo: ReportRepository) : ViewModel() {
    private val _state = MutableStateFlow(ReportsUiState(loading = true))
    val state: StateFlow<ReportsUiState> = _state

    fun load(type: String, period: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getReport(type, period)) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, report = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    fun consumeError() { _state.value = _state.value.copy(error = null) }
}
