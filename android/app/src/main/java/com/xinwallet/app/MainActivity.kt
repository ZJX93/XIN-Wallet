package com.xinwallet.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.AppRoot

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // 启用 edge-to-edge：让系统状态栏/手势栏透明 + App 内容延伸到屏幕边缘，
        // 这样 bottomBar 64dp 才能精确占位（不被系统栏 inset 撑成 ~104dp），
        // 参考 com.miaoa.cola 干净底栏效果。
        // TopBar 组件已有 statusBarsPadding() 自适配，Scaffold 配 contentWindowInsets=0 不再加 inset。
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            AppRoot()
        }
    }

    /**
     * 用户主动离开 App（按 HOME / 最近任务键）时回调。
     * 注意：通过 Intent 启动系统相册/分享/系统对话框不会触发本方法（那不是"用户离开 App"），
     * 所以应用锁用它判断，从系统选择器返回不会误上锁。
     * 来电等少数场景也会触发，属可接受的边界情况。
     */
    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        AppContainer.userLeaveHint.tryEmit(Unit)
    }
}
