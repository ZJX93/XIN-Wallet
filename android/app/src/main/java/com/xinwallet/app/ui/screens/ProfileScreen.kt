package com.xinwallet.app.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.app.AppOpsManager
import android.content.pm.PackageManager
import com.xinwallet.app.data.repository.ApkVerifier
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.content.ClipData
import android.content.ClipboardManager
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material.icons.filled.Upload
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
import com.xinwallet.app.ui.viewmodel.AccountsViewModel
import com.xinwallet.app.ui.viewmodel.CsvViewModel
import com.xinwallet.app.ui.viewmodel.ProfileViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDate
import java.io.File
import kotlinx.coroutines.launch

/**
 * 「我的」页 — 参考暖棕记账 app 改版
 * 1) 头像 + 昵称 + 编辑 + 陪伴天数
 * 2) 12 宫格快捷入口（暖棕淡填充 + 线性图标）
 * 3) 设置列表（关于我们）
 * 4) 高级（服务器地址 / 应用更新 / 数据管理 / 外观主题 / 退出登录）
 */
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
    LaunchedEffect(Unit) { vm.checkUpdate(BuildConfig.VERSION_NAME) }

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

    fun canInstallPackages(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            appOps.unsafeCheckOpNoThrow(
                "android:request_install_packages",
                android.os.Process.myUid(),
                ctx.packageName
            ) == AppOpsManager.MODE_ALLOWED
        } else {
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.REQUEST_INSTALL_PACKAGES) ==
                PackageManager.PERMISSION_GRANTED
        }
    }

    fun startInstall() {
        val path = updateState.localApkPath ?: return
        val result = ApkVerifier.verifyApk(context, File(path))
        if (!result.ok) {
            scope.launch { snackbar.showSnackbar(result.reason ?: "安装包校验失败") }
            return
        }
        if (canInstallPackages(context)) {
            installApk(context, path)
        } else {
            openUnknownSourcesSettings(context)
            scope.launch { snackbar.showSnackbar("请先在设置中开启「允许安装未知应用」，再返回点击安装") }
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
    val firstChar = state.username.firstOrNull()?.toString()?.uppercase() ?: "U"
    val memberDays = state.memberDays.coerceAtLeast(0)

    Scaffold(
        topBar = { TopBar("我的") },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
        ) {
            Spacer(Modifier.height(8.dp))

            // 1) 头像 + 昵称 + 编辑
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    Modifier.size(56.dp).clip(CircleShape).background(Brown100),
                    contentAlignment = Alignment.Center
                ) {
                    Text(firstChar, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = Brown500)
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            state.username.ifBlank { "未登录" },
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.width(6.dp))
                        Icon(Icons.Filled.Edit, contentDescription = "编辑昵称", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(16.dp))
                    }
                    Spacer(Modifier.height(2.dp))
                    Text(
                        if (memberDays > 0) "已经记账 $memberDays 天" else "今天开始记录吧",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // 2) 12 宫格快捷入口
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(Modifier.padding(vertical = 12.dp)) {
                    val items = listOf(
                        QuickAction("截图记账", Icons.Filled.CameraAlt, QuickActionKind.Nav(Screen.AiScan.route)) { navController.navigate(Screen.AiScan.route) },
                        QuickAction("分类管理", Icons.Filled.Sell, QuickActionKind.Nav(Screen.Categories.route)) { navController.navigate(Screen.Categories.route) },
                        QuickAction("标签管理", Icons.Filled.LocalOffer, QuickActionKind.Nav(Screen.Tags.route)) { navController.navigate(Screen.Tags.route) },
                        QuickAction("资产账户", Icons.Filled.Wallet, QuickActionKind.Nav(Screen.Accounts.route)) { navController.navigate(Screen.Accounts.route) },
                        QuickAction("账单导出", Icons.Filled.Download, QuickActionKind.Action) {
                            csvVm.exportCsv("transactions") { shareTextFile(it, "xinwallet_transactions", "text/csv", "csv") }
                        },
                        QuickAction("密码锁", Icons.Filled.Lock, QuickActionKind.Toast) { scope.launch { snackbar.showSnackbar("密码锁开发中") } },
                        QuickAction("投资理财", Icons.Filled.ShowChart, QuickActionKind.Nav(Screen.Investments.route)) { navController.navigate(Screen.Investments.route) },
                        QuickAction("AI 对话", Icons.Filled.Chat, QuickActionKind.Nav(Screen.Chat.route)) { navController.navigate(Screen.Chat.route) },
                        QuickAction("报表分析", Icons.Filled.PieChart, QuickActionKind.Nav(Screen.Reports.route)) { navController.navigate(Screen.Reports.route) },
                        QuickAction("储蓄目标", Icons.Filled.Savings, QuickActionKind.Nav(Screen.Planning.route)) { navController.navigate(Screen.Planning.route) },
                        QuickAction("预算管理", Icons.Filled.Receipt, QuickActionKind.Nav(Screen.Planning.route)) { navController.navigate(Screen.Planning.route) },
                        QuickAction("借贷", Icons.Filled.SwapHoriz, QuickActionKind.Nav(Screen.Planning.route)) { navController.navigate(Screen.Planning.route) }
                    )
                    items.chunked(4).forEach { row ->
                        Row(Modifier.fillMaxWidth()) {
                            row.forEach { item ->
                                QuickGridItem(item, modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // 4) 设置列表
            SectionTitle("设置")
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column {
                    ListItem(
                        icon = Icons.Filled.Info,
                        title = "关于我们",
                        subtitle = "v${BuildConfig.VERSION_NAME}"
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            // 5) 主题切换
            SectionTitle("外观主题")
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                themeOptions.forEachIndexed { index, (value, label) ->
                    SegmentedButton(
                        selected = state.themeMode == value,
                        onClick = { vm.setTheme(value) },
                        shape = SegmentedButtonDefaults.itemShape(index, themeOptions.size),
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = MaterialTheme.colorScheme.primaryContainer,
                            activeContentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            inactiveContainerColor = MaterialTheme.colorScheme.surface,
                            inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        modifier = Modifier.weight(1f)
                    ) {
                        Text(label)
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // 6) 高级：服务器地址
            SectionTitle("服务器地址")
            Text(
                "App 直连 NAS 上的 XinWallet 后端，修改后即时生效。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                value = server,
                onValueChange = { server = it },
                label = { Text("服务器地址") },
                placeholder = { Text("https://your-nas.com:18888/api") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { vm.saveServer(server) },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            ) {
                Text("保存服务器地址")
            }

            Spacer(Modifier.height(20.dp))

            // 7) 高级：应用更新
            SectionTitle("应用更新")
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.SystemUpdate, "升级", tint = Brown500)
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
                        ) { Text("重试") }
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(
                            onClick = {
                                val cm = context.getSystemService(ClipboardManager::class.java)
                                cm.setPrimaryClip(ClipData.newPlainText("apkUrl", updateState.apkUrl))
                                Toast.makeText(context, "下载链接已复制，可粘贴到手机浏览器打开", Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) { Text("复制下载链接") }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // 8) 高级：数据管理
            SectionTitle("数据管理")
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Column {
                    ListItem(
                        icon = Icons.Filled.Sell,
                        title = "标签管理",
                        subtitle = "分类与自定义标记",
                        onClick = { navController.navigate(Screen.Tags.route) }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    ListItem(
                        icon = Icons.Filled.Download,
                        title = "导出交易 CSV",
                        subtitle = "导出为本机 CSV 文件",
                        busy = busy,
                        onClick = { csvVm.exportCsv("transactions") { shareTextFile(it, "xinwallet_transactions", "text/csv", "csv") } }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    ListItem(
                        icon = Icons.Filled.Upload,
                        title = "导入交易 CSV",
                        subtitle = "从本机文件批量导入",
                        busy = busy,
                        onClick = { pickCsv.launch("*/*") }
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    ListItem(
                        icon = Icons.Filled.Description,
                        title = "导出完整账本 JSON",
                        subtitle = "含账户 / 交易 / 标签",
                        busy = busy,
                        onClick = { csvVm.exportFull { shareTextFile(it, "xinwallet_full", "application/json", "json") } }
                    )
                }
            }

            Spacer(Modifier.height(28.dp))
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.Center) {
                OutlinedButton(onClick = { vm.logout(); onLogout() }) {
                    Text("退出登录")
                }
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

/* ============================================================
 * 私有 Composable
 * ============================================================ */

private enum class QuickActionKind { Toast, Nav, Action }

private data class QuickAction(
    val label: String,
    val icon: ImageVector,
    val kind: QuickActionKind,
    val onClick: () -> Unit
)

@Composable
private fun QuickGridItem(item: QuickAction, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.clickable { item.onClick() }.padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            Modifier.size(48.dp).clip(CircleShape).background(Brown50),
            contentAlignment = Alignment.Center
        ) {
            Icon(item.icon, contentDescription = item.label, tint = Brown500, modifier = Modifier.size(22.dp))
        }
        Spacer(Modifier.height(6.dp))
        Text(item.label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}

@Composable
private fun ListItem(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    onClick: (() -> Unit)? = null,
    busy: Boolean = false,
    trailing: (@Composable () -> Unit)? = null
) {
    val baseModifier = Modifier
        .fillMaxWidth()
        .then(if (onClick != null && !busy) Modifier.clickable { onClick() } else Modifier)
        .padding(horizontal = 16.dp, vertical = 14.dp)
    Row(baseModifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, title, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (trailing != null) trailing()
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
    }
}