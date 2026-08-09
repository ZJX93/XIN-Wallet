package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.CsvRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class CsvUiState(
    val busy: Boolean = false,
    val toast: String? = null,
    val error: String? = null
)

/**
 * 数据导入导出：导出交易 CSV / 完整账本 JSON（纯文本，落盘与分享在 composable 完成），
 * 导入交易 CSV。网络结果通过回调 / 状态向外暴露，文件读写不放进 ViewModel（避免持有 Android 上下文）。
 */
class CsvViewModel(private val repo: CsvRepository) : ViewModel() {
    private val _state = MutableStateFlow(CsvUiState())
    val state: StateFlow<CsvUiState> = _state

    fun exportCsv(type: String, onText: (String) -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            when (val r = repo.exportCsv(type)) {
                is ApiResult.Success -> { _state.value = _state.value.copy(busy = false); onText(r.data) }
                is ApiResult.Error -> _state.value = _state.value.copy(busy = false, error = r.message)
            }
        }
    }

    fun exportFull(onText: (String) -> Unit) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            when (val r = repo.exportFull()) {
                is ApiResult.Success -> { _state.value = _state.value.copy(busy = false); onText(r.data) }
                is ApiResult.Error -> _state.value = _state.value.copy(busy = false, error = r.message)
            }
        }
    }

    fun importCsv(type: String, csv: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(busy = true, error = null)
            when (val r = repo.importCsv(type, csv)) {
                is ApiResult.Success -> {
                    val d = r.data
                    val msg = buildString {
                        append("导入成功：新增 ${d.imported} 条")
                        if (d.errors.isNotEmpty()) append("，跳过 ${d.errors.size} 条")
                    }
                    _state.value = _state.value.copy(busy = false, toast = msg)
                }
                is ApiResult.Error -> _state.value = _state.value.copy(busy = false, error = r.message)
            }
        }
    }

    fun consumeToast() { _state.value = _state.value.copy(toast = null) }
    fun consumeError() { _state.value = _state.value.copy(error = null) }
}
