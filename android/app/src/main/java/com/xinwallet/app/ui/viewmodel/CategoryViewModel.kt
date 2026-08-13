package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.Category
import com.xinwallet.app.data.model.CreateCategoryRequest
import com.xinwallet.app.data.model.UpdateCategoryRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.CategoryRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class CategoryUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val categories: List<Category> = emptyList(),
    /** 编辑中的分类；null 表示对话框关闭；id=0 表示新建 */
    val editing: Category? = null,
    val submitting: Boolean = false,
    val toast: String? = null
)

class CategoryViewModel(private val repo: CategoryRepository) : ViewModel() {
    private val _state = MutableStateFlow(CategoryUiState(loading = true))
    val state: StateFlow<CategoryUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            when (val r = repo.getCategories()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, error = null, categories = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    fun openNew() { _state.value = _state.value.copy(editing = Category()) }
    fun openEdit(cat: Category) { _state.value = _state.value.copy(editing = cat) }
    fun closeDialog() { _state.value = _state.value.copy(editing = null) }

    fun save(name: String, type: String, icon: String, color: String) {
        val editing = _state.value.editing ?: return
        val trimmed = name.trim()
        if (trimmed.isBlank()) { _state.value = _state.value.copy(error = "分类名不能为空"); return }
        if (type.isBlank()) { _state.value = _state.value.copy(error = "请选择分类类型"); return }
        viewModelScope.launch {
            _state.value = _state.value.copy(submitting = true, error = null)
            val result = if (editing.id == 0) {
                repo.create(CreateCategoryRequest(trimmed, type, icon, color))
            } else {
                repo.update(editing.id, UpdateCategoryRequest(trimmed, type, icon, color))
            }
            when (result) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(submitting = false, editing = null, toast = if (editing.id == 0) "分类已创建" else "分类已更新")
                    load()
                }
                is ApiResult.Error -> _state.value = _state.value.copy(submitting = false, error = result.message)
            }
        }
    }

    fun delete(cat: Category) {
        viewModelScope.launch {
            when (val r = repo.delete(cat.id)) {
                is ApiResult.Success -> { _state.value = _state.value.copy(toast = "分类已删除"); load() }
                is ApiResult.Error -> _state.value = _state.value.copy(error = r.message)
            }
        }
    }

    fun consumeToast() { _state.value = _state.value.copy(toast = null) }
    fun consumeError() { _state.value = _state.value.copy(error = null) }
}
