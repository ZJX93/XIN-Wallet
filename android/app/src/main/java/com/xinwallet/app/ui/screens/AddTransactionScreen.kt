package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.DateTimePickerField
import com.xinwallet.app.ui.components.DropdownField
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.viewmodel.AddTransactionViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDateTime
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Alignment
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.TextButton
import kotlinx.coroutines.launch

/**
 * 记一笔 / 编辑交易。
 * @param editId 大于 0 表示编辑模式；编辑模式不支持转账（转账两条腿需成对改，只允许删除后重记）
 * @param month  编辑模式下用于定位原交易所在月份
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionScreen(navController: NavHostController, editId: Int = 0, month: String? = null) {
    val vm: AddTransactionViewModel = viewModel(factory = viewModelFactory {
        AddTransactionViewModel(AppContainer.transactionRepository, AppContainer.accountRepository, AppContainer.categoryRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val isEdit = editId > 0

    var type by remember { mutableStateOf("expense") }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var accountId by remember { mutableStateOf<Int?>(null) }
    var categoryId by remember { mutableStateOf<Int?>(null) }
    var fromId by remember { mutableStateOf<Int?>(null) }
    var toId by remember { mutableStateOf<Int?>(null) }
    // 记账时间精确到秒，格式 yyyy-MM-dd HH:mm:ss，默认取当前时刻
    var date by remember { mutableStateOf(todayDateTime()) }
    var prefilled by remember { mutableStateOf(false) }
    // AI 记账内联模式：true 时在记一笔页内直接展示 AI 智能记账流程
    var aiMode by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadOptions(if (isEdit) editId else null, month) }
    LaunchedEffect(state.success) { if (state.success) navController.popBackStack() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    // 编辑模式：原交易加载完成后回填表单（只回填一次，避免覆盖用户的修改）
    LaunchedEffect(state.editing) {
        val tx = state.editing
        if (tx != null && !prefilled) {
            type = if (tx.type == "income") "income" else "expense"
            amount = trimAmount(tx.amount)
            note = tx.note.orEmpty()
            accountId = tx.account?.id
            categoryId = tx.category?.id
            // 后端列表返回的是 yyyy-MM-dd HH:mm:ss，只有日期时补 00:00:00
            date = tx.date.trim().let { if (it.length >= 19) it.substring(0, 19) else it.take(10) + " 00:00:00" }
            prefilled = true
        }
    }

    Scaffold(
        topBar = { TopBar(if (isEdit) "编辑交易" else "记一笔", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (!aiMode) {
                Button(
                onClick = {
                    val amt = amount.toDoubleOrNull() ?: 0.0
                    if (amt <= 0) { scope.launch { snackbar.showSnackbar("请输入有效金额") }; return@Button }
                    when {
                        isEdit -> {
                            if (accountId == null) { scope.launch { snackbar.showSnackbar("请选择账户") }; return@Button }
                            if (categoryId == null) { scope.launch { snackbar.showSnackbar("请选择分类") }; return@Button }
                            vm.submitEdit(editId, accountId!!, categoryId!!, amt, note, type, date)
                        }
                        type == "transfer" -> {
                            if (fromId == null || toId == null) { scope.launch { snackbar.showSnackbar("请选择转出和转入账户") }; return@Button }
                            if (fromId == toId) { scope.launch { snackbar.showSnackbar("转出和转入账户不能相同") }; return@Button }
                            vm.submitTransfer(fromId!!, toId!!, amt, note, date)
                        }
                        else -> {
                            if (accountId == null) { scope.launch { snackbar.showSnackbar("请选择账户") }; return@Button }
                            if (categoryId == null) { scope.launch { snackbar.showSnackbar("请选择分类") }; return@Button }
                            vm.submitExpense(accountId!!, categoryId!!, amt, note, type, date)
                        }
                    }
                },
                enabled = !state.loading,
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) {
                if (state.loading) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp)
                else Text(if (isEdit) "保存修改" else "保存")
            }
            }
        }
    ) { padding ->
        if (aiMode) {
            Column(Modifier.fillMaxSize().padding(padding)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("AI 智能记账", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { aiMode = false }) { Text("收起") }
                }
                Box(Modifier.weight(1f)) { AiScanContent(navController, PaddingValues()) }
            }
        } else if (state.loading && state.accounts.isEmpty() && state.categories.isEmpty()) {
            LoadingBox()
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                item {
                    if (!isEdit) {
                        OutlinedButton(onClick = { aiMode = true }, Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.PhotoCamera, null, Modifier.height(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("📷 AI 智能记账（拍照/截图自动识别）")
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                    // 编辑模式隐藏转账选项：转账是成对记录，需整笔删除后重记
                    val count = if (isEdit) 2 else 3
                    SingleChoiceSegmentedButtonRow {
                        SegmentedButton(selected = type == "expense", onClick = { type = "expense"; categoryId = null }, shape = SegmentedButtonDefaults.itemShape(0, count)) { Text("支出") }
                        SegmentedButton(selected = type == "income", onClick = { type = "income"; categoryId = null }, shape = SegmentedButtonDefaults.itemShape(1, count)) { Text("收入") }
                        if (!isEdit) {
                            SegmentedButton(selected = type == "transfer", onClick = { type = "transfer" }, shape = SegmentedButtonDefaults.itemShape(2, count)) { Text("转账") }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { amount = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("金额") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(12.dp))
                }
                if (type == "transfer") {
                    item {
                        DropdownField(
                            label = "转出账户",
                            value = state.accounts.find { it.id == fromId }?.let { "${it.icon ?: ""} ${it.name}" } ?: "请选择",
                            options = state.accounts.map { "${it.icon ?: ""} ${it.name}" to it.id },
                            onSelected = { id -> fromId = id }
                        )
                        Spacer(Modifier.height(12.dp))
                        DropdownField(
                            label = "转入账户",
                            value = state.accounts.find { it.id == toId }?.let { "${it.icon ?: ""} ${it.name}" } ?: "请选择",
                            options = state.accounts.map { "${it.icon ?: ""} ${it.name}" to it.id },
                            onSelected = { id -> toId = id }
                        )
                        Spacer(Modifier.height(12.dp))
                    }
                } else {
                    item {
                        DropdownField(
                            label = "账户",
                            value = state.accounts.find { it.id == accountId }?.let { "${it.icon ?: ""} ${it.name}" } ?: "请选择",
                            options = state.accounts.map { "${it.icon ?: ""} ${it.name}" to it.id },
                            emptyHint = if (state.accounts.isEmpty()) "暂无账户，请先在「账户」页添加" else null,
                            onSelected = { id -> accountId = id }
                        )
                        Spacer(Modifier.height(12.dp))
                        val cats = state.categories.filter { it.type == type }
                        DropdownField(
                            label = "分类",
                            value = state.categories.find { it.id == categoryId }?.let { "${it.icon ?: ""} ${it.name}" } ?: "请选择",
                            options = cats.map { "${it.icon ?: ""} ${it.name}" to it.id },
                            emptyHint = if (cats.isEmpty()) "暂无${if (type == "income") "收入" else "支出"}分类" else null,
                            onSelected = { id -> categoryId = id }
                        )
                        Spacer(Modifier.height(12.dp))
                    }
                }
                item {
                    DateTimePickerField(label = "日期时间", value = date, onValueChange = { date = it })
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = note,
                        onValueChange = { note = it },
                        label = { Text("备注") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(16.dp))
                }
            }
        }
    }
}

/** 金额回填时去掉多余小数：120.00 -> 120，12.50 -> 12.5 */
internal fun trimAmount(value: Double): String {
    val s = java.math.BigDecimal(value).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()
    return s.trimEnd('0').trimEnd('.').ifEmpty { "0" }
}
