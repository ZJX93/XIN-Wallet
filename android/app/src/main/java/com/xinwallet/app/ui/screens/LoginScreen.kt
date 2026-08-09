package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.viewmodel.LoginViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import kotlinx.coroutines.launch

private fun isPlaceholderUrl(url: String): Boolean =
    url.isBlank() || url.contains("127.0.0.1") || url.contains("localhost")

@Composable
fun LoginScreen(onLoginSuccess: () -> Unit) {
    val vm: LoginViewModel = viewModel(factory = viewModelFactory { LoginViewModel(AppContainer.authRepository) })
    val state by vm.state.collectAsState()
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf("") }
    var showServer by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val saved = AppContainer.normalizeBaseUrl(AppContainer.sessionManager.baseUrl())
        serverUrl = if (isPlaceholderUrl(saved)) "" else saved
        showServer = serverUrl.isBlank()
    }
    LaunchedEffect(state.success) {
        if (state.success) onLoginSuccess()
    }
    LaunchedEffect(state.error) {
        state.error?.let {
            snackbarHostState.showSnackbar(it)
            vm.clearError()
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("鑫钱包", style = MaterialTheme.typography.headlineMedium)
            Text("个人财务管家", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(24.dp))

            if (showServer) {
                OutlinedTextField(
                    value = serverUrl, onValueChange = { serverUrl = it },
                    label = { Text("NAS 服务器地址") },
                    placeholder = { Text("https://your-nas.com:18888/api") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = {
                        val url = AppContainer.normalizeBaseUrl(serverUrl)
                        if (url.isBlank()) {
                            scope.launch { snackbarHostState.showSnackbar("服务器地址不能为空") }
                            return@Button
                        }
                        scope.launch {
                            AppContainer.sessionManager.saveBaseUrl(url)
                            AppContainer.setBaseUrl(url)
                            serverUrl = url
                            showServer = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                ) { Text("保存地址") }
                Spacer(Modifier.height(16.dp))
            } else {
                TextButton(onClick = { showServer = true }) {
                    Text("服务器：${if (serverUrl.isBlank()) "未设置" else serverUrl}（点击修改）")
                }
            }

            OutlinedTextField(value = username, onValueChange = { username = it }, label = { Text("用户名") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = password, onValueChange = { password = it }, label = { Text("密码") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    val url = AppContainer.normalizeBaseUrl(serverUrl)
                    if (url.isBlank()) {
                        showServer = true
                        scope.launch { snackbarHostState.showSnackbar("请先设置服务器地址") }
                        return@Button
                    }
                    AppContainer.setBaseUrl(url)
                    serverUrl = url
                    vm.login(username, password)
                },
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (state.loading) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp) else Text("登录")
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = {
                    val url = AppContainer.normalizeBaseUrl(serverUrl)
                    if (url.isBlank()) {
                        showServer = true
                        scope.launch { snackbarHostState.showSnackbar("请先设置服务器地址") }
                        return@OutlinedButton
                    }
                    AppContainer.setBaseUrl(url)
                    serverUrl = url
                    vm.demoLogin()
                },
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("体验 Demo 账号")
            }
        }
    }
}
