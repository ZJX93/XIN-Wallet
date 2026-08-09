package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionScreen(navController: NavHostController) {
    val vm: AddTransactionViewModel = viewModel(factory = viewModelFactory {
        AddTransactionViewModel(AppContainer.transactionRepository, AppContainer.accountRepository, AppContainer.categoryRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    var type by remember { mutableStateOf("expense") }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var accountId by remember { mutableStateOf<Int?>(null) }
    var categoryId by remember { mutableStateOf<Int?>(null) }
    var fromId by remember { mutableStateOf<Int?>(null) }
    var toId by remember { mutableStateOf<Int?>(null) }
    var date by remember { mutableStateOf(todayDate()) }
    var accountExpanded by remember { mutableStateOf(false) }
    var categoryExpanded by remember { mutableStateOf(false) }
    var fromExpanded by remember { mutableStateOf(false) }
    var toExpanded by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadOptions() }
    LaunchedEffect(state.success) { if (state.success) navController.popBackStack() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        topBar = { com.xinwallet.app.ui.components.TopBar("记一笔", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            Button(
                onClick = {
                    val amt = amount.toDoubleOrNull() ?: 0.0
                    if (amt <= 0) { snackbar.showSnackbar("请输入有效金额"); return@Button }
                    when (type) {
                        "transfer" -> {
                            if (fromId == null || toId == null) { snackbar.showSnackbar("请选择转出和转入账户"); return@Button }
                            if (fromId == toId) { snackbar.showSnackbar("转出和转入账户不能相同"); return@Button }
                            vm.submitTransfer(fromId!!, toId!!, amt, note)
                        }
                        else -> {
                            if (accountId == null) { snackbar.showSnackbar("请选择账户"); return@Button }
                            if (categoryId == null) { snackbar.showSnackbar("请选择分类"); return@Button }
                            vm.submitExpense(accountId!!, categoryId!!, amt, note, type)
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
        if (state.loading && state.accounts.isEmpty()) {
            LoadingBox()
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
                item {
                    SingleChoiceSegmentedButtonRow {
                        SegmentedButton(selected = type == "expense", onClick = { type = "expense" }) { Text("支出") }
                        SegmentedButton(selected = type == "income", onClick = { type = "income" }) { Text("收入") }
                        SegmentedButton(selected = type == "transfer", onClick = { type = "transfer" }) { Text("转账") }
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
                        DropdownField("转出账户", state.accounts.find { it.id == fromId }?.name ?: "请选择", fromExpanded, { fromExpanded = it }) {
                            state.accounts.forEach { acc ->
                                DropdownMenuItem(text = { Text("${acc.icon ?: ""} ${acc.name}") }, onClick = { fromId = acc.id; fromExpanded = false })
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        DropdownField("转入账户", state.accounts.find { it.id == toId }?.name ?: "请选择", toExpanded, { toExpanded = it }) {
                            state.accounts.forEach { acc ->
                                DropdownMenuItem(text = { Text("${acc.icon ?: ""} ${acc.name}") }, onClick = { toId = acc.id; toExpanded = false })
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                } else {
                    item {
                        DropdownField("账户", state.accounts.find { it.id == accountId }?.name ?: "请选择", accountExpanded, { accountExpanded = it }) {
                            state.accounts.forEach { acc ->
                                DropdownMenuItem(text = { Text("${acc.icon ?: ""} ${acc.name}") }, onClick = { accountId = acc.id; accountExpanded = false })
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        val cats = state.categories.filter { it.type == type }
                        DropdownField("分类", state.categories.find { it.id == categoryId }?.name ?: "请选择", categoryExpanded, { categoryExpanded = it }) {
                            cats.forEach { c ->
                                DropdownMenuItem(text = { Text("${c.icon ?: ""} ${c.name}") }, onClick = { categoryId = c.id; categoryExpanded = false })
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }
                }
                item {
                    OutlinedTextField(value = date, onValueChange = { date = it }, label = { Text("日期 (yyyy-MM-dd)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("备注") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(16.dp))
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DropdownField(
    label: String,
    value: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = onExpandedChange) {
        OutlinedTextField(
            value = value, onValueChange = {}, readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { onExpandedChange(false) }, content = content)
    }
}
