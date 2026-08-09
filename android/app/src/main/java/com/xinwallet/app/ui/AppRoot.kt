package com.xinwallet.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
    var themeMode by remember { mutableStateOf("system") }

    LaunchedEffect(Unit) {
        loggedIn = AppContainer.authRepository.hasSession()
        themeMode = AppContainer.sessionManager.themeMode()
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
