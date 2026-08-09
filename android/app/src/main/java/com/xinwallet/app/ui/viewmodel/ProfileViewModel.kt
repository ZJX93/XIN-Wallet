package com.xinwallet.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.repository.AuthRepository
import com.xinwallet.app.di.AppContainer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ProfileUiState(
    val themeMode: String = "system",
    val baseUrl: String = "",
    val username: String = "",
    val message: String? = null
)

class ProfileViewModel(
    private val session: SessionManager,
    private val authRepo: AuthRepository
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    init {
        viewModelScope.launch {
            _state.value = ProfileUiState(
                themeMode = session.themeMode(),
                baseUrl = session.baseUrl(),
                username = session.username()
            )
        }
    }

    fun setTheme(mode: String) {
        viewModelScope.launch {
            session.saveTheme(mode)
            _state.value = _state.value.copy(themeMode = mode)
        }
    }

    fun saveServer(url: String) {
        viewModelScope.launch {
            val fixed = if (url.isBlank()) "http://127.0.0.1:18888/api/" else url.trim()
            session.saveBaseUrl(fixed)
            AppContainer.setBaseUrl(fixed)
            _state.value = _state.value.copy(baseUrl = fixed, message = "服务器地址已保存")
        }
    }

    fun clearMessage() {
        _state.value = _state.value.copy(message = null)
    }

    fun logout() {
        viewModelScope.launch { authRepo.logout() }
    }
}
