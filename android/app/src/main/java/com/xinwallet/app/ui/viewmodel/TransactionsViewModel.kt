package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.TransactionItem
import com.xinwallet.app.data.model.TxSummary
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.TransactionRepository
import com.xinwallet.app.util.currentMonth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class TxUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val items: List<TransactionItem> = emptyList(),
    /** 有交易的月份列表（倒序），为空时回退到当前月 */
    val months: List<String> = emptyList(),
    val month: String = currentMonth(),
    /** null = 全部；expense / income / transfer（transfer 由后端匹配两条腿） */
    val typeFilter: String? = null,
    /** 备注 / 分类名关键字搜索 */
    val search: String = "",
    val summary: TxSummary? = null,
    /** 一次性提示（删除成功等） */
    val toast: String? = null
)

class TransactionsViewModel(private val repo: TransactionRepository) : ViewModel() {
    private val _state = MutableStateFlow(TxUiState(loading = true))
    val state: StateFlow<TxUiState> = _state

    /** 账户详情页复用：只按账户拉流水，不关心月份筛选 */
    fun load(month: String? = null, accountId: Int? = null) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getTransactions(month = month, accountId = accountId, limit = 200)) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, items = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    /** 账单页首次进入：拉月份列表 + 当前月流水与汇总 */
    fun init() {
        viewModelScope.launch {
            val monthsResult = repo.getMonths()
            val months = (monthsResult as? ApiResult.Success)?.data.orEmpty()
            val target = months.firstOrNull() ?: currentMonth()
            _state.value = _state.value.copy(months = months, month = target)
            refresh()
        }
    }

    fun selectMonth(month: String) {
        if (month == _state.value.month) return
        _state.value = _state.value.copy(month = month)
        refresh()
    }

    fun selectType(type: String?) {
        if (type == _state.value.typeFilter) return
        _state.value = _state.value.copy(typeFilter = type)
        refresh()
    }

    /** 输入时只改状态不发请求，由 UI 在提交/防抖后调 refresh */
    fun setSearch(text: String) {
        _state.value = _state.value.copy(search = text)
    }

    /** 按当前 month + typeFilter 重新拉取流水与汇总 */
    fun refresh() {
        viewModelScope.launch {
            val s = _state.value
            _state.value = s.copy(loading = true, error = null)
            val listResult = repo.getTransactions(month = s.month, type = s.typeFilter, search = s.search, limit = 300)
            val sumResult = repo.getSummary(s.month)
            val cur = _state.value
            when (listResult) {
                is ApiResult.Success -> _state.value = cur.copy(
                    loading = false,
                    items = listResult.data,
                    summary = (sumResult as? ApiResult.Success)?.data ?: cur.summary
                )
                is ApiResult.Error -> _state.value = cur.copy(loading = false, error = listResult.message)
            }
        }
    }

    /**
     * 删除交易。转账产生的两条记录由后端按 transfer_id 联动删除，
     * 这里删完直接整页刷新，避免本地状态与账本余额不一致。
     */
    fun delete(item: TransactionItem) {
        viewModelScope.launch {
            when (val r = repo.deleteTransaction(item.id)) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(toast = "已删除")
                    refresh()
                }
                is ApiResult.Error -> _state.value = _state.value.copy(error = r.message)
            }
        }
    }

    fun consumeToast() {
        _state.value = _state.value.copy(toast = null)
    }

    fun consumeError() {
        _state.value = _state.value.copy(error = null)
    }
}
