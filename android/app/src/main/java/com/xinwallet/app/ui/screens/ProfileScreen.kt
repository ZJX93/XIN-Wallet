package com.xinwallet.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.BuildConfig
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.viewmodel.AccountsViewModel
import com.xinwallet.app.ui.viewmodel.CsvViewModel
import com.xinwallet.app.ui.viewmodel.ProfileViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDate
import java.io.File
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(navController: NavHostController, onLogout: () -> Unit) {
    val vm: ProfileViewModel = viewModel(factory = viewModelFactory {
        ProfileViewModel(AppContainer.sessionManager, AppContainer.authRepository)
    })
    val csvVm: CsvViewModel = viewModel(factory = viewModelFactory { CsvViewModel(AppContainer.csvRepository) })
    val state by vm.state.collectAsState()
    val csvState by csvVm.state.collectAsState()
    val accVm: AccountsViewModel = viewModel(factory = viewModelFactory { AccountsViewModel(AppContainer.accountRepository) })
    val accState by accVm.state.collectAsState()
    val updateState by vm.updateState.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var server by remember { mutableStateOf(state.baseUrl) }

    LaunchedEffect(state.baseUrl) { server = state.baseUrl }
    LaunchedEffect(state.message) { state.message?.let { snackbar.showSnackbar(it); vm.clearMessage() } }
    LaunchedEffect(csvState.toast) { csvState.toast?.let { snackbar.showSnackbar(it); csvVm.consumeToast() } }
    LaunchedEffect(csvState.error) { csvState.error?.let { snackbar.showSnackbar(it); csvVm.consumeError() } }
    LaunchedEffect(Unit) { accVm.load() }
    // 进入「我的」页自动检查一次新版本（ViewModel 内部已防止并发重复检查）
    LaunchedEffect(Unit) { vm.checkUpdate(BuildConfig.VERSION_NAME) }

    /** 调起系统安装器安装本地 APK（通过 FileProvider 暴露，避免 file:// 暴露崩溃） */
    fun installApk(ctx: Context, path: String?) {
        if (path == null) return
        val file = File(path)
        if (!file.exists()) { scope.launch { snackbar.showSnackbar("安装包不存在，请重新下载") }; return }
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            ctx.startActivity(intent)
        } catch (e: Exception) {
            scope.launch { snackbar.showSnackbar("无法调起安装器：${e.message}") }
        }
    }

    /** 跳转系统「未知来源应用」设置页，引导用户手动开启本应用的安装权限 */
    fun openUnknownSourcesSettings(ctx: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${ctx.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                ctx.startActivity(intent)
            } catch (e: Exception) {
                scope.launch { snackbar.showSnackbar("请到系统设置开启「未知来源」安装权限") }
            }
        }
    }

    /** 请求「安装未知应用」权限；Oreo 以下无此权限，直接尝试安装 */
    val requestInstallPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) installApk(context, updateState.localApkPath)
        else openUnknownSourcesSettings(context)
    }

    /** 一键升级：已下载则直接安装；Oreo+ 先确认安装权限 */
    fun startInstall() {
        val path = updateState.localApkPath ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.REQUEST_INSTALL_PACKAGES)
                == PackageManager.PERMISSION_GRANTED
            ) {
                installApk(context, path)
            } else {
                requestInstallPermission.launch(Manifest.permission.REQUEST_INSTALL_PACKAGES)
            }
        } else {
            installApk(context, path)
        }
    }

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
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
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
            SectionTitle("资产账户")
            BalanceCard(
                title = "总资产",
                amount = accState.totalAssets,
                subtitle = "点击查看与管理账户",
                modifier = Modifier.padding(bottom = 12.dp),
                onClick = { navController.navigate(Screen.Accounts.route) }
            )

            Spacer(Modifier.height(20.dp))
            SectionTitle("报表中心")
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    SettingRow(
                        icon = Icons.Filled.BarChart,
                        label = "报表中心",
                        sub = "收支趋势 / 资产负债表",
                        onClick = { navController.navigate(Screen.Reports.route) }
                    )
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
            SectionTitle("应用更新")
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.SystemUpdate, "升级", tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text("检查更新", style = MaterialTheme.typography.bodyLarge)
                            Text(
                                when {
                                    updateState.checking -> "正在检查新版本…"
                                    updateState.error != null -> "检查失败：${updateState.error}"
                                    updateState.latestVersion.isNotBlank() && !updateState.hasUpdate ->
                                        "已是最新（v${updateState.latestVersion}）"
                                    updateState.hasUpdate -> "发现新版本 v${updateState.latestVersion}"
                                    else -> "当前 v${BuildConfig.VERSION_NAME}"
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (updateState.checking) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        }
                    }

                    Spacer(Modifier.height(12.dp))
                    when {
                        updateState.downloading -> {
                            LinearProgressIndicator(
                                progress = { updateState.progress / 100f },
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "下载中 ${updateState.progress}%",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        updateState.localApkPath != null -> {
                            Button(onClick = { startInstall() }, modifier = Modifier.fillMaxWidth()) {
                                Text("安装更新包")
                            }
                        }
                        updateState.hasUpdate -> {
                            Button(onClick = { vm.downloadUpdate(context) }, modifier = Modifier.fillMaxWidth()) {
                                Text("下载并安装 v${updateState.latestVersion}")
                            }
                        }
                        else -> {
                            OutlinedButton(
                                onClick = { vm.checkUpdate(BuildConfig.VERSION_NAME) },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !updateState.checking
                            ) {
                                Text(if (updateState.checking) "检查中…" else "检查更新")
                            }
                        }
                    }
                    if (updateState.error != null) {
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = { vm.consumeUpdateError(); vm.checkUpdate(BuildConfig.VERSION_NAME) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("重试")
                        }
                    }
                }
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
