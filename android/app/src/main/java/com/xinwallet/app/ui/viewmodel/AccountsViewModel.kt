package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.CreateAccountRequest
import com.xinwallet.app.data.model.UpdateAccountRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.AccountRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AccountsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val accounts: List<Account> = emptyList(),
    val totalAssets: Double = 0.0,
    /** 提交中（新增/编辑/销户/删除），用于禁用弹窗按钮 */
    val submitting: Boolean = false,
    val toast: String? = null,
    /** 表单提交成功一次性信号，UI 收到后关闭弹窗 */
    val formDone: Boolean = false
)

class AccountsViewModel(private val repo: AccountRepository) : ViewModel() {
    private val _state = MutableStateFlow(AccountsUiState(loading = true))
    val state: StateFlow<AccountsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getAccounts()) {
                is ApiResult.Success -> _state.value = _state.value.copy(
                    loading = false,
                    error = null,
                    accounts = r.data.accounts,
                    totalAssets = r.data.totalAssets
                )
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    fun create(req: CreateAccountRequest) = submit("账户已创建") { repo.createAccount(req).toUnit() }

    fun update(id: Int, req: UpdateAccountRequest) = submit("账户已更新") { repo.updateAccount(id, req) }

    /** 销户：保留历史流水，账户置为 closed 不再参与总资产 */
    fun close(id: Int) = submit("账户已销户") { repo.closeAccount(id) }

    /** 彻底删除：后端会校验是否存在关联流水，有则报错 */
    fun delete(id: Int) = submit("账户已删除") { repo.deleteAccount(id) }

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

/** 忽略返回体只关心成败，便于把不同返回类型的调用塞进同一个 submit 流程 */
private fun <T> ApiResult<T>.toUnit(): ApiResult<Unit> = when (this) {
    is ApiResult.Success -> ApiResult.Success(Unit)
    is ApiResult.Error -> this
}
