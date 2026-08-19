package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.DatePickerField
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.TransactionRow
import com.xinwallet.app.ui.components.accountTypeLabel
import com.xinwallet.app.ui.viewmodel.TransactionsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import com.xinwallet.app.util.todayDate
import kotlinx.coroutines.launch

@Composable
fun AccountDetailScreen(navController: NavHostController, accountId: Int) {
    val vm: TransactionsViewModel = viewModel(factory = viewModelFactory { TransactionsViewModel(AppContainer.transactionRepository, AppContainer.accountRepository) })
    val state by vm.state.collectAsState()
    var account by remember { mutableStateOf<Account?>(null) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var showInterestDialog by remember { mutableStateOf(false) }
    var interestSubmitting by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        vm.load(accountId = accountId)
        val r = AppContainer.accountRepository.getAllAccounts()
        if (r is ApiResult.Success) account = r.data?.accounts?.find { it.id == accountId }
    }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    if (showInterestDialog) {
        AddInterestDialog(
            submitting = interestSubmitting,
            onDismiss = { if (!interestSubmitting) showInterestDialog = false },
            onSubmit = { amount, date, note ->
                interestSubmitting = true
                scope.launch {
                    when (val r = AppContainer.accountRepository.addInterest(accountId, amount, date, note)) {
                        is ApiResult.Success -> {
                            interestSubmitting = false
                            showInterestDialog = false
                            account = account?.copy(balance = r.data.balance, lastInterestDate = r.data.lastInterestDate)
                            snackbar.showSnackbar("利息已入账，最新余额 ${formatMoney(r.data.balance)}")
                            vm.load(accountId = accountId)
                        }
                        is ApiResult.Error -> {
                            interestSubmitting = false
                            snackbar.showSnackbar(r.message)
                        }
                    }
                }
            }
        )
    }

    Scaffold(
        topBar = { TopBar(account?.name ?: "账户", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorState(state.error!!) { vm.load(accountId = accountId) }
            else -> {
                LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
                    item {
                        Spacer(Modifier.height(12.dp))
                        account?.let { acc ->
                            val sub = accountTypeLabel(acc.type) + if (acc.creditLimit > 0) " · 额度 ${formatMoney(acc.creditLimit)}" else ""
                            BalanceCard("当前余额", acc.balance, sub)
                            Spacer(Modifier.height(12.dp))
                            if (acc.status == "active") {
                                OutlinedButton(
                                    onClick = { showInterestDialog = true },
                                    modifier = Modifier.fillMaxWidth()
                                ) { Text("记利息") }
                                Spacer(Modifier.height(12.dp))
                            }
                        }
                        SectionTitle("交易记录")
                    }
                    if (state.items.isEmpty()) item { EmptyState("该账户暂无交易") }
                    else items(state.items) { TransactionRow(it) }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

/**
 * 记利息弹窗：金额必填、日期默认今天、备注可选。
 * 确认后调 POST /accounts/accounts/{id}/interest，成功后由调用方刷新余额。
 */
@Composable
private fun AddInterestDialog(
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (amount: Double, date: String, note: String?) -> Unit
) {
    var amount by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(todayDate()) }
    var note by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!submitting) onDismiss() },
        title = { Text("记利息") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 360.dp)) {
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("利息金额") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                DatePickerField(label = "计息日期", date = date, onDateChange = { date = it })
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text("备注（可选）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                localError?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !submitting,
                onClick = {
                    val v = amount.toDoubleOrNull()
                    if (v == null || v <= 0.0) { localError = "请输入正确的利息金额"; return@TextButton }
                    localError = null
                    onSubmit(v, date, note.trim().ifBlank { null })
                }
            ) { Text(if (submitting) "提交中…" else "确认") }
        },
        dismissButton = { TextButton(enabled = !submitting, onClick = onDismiss) { Text("取消") } }
    )
}
