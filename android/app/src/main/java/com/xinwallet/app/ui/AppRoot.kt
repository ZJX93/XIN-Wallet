package com.xinwallet.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.navigation.MainScaffold
import com.xinwallet.app.ui.screens.LoginScreen
import com.xinwallet.app.ui.theme.XWalletTheme

@Composable
fun AppRoot() {
    // null = 启动验证中；true = 已登录进入主界面；false = 未登录/会话失效，显示登录页
    var loggedIn by remember { mutableStateOf<Boolean?>(null) }
    val themeMode by AppContainer.sessionManager.themeModeFlow().collectAsState(initial = "system")

    LaunchedEffect(Unit) {
        loggedIn = AppContainer.authRepository.validateSession()
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
        when (loggedIn) {
            null -> {
                // 启动验证中：避免已过期 token 直接进首页造成卡 loading
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
            }
            true -> MainScaffold(onLogout = { loggedIn = false })
            false -> LoginScreen(onLoginSuccess = { loggedIn = true })
        }
    }
}
