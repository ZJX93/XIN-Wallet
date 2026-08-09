package com.xinwallet.app.ui.screens

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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
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
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.viewmodel.AddTransactionViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDate
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionScreen(navController: NavHostController) {
    val vm: AddTransactionViewModel = viewModel(factory = viewModelFactory {
        AddTransactionViewModel(AppContainer.transactionRepository, AppContainer.accountRepository, AppContainer.categoryRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var type by remember { mutableStateOf("expense") }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var accountId by remember { mutableStateOf<Int?>(null) }
    var categoryId by remember { mutableStateOf<Int?>(null) }
    var fromId by remember { mutableStateOf<Int?>(null) }
    var toId by remember { mutableStateOf<Int?>(null) }
    var date by remember { mutableStateOf(todayDate()) }
    var showDatePicker by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadOptions() }
    LaunchedEffect(state.success) { if (state.success) navController.popBackStack() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    if (showDatePicker) {
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = dateToMillis(date) ?: System.currentTimeMillis()
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        date = millisToDate(millis)
                    }
                    showDatePicker = false
                }) { Text("确定") }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text("取消") }
            }
        ) {
            DatePicker(state = pickerState)
        }
    }

    Scaffold(
        topBar = { com.xinwallet.app.ui.components.TopBar("记一笔", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            Button(
                onClick = {
                    val amt = amount.toDoubleOrNull() ?: 0.0
                    if (amt <= 0) { scope.launch { snackbar.showSnackbar("请输入有效金额") }; return@Button }
                    when (type) {
                        "transfer" -> {
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
                if (state.loading) CircularProgressIndicator(Modifier.height(18.dp), strokeWidth = 2.dp) else Text("保存")
            }
        }
    ) { padding ->
        if (state.loading && state.accounts.isEmpty() && state.categories.isEmpty()) {
            LoadingBox()
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                item {
                    SingleChoiceSegmentedButtonRow {
                        SegmentedButton(selected = type == "expense", onClick = { type = "expense" }, shape = SegmentedButtonDefaults.itemShape(0, 3)) { Text("支出") }
                        SegmentedButton(selected = type == "income", onClick = { type = "income" }, shape = SegmentedButtonDefaults.itemShape(1, 3)) { Text("收入") }
                        SegmentedButton(selected = type == "transfer", onClick = { type = "transfer" }, shape = SegmentedButtonDefaults.itemShape(2, 3)) { Text("转账") }
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
                    OutlinedTextField(
                        value = date,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("日期") },
                        singleLine = true,
                        trailingIcon = {
                            IconButton(onClick = { showDatePicker = true }) {
                                Icon(Icons.Default.DateRange, contentDescription = "选择日期")
                            }
                        },
                        modifier = Modifier.fillMaxWidth().clickable { showDatePicker = true }
                    )
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

@Composable
private fun DropdownField(
    label: String,
    value: String,
    options: List<Pair<String, Int>>,
    emptyHint: String? = null,
    onSelected: (Int) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = {
                IconButton(onClick = { expanded = true }) {
                    Icon(Icons.Default.ArrowDropDown, contentDescription = "展开")
                }
            },
            modifier = Modifier.fillMaxWidth().clickable { expanded = true }
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.fillMaxWidth()
        ) {
            if (options.isEmpty()) {
                DropdownMenuItem(
                    text = { Text(emptyHint ?: "暂无选项", color = MaterialTheme.colorScheme.outline) },
                    onClick = { expanded = false }
                )
            } else {
                options.forEach { (name, id) ->
                    DropdownMenuItem(
                        text = { Text(name) },
                        onClick = { onSelected(id); expanded = false }
                    )
                }
            }
        }
    }
}

private fun dateToMillis(date: String): Long? {
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.CHINA)
        sdf.parse(date)?.time
    } catch (_: Exception) { null }
}

private fun millisToDate(millis: Long): String {
    val c = Calendar.getInstance().apply { timeInMillis = millis }
    return String.format("%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
}
