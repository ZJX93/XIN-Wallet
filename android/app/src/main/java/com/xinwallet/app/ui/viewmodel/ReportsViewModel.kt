package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.FinanceReport
import com.xinwallet.app.data.model.TopTransaction
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.ReportRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * 统计页状态。
 * - dataType: 当前查看维度 = expense(支出) / income(收入) / balance(结余)，默认支出。
 * - period: 锁月，格式 YYYY-MM。
 * - report: 当月完整报表（由 /reports 获取，切换 dataType 不重拉）。
 * - topTransactions: 当前 dataType 的 Top5 交易（由 /reports/top-transactions 获取）。
 */
data class ReportsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    /** 当前选中周期：按月="YYYY-MM"，按年="YYYY"，自定义="YYYY-MM-DD~YYYY-MM-DD" */
    val period: String = currentMonth(),
    /** 时间维度："month"(按月) / "year"(按年) / "custom"(自定义) */
    val periodMode: String = "month",
    val dataType: String = "expense",
    val report: FinanceReport? = null,
    val topTransactions: List<TopTransaction> = emptyList()
)

fun currentMonth(): String {
    val c = Calendar.getInstance()
    return String.format(Locale.CHINA, "%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
}

fun shiftMonth(period: String, delta: Int): String {
    val m = Regex("(\\d{4})-(\\d{2})").find(period)
    val y = m?.groupValues?.get(1)?.toInt() ?: Calendar.getInstance().get(Calendar.YEAR)
    val mo = m?.groupValues?.get(2)?.toInt() ?: 1
    val c = Calendar.getInstance().apply { set(y, mo - 1, 1); add(Calendar.MONTH, delta) }
    return String.format(Locale.CHINA, "%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
}

class ReportsViewModel(private val repo: ReportRepository) : ViewModel() {
    private val _state = MutableStateFlow(ReportsUiState(loading = true))
    val state: StateFlow<ReportsUiState> = _state

    init { loadReport() }

    /** 账本切换后重新拉取报表（X-Book-Id 由 AuthInterceptor 注入，后端按当前账本隔离） */
    fun reload() {
        loadReport()
    }

    fun setPeriod(period: String) {
        if (period == _state.value.period) return
        _state.value = _state.value.copy(period = period)
        loadReport()
    }

    /** 切换时间维度：按月 / 按年 / 自定义。切换后自动将 period 截取为对应精度并刷新 */
    fun setPeriodMode(mode: String) {
        if (mode == _state.value.periodMode) return
        val s = _state.value
        val newPeriod = when (mode) {
            "year" -> s.period.take(4)           // "2026-08" → "2026"
            "custom" -> s.period                  // 自定义保持原值（由选择器设置完整范围）
            else -> {
                // 年→月：补当前月
                val m = s.period
                if (m.length == 4) "$m-${currentMonth().substring(5)}" else m
            }
        }
        _state.value = s.copy(periodMode = mode, period = newPeriod)
        loadReport()
    }

    fun setDataType(type: String) {
        if (type == _state.value.dataType) return
        _state.value = _state.value.copy(dataType = type)
        if (type != "balance") loadTopTransactions(type)
    }

    private fun loadReport() {
        val s = _state.value
        // 根据时间维度选择报表粒度：后端 /reports 接口支持 monthly/yearly/custom
        val granularity = when (s.periodMode) {
            "year" -> "yearly"
            "custom" -> "custom"
            else -> "monthly"
        }
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getReport(granularity, s.period)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(loading = false, report = r.data)
                    if (_state.value.dataType != "balance") loadTopTransactions(_state.value.dataType)
                }
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    /** Top5 交易：仅支出/收入维度需要；余额维度不展示单笔排行 */
    private fun loadTopTransactions(type: String) {
        val period = _state.value.period
        viewModelScope.launch {
            when (val r = repo.getTopTransactions(type, period)) {
                is ApiResult.Success -> _state.value = _state.value.copy(topTransactions = r.data.items)
                is ApiResult.Error -> { /* Top5 为增强信息，失败静默，不影响主报表 */ }
            }
        }
    }

    fun consumeError() { _state.value = _state.value.copy(error = null) }
}
