package com.xinwallet.app.ui.screens

import android.content.Intent
import android.os.Environment
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.viewmodel.CsvViewModel
import com.xinwallet.app.ui.viewmodel.ProfileViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDate
import java.io.File
import kotlinx.coroutines.launch
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.Upload

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(navController: NavHostController, onLogout: () -> Unit) {
    val vm: ProfileViewModel = viewModel(factory = viewModelFactory {
        ProfileViewModel(AppContainer.sessionManager, AppContainer.authRepository)
    })
    val csvVm: CsvViewModel = viewModel(factory = viewModelFactory { CsvViewModel(AppContainer.csvRepository) })
    val state by vm.state.collectAsState()
    val csvState by csvVm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(state.baseUrl) }

    LaunchedEffect(state.baseUrl) { server = state.baseUrl }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); vm.clearMessage() } }
    LaunchedEffect(csvState.toast) { csvState.toast?.let { snackbar.showSnackbar(it); csvVm.consumeToast() } }
    LaunchedEffect(csvState.error) { csvState.error?.let { snackbar.showSnackbar(it); csvVm.consumeError() } }

    val pickCsv = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        try {
            val text = context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText().orEmpty()
            if (text.isBlank()) { scope.launch { snackbar.showSnackbar("文件为空") }; return@rememberLauncherForActivityResult }
            csvVm.importCsv("transactions", text)
        } catch (e: Exception) {
            scope.launch { snackbar.showSnackbar("读取失败：${e.message}") }
        }
    }

    /** 把纯文本写进本机 Download 目录，并通过 FileProvider 调起系统分享/保存 */
    fun shareTextFile(content: String, baseName: String, mime: String, ext: String) {
        try {
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: throw IllegalStateException("无法访问本机存储")
            val file = File(dir, "${baseName}_${todayDate()}.$ext")
            file.writeText(content)
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(intent, "分享导出文件"))
            scope.launch { snackbar.showSnackbar("已导出：${file.name}") }
        } catch (e: Exception) {
            scope.launch { snackbar.showSnackbar("导出失败：${e.message}") }
        }
    }

    val themeOptions = listOf("system" to "跟随系统", "light" to "浅色", "dark" to "深色")
    val busy = csvState.busy

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
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                themeOptions.forEachIndexed { index, (value, label) ->
                    SegmentedButton(
                        selected = state.themeMode == value,
                        onClick = { vm.setTheme(value) },
                        shape = SegmentedButtonDefaults.itemShape(index, themeOptions.size),
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            activeContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            inactiveContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                            inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
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

            Spacer(Modifier.height(24.dp))
            SectionTitle("数据管理")
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    SettingRow(
                        icon = Icons.Filled.Sell,
                        label = "标签管理",
                        sub = "分类与自定义标记",
                        onClick = { navController.navigate(Screen.Tags.route) }
                    )
                    HorizontalDivider()
                    SettingRow(
                        icon = Icons.Filled.Download,
                        label = "导出交易 CSV",
                        sub = "导出为本机 CSV 文件",
                        busy = busy,
                        onClick = { csvVm.exportCsv("transactions") { shareTextFile(it, "xinwallet_transactions", "text/csv", "csv") } }
                    )
                    HorizontalDivider()
                    SettingRow(
                        icon = Icons.Filled.Upload,
                        label = "导入交易 CSV",
                        sub = "从本机文件批量导入",
                        busy = busy,
                        onClick = { pickCsv.launch("*/*") }
                    )
                    HorizontalDivider()
                    SettingRow(
                        icon = Icons.Filled.Description,
                        label = "导出完整账本 JSON",
                        sub = "含账户 / 交易 / 标签",
                        busy = busy,
                        onClick = { csvVm.exportFull { shareTextFile(it, "xinwallet_full", "application/json", "json") } }
                    )
                }
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

@Composable
private fun SettingRow(
    icon: ImageVector,
    label: String,
    sub: String,
    onClick: () -> Unit,
    busy: Boolean = false
) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !busy, onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, label, tint = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyLarge)
            Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
    }
}
