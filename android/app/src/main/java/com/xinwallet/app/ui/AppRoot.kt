package com.xinwallet.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.navigation.MainScaffold
import com.xinwallet.app.ui.screens.AppLockScreen
import com.xinwallet.app.ui.screens.LoginScreen
import com.xinwallet.app.ui.theme.XWalletTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun AppRoot() {
    // null = 启动验证中；true = 已登录进入主界面；false = 未登录/会话失效，显示登录页
    var loggedIn by remember { mutableStateOf<Boolean?>(null) }
    val themeMode by AppContainer.sessionManager.themeModeFlow().collectAsState(initial = "system")

    // —— 应用锁 ——
    // needUnlock：当前是否需要先解锁才能看到主界面。
    // 进入后台（ON_STOP）时若已启用应用锁则重新置位，回到前台再要求输入 PIN。
    var needUnlock by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val session = AppContainer.sessionManager

    suspend fun lockConfigured(): Boolean =
        session.appLockEnabledFlow().first() && session.appLockPinHashFlow().first().isNotBlank()

    LaunchedEffect(Unit) {
        val ok = AppContainer.authRepository.validateSession()
        if (ok) {
            // 登录态有效：拉取账本列表并写入当前账本（供 X-Book-Id 注入与切换 UI 使用）
            try { AppContainer.loadBooks() } catch (_: Exception) { }
        }
        loggedIn = ok
        // 启动时若启用了应用锁 → 先弹解锁页（覆盖在主界面上方，保留其导航状态）
        if (ok && lockConfigured()) {
            needUnlock = true
        }
    }

    // App 退到后台再回来时重新上锁（本次会话内的解锁状态作废）
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_STOP -> {
                    // 退到后台：若启用了应用锁，回来时重新要求解锁
                    scope.launch {
                        if (lockConfigured()) needUnlock = true
                    }
                }
                Lifecycle.Event.ON_START -> {
                    // 回到前台：已登录则主动续期 access token（冷启动有 validateSession，
                    // 但单纯后台返回不会续期；token 过期后首屏请求 401 会导致页面空白/掉登录）。
                    // 续期后再广播 onForeground，让可见页重新拉取数据。
                    if (loggedIn == true) {
                        scope.launch {
                            AppContainer.authRepository.refresh()
                            AppContainer.onForeground.emit(Unit)
                        }
                    }
                }
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
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
            true -> {
                // 主界面 + 应用锁覆盖层：解锁屏盖在主界面上方，解锁后移除，保留导航状态
                Box(Modifier.fillMaxSize()) {
                    MainScaffold(onLogout = { loggedIn = false })
                    if (needUnlock) {
                        AppLockScreen(
                            mode = "Unlock",
                            onUnlocked = { needUnlock = false },
                            onForgotPin = { needUnlock = false; loggedIn = false }
                        )
                    }
                }
            }
            false -> LoginScreen(onLoginSuccess = { loggedIn = true })
        }
    }
}
