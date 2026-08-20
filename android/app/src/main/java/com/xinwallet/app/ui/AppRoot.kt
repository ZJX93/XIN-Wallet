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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
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

    // —— 应用锁：仅「用户主动离开 App」时上锁 ——
    // 关键：不能用任何 Lifecycle 的 ON_STOP 判断「退后台」。
    //   · LocalLifecycleOwner（Activity 级）：打开系统相册/分享/系统对话框会让当前
    //     Activity 走到 ON_STOP，但 App 实际仍在交互 → 误上锁。
    //   · ProcessLifecycleOwner（应用级）：只在「所有本 App Activity 不可见」时触发
    //     ON_STOP；而打开系统相册（独立进程）时本 App 的所有 Activity 确实都不可见了
    //     → 同样会误上锁，它只防得住「自己 Activity 间快速跳转」，防不住跨进程跳转。
    // 正确信号是 onUserLeaveHint：仅在用户主动按 HOME / 最近任务键离开 App 时触发
    // （MainActivity 捕获后通过 AppContainer.userLeaveHint 广播），通过 Intent 启动系统
    // 相册等内容**不会**触发，因此从相册返回不会要求重新输 PIN。
    LaunchedEffect(Unit) {
        AppContainer.userLeaveHint.collect {
            if (lockConfigured()) needUnlock = true
        }
    }

    // 回到前台：续期 token + 广播 onForeground（让可见页重新拉数据）。
    // 用 ProcessLifecycleOwner 的 ON_START（应用回到前台才触发），此回调只做续期，与上锁解耦。
    val processLifecycleOwner = remember { ProcessLifecycleOwner.get() }
    DisposableEffect(processLifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) {
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
        }
        processLifecycleOwner.lifecycle.addObserver(observer)
        onDispose { processLifecycleOwner.lifecycle.removeObserver(observer) }
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
