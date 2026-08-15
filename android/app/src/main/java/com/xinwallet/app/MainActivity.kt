package com.xinwallet.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
}
