package com.xinwallet.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.navigation.MainScaffold
import com.xinwallet.app.ui.screens.LoginScreen
import com.xinwallet.app.ui.theme.XWalletTheme

@Composable
fun AppRoot() {
    var loggedIn by remember { mutableStateOf(false) }
    val themeMode by AppContainer.sessionManager.themeModeFlow().collectAsState(initial = "system")

    LaunchedEffect(Unit) {
        loggedIn = AppContainer.authRepository.hasSession()
    }

    // 认证过期全局监听：AuthInterceptor 在 401 且刷新失败时发射，自动回到登录页
    LaunchedEffect(Unit) {
        AppContainer.authExpired.collect { loggedIn = false }
    }

    val darkTheme = when (themeMode) {
        "dark" -> true
        "light" -> false
        else -> isSystemInDarkTheme()
    }

    XWalletTheme(darkTheme = darkTheme) {
        if (loggedIn) {
            MainScaffold(onLogout = { loggedIn = false })
        } else {
            LoginScreen(onLoginSuccess = { loggedIn = true })
        }
    }
}
