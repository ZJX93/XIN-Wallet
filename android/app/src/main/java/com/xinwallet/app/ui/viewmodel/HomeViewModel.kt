package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.CalendarSummary
import com.xinwallet.app.data.model.Dashboard
import com.xinwallet.app.data.model.IncomeExpense
import com.xinwallet.app.data.model.TransactionItem
import com.xinwallet.app.data.model.ApiResponse
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.repository.TransactionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.DecimalFormat

/**
 * 首页数据：仪表盘本月数据 + 今日交易明细 + 日历月汇总
 * - dashboard 仅取 month（本月的收入/支出）
 * - todayBills：今天的交易列表
 * - calendar：当前选中月份的每日汇总
 */
data class HomeUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val dashboard: Dashboard? = null,
    val todayBills: List<TransactionItem> = emptyList(),
    val todayDateStr: String = "",
    val todayIncome: Double = 0.0,
    val todayExpense: Double = 0.0,
    val calendar: CalendarSummary? = null
)

class HomeViewModel(
    private val api: ApiService,
    private val transactionRepository: TransactionRepository
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState(loading = true))
    val state: StateFlow<HomeUiState> = _state

    fun loadDashboard() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.dashboard == null, error = null)
            try {
                val resp = api.getDashboard()
                if (resp.isSuccessful) {
                    val data = (resp.body() as? ApiResponse<Dashboard>)?.data
                    if (data != null) {
                        _state.value = _state.value.copy(dashboard = data, loading = false)
                    } else {
                        _state.value = _state.value.copy(loading = false)
                    }
                } else {
                    _state.value = _state.value.copy(loading = false, error = "加载仪表盘失败 (${resp.code()})")
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "网络异常：${e.message}")
            }
        }
    }

    /** 今日交易：复用 transactionRepository 的 start/end date */
    fun loadTodayBills() {
        viewModelScope.launch {
            val today = com.xinwallet.app.util.todayDate()
            when (val r = transactionRepository.getTransactions(startDate = today, endDate = today, limit = 200)) {
                is ApiResult.Success -> {
                    val list = r.data
                    val df = DecimalFormat("0.00")
                    val income = list.filter { it.type == "income" || it.type == "transfer_in" }.sumOf { it.amount }
                    val expense = list.filter { it.type == "expense" || it.type == "transfer_out" }.sumOf { it.amount }
                    _state.value = _state.value.copy(
                        todayBills = list,
                        todayDateStr = today,
                        todayIncome = income,
                        todayExpense = expense
                    )
                }
                is ApiResult.Error -> _state.value = _state.value.copy(error = r.message)
            }
        }
    }

    fun loadCalendar(year: Int, month: Int) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = _state.value.calendar == null, error = null)
            try {
                val resp = api.getStatsCalendar(year, month)
                if (resp.isSuccessful) {
                    val data = (resp.body() as? ApiResponse<CalendarSummary>)?.data
                    if (data != null) {
                        _state.value = _state.value.copy(
                            calendar = data,
                            loading = false
                        )
                    } else {
                        _state.value = _state.value.copy(loading = false)
                    }
                } else {
                    _state.value = _state.value.copy(loading = false, error = "加载日历失败 (${resp.code()})")
                }
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = "网络异常：${e.message}")
            }
        }
    }
}
