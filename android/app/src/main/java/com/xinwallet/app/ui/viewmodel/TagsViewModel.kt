package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.model.CreateTagRequest
import com.xinwallet.app.data.model.Tag
import com.xinwallet.app.data.model.UpdateTagRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.repository.TagRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class TagsUiState(
    val loading: Boolean = false,
    val error: String? = null,
    val tags: List<Tag> = emptyList(),
    /** 编辑中的标签；null 表示对话框关闭；id=0 表示新建 */
    val editing: Tag? = null,
    val submitting: Boolean = false,
    val toast: String? = null
)

class TagsViewModel(private val repo: TagRepository) : ViewModel() {
    private val _state = MutableStateFlow(TagsUiState(loading = true))
    val state: StateFlow<TagsUiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value =(copyLoading())
            when (val r = repo.getTags()) {
                is ApiResult.Success -> _state.value = _state.value.copy(loading = false, error = null, tags = r.data)
                is ApiResult.Error -> _state.value = _state.value.copy(loading = false, error = r.message)
            }
        }
    }

    private fun copyLoading() = _state.value.copy(loading = true, error = null)

    fun openNew() { _state.value = _state.value.copy(editing = Tag()) }
    fun openEdit(tag: Tag) { _state.value = _state.value.copy(editing = tag) }
    fun closeDialog() { _state.value = _state.value.copy(editing = null) }

    fun save(name: String, color: String, icon: String) {
        val editing = _state.value.editing ?: return
        val trimmed = name.trim()
        if (trimmed.isBlank()) { _state.value = _state.value.copy(error = "标签名不能为空"); return }
        viewModelScope.launch {
            _state.value = _state.value.copy(submitting = true, error = null)
            val result = if (editing.id == 0) {
                repo.create(CreateTagRequest(trimmed, color, icon))
            } else {
                repo.update(editing.id, UpdateTagRequest(trimmed, color, icon))
            }
            when (result) {
                is ApiResult.Success -> {
                    _state.value = _state.value.copy(submitting = false, editing = null, toast = if (editing.id == 0) "标签已创建" else "标签已更新")
                    load()
                }
                is ApiResult.Error -> _state.value = _state.value.copy(submitting = false, error = result.message)
            }
        }
    }

    fun delete(tag: Tag) {
        viewModelScope.launch {
            when (val r = repo.delete(tag.id)) {
                is ApiResult.Success -> { _state.value = _state.value.copy(toast = "标签已删除"); load() }
                is ApiResult.Error -> _state.value = _state.value.copy(error = r.message)
            }
        }
    }

    fun consumeToast() { _state.value = _state.value.copy(toast = null) }
    fun consumeError() { _state.value = _state.value.copy(error = null) }
}
