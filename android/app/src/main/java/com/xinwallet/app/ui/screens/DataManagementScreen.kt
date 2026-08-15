package com.xinwallet.app.ui.screens

import android.content.Intent
import android.os.Environment
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.viewmodel.CsvViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDate
import java.io.File
import kotlinx.coroutines.launch

/**
 * 「数据管理」独立页面（从「我的」页 12 宫格点入）。
 * 包含导出 CSV / 导入 CSV / 导出 JSON 三项。
 */
@Composable
fun DataManagementScreen(navController: NavHostController) {
    val csvVm: CsvViewModel = viewModel(factory = viewModelFactory { CsvViewModel(AppContainer.csvRepository) })
    val state by csvVm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(state.toast) { state.toast?.let { snackbar.showSnackbar(it); csvVm.consumeToast() } }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); csvVm.consumeError() } }

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

    Scaffold(
        topBar = { TopBar("数据管理", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
        ) {
            Spacer(Modifier.height(8.dp))
            DataActionCard(
                title = "导出 CSV",
                desc = "导出当月所有交易为 CSV 文件，可导入其他账本或备份。",
                buttonText = if (state.busy) "导出中…" else "导出 CSV",
                onClick = { csvVm.exportCsv("transactions") { shareTextFile(it, "xinwallet_transactions", "text/csv", "csv") } },
                enabled = !state.busy
            )
            Spacer(Modifier.height(12.dp))
            DataActionCard(
                title = "导入 CSV",
                desc = "从 CSV 文件导入交易。重复导入会自动跳过，需先在「设置」配置好服务器地址。",
                buttonText = "选择 CSV 文件",
                onClick = { pickCsv.launch("*/*") },
                enabled = !state.busy
            )
            Spacer(Modifier.height(12.dp))
            DataActionCard(
                title = "导出 JSON",
                desc = "导出全部账本数据为 JSON 文件，包含交易、账户、分类、标签、预算、储蓄目标、借贷等。",
                buttonText = if (state.busy) "导出中…" else "导出 JSON",
                onClick = { csvVm.exportFull { shareTextFile(it, "xinwallet_full", "application/json", "json") } },
                enabled = !state.busy
            )
            Spacer(Modifier.height(48.dp))
        }
    }
}

@Composable
private fun DataActionCard(
    title: String,
    desc: String,
    buttonText: String,
    onClick: () -> Unit,
    enabled: Boolean
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(6.dp))
            Text(desc, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text(buttonText)
            }
        }
    }
}
