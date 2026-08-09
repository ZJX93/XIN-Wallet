package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Investment
import com.xinwallet.app.data.model.InvestmentType
import com.xinwallet.app.data.model.PortfolioSummary
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.InvestmentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class InvUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val investments: List<Investment> = emptyList(),
    val summary: PortfolioSummary? = null,
    val types: List<InvestmentType> = emptyList()
)

class InvestmentsViewModel(private val invRepo: InvestmentRepository) : ViewModel() {
    private val _state = MutableStateFlow(InvUiState(loading = true))
    val state: StateFlow<InvUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            val inv = invRepo.getInvestments()
            val types = invRepo.getTypes()
            val invList = (inv as? ApiResult.Success)?.data?.investments ?: emptyList()
            val sum = (inv as? ApiResult.Success)?.data?.summary
            val typeList = (types as? ApiResult.Success)?.data ?: emptyList()
            _state.value = _state.value.copy(loading = false, investments = invList, summary = sum, types = typeList)
        }
    }
}
