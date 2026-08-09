package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.viewmodel.ProfileViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(navController: NavHostController, onLogout: () -> Unit) {
    val vm: ProfileViewModel = viewModel(factory = viewModelFactory {
        ProfileViewModel(AppContainer.sessionManager, AppContainer.authRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var server by remember { mutableStateOf(state.baseUrl) }

    LaunchedEffect(state.baseUrl) { server = state.baseUrl }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); vm.clearMessage() } }

    val themeOptions = listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色")

    Scaffold(topBar = { TopBar("我的") }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text("当前用户", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(4.dp))
                    Text(state.username.ifBlank { "未登录" }, style = MaterialTheme.typography.titleLarge, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle("外观主题")
            SingleChoiceSegmentedButtonRow {
                themeOptions.forEachIndexed { index, (value, label) ->
                    SegmentedButton(selected = state.themeMode == value, onClick = { vm.setTheme(value) }, shape = SegmentedButtonDefaults.itemShape(index, themeOptions.size)) {
                        Text(label)
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            SectionTitle("服务器地址")
            Text(
                "App 直连 NAS 上的 XIN-Wallet 后端，修改后即时生效。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = server,
                onValueChange = { server = it },
                label = { Text("服务器地址") },
                placeholder = { Text("https://your-nas.com:18888/api") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(8.dp))
            Button(onClick = { vm.saveServer(server) }, modifier = Modifier.fillMaxWidth()) {
                Text("保存服务器地址")
            }

            Spacer(Modifier.height(28.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                OutlinedButton(onClick = { vm.logout(); onLogout() }) {
                    Text("退出登录")
                }
            }
        }
    }
}
