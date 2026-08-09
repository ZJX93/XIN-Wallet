package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.Category
import com.xinwallet.app.data.model.CreateTransactionRequest
import com.xinwallet.app.data.model.CreateTransferRequest
import com.xinwallet.app.data.model.TransactionItem
import com.xinwallet.app.data.model.UpdateTransactionRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AccountRepository
import com.xinwallet.app.data.repository.CategoryRepository
import com.xinwallet.app.data.repository.TransactionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AddTxUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val success: Boolean = false,
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    /** 编辑模式下加载到的原始交易，UI 用它做表单预填 */
    val editing: TransactionItem? = null
)

class AddTransactionViewModel(
    private val txRepo: TransactionRepository,
    private val accRepo: AccountRepository,
    private val catRepo: CategoryRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AddTxUiState(loading = true))
    val state: StateFlow<AddTxUiState> = _state

    /**
     * 加载账户与分类选项。
     * 编辑模式下额外按 month 拉一次流水，从中定位到 editId 对应的交易做预填
     * （后端没有 GET /transactions/:id，用月份过滤的列表定位是最省事且确定的做法）。
     */
    fun loadOptions(editId: Int? = null, month: String? = null) {
        viewModelScope.launch {
            val acc = accRepo.getAccounts()
            val cat = catRepo.getCategories()
            val accList = (acc as? ApiResult.Success)?.data?.accounts ?: emptyList()
            val catList = (cat as? ApiResult.Success)?.data ?: emptyList()

            var editing: TransactionItem? = null
            if (editId != null && editId > 0) {
                val list = txRepo.getTransactions(month = month, limit = 300)
                editing = (list as? ApiResult.Success)?.data?.find { it.id == editId }
            }
            _state.value = _state.value.copy(
                loading = false,
                accounts = accList,
                categories = catList,
                editing = editing,
                error = if (editId != null && editId > 0 && editing == null) "未找到该交易，可能已被删除" else null
            )
        }
    }

    fun submitExpense(accountId: Int, categoryId: Int, amount: Double, note: String, type: String, date: String) {
        submit { txRepo.createTransaction(CreateTransactionRequest(accountId, categoryId, type, amount, note, "$date 00:00:00")).toUnit() }
    }

    fun submitTransfer(fromId: Int, toId: Int, amount: Double, note: String, date: String) {
        submit { txRepo.createTransfer(CreateTransferRequest(fromId, toId, amount, note, "$date 00:00:00")).toUnit() }
    }

    /** 编辑保存：沿用原始时间部分，避免把 12:30 的消费改成 00:00 */
    fun submitEdit(id: Int, accountId: Int, categoryId: Int, amount: Double, note: String, type: String, date: String) {
        val originalTime = _state.value.editing?.date?.substringAfter(' ', "")?.takeIf { it.isNotBlank() } ?: "00:00:00"
        submit { txRepo.updateTransaction(id, UpdateTransactionRequest(accountId, categoryId, type, amount, note, "$date $originalTime")) }
    }

    private fun submit(call: suspend () -> ApiResult<Unit>) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = call()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, success = true)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }
}

private fun <T> ApiResult<T>.toUnit(): ApiResult<Unit> = when (this) {
    is ApiResult.Success -> ApiResult.Success(Unit)
    is ApiResult.Error -> this
}
