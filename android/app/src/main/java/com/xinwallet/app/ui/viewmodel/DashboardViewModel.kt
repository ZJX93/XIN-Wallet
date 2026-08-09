package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Dashboard
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.DashboardRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val data: Dashboard? = null
)

class DashboardViewModel(private val repo: DashboardRepository) : ViewModel() {
    private val _state = MutableStateFlow(DashboardUiState(loading = true))
    val state: StateFlow<DashboardUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getDashboard()) {
                is ApiResult.Success -> _state.value = DashboardUiState(data = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }
}
