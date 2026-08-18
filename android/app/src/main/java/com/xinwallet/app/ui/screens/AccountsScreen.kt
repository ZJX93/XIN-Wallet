package com.xinwallet.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.CreateAccountRequest
import com.xinwallet.app.data.model.UpdateAccountRequest
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.DropdownField
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.PullRefreshBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.accountTypeLabel
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.viewmodel.AccountsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney

val ACCOUNT_TYPE_ORDER = listOf("cash", "bank_card", "credit_card", "electronic_payment", "financial_account", "digital", "other")

private val ACCOUNT_ICONS = listOf("💰", "💵", "🏦", "💳", "📱", "📈", "🪙", "🧧", "🏧", "💼")

@Composable
fun AccountsScreen(navController: NavHostController) {
    val vm: AccountsViewModel = viewModel(factory = viewModelFactory { AccountsViewModel(AppContainer.accountRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    var editing by remember { mutableStateOf<Account?>(null) }
    var showForm by remember { mutableStateOf(false) }
    var longPressed by remember { mutableStateOf<Account?>(null) }
    var confirmClose by remember { mutableStateOf<Account?>(null) }
    var confirmDelete by remember { mutableStateOf<Account?>(null) }

    LaunchedEffect(Unit) { vm.load() }
    // 回到前台（从后台返回）：重新拉取账户数据
    LaunchedEffect(Unit) {
        AppContainer.onForeground.collect { vm.load() }
    }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.consumeError() } }
    LaunchedEffect(state.toast) { state.toast?.let { snackbar.showSnackbar(it); vm.consumeToast() } }
    LaunchedEffect(state.formDone) {
        if (state.formDone) { showForm = false; editing = null; vm.consumeFormDone() }
    }

    if (showForm) {
        AccountFormDialog(
            account = editing,
            submitting = state.submitting,
            onDismiss = { showForm = false; editing = null },
            onSubmit = { name, type, icon, opening, credit ->
                val target = editing
                if (target == null) vm.create(CreateAccountRequest(name, type, icon, opening, credit))
                else vm.update(target.id, UpdateAccountRequest(name, type, icon, opening, credit))
            }
        )
    }

    longPressed?.let { acc ->
        AlertDialog(
            onDismissRequest = { longPressed = null },
            title = { Text(acc.name) },
            text = { Text("当前余额 ${formatMoney(acc.balance)}\n选择要执行的操作") },
            confirmButton = {
                TextButton(onClick = { editing = acc; showForm = true; longPressed = null }) { Text("编辑") }
            },
            dismissButton = {
                Row {
                    if (acc.status == "active") {
                        TextButton(onClick = { confirmClose = acc; longPressed = null }) { Text("销户") }
                    }
                    TextButton(onClick = { confirmDelete = acc; longPressed = null }) {
                        Text("删除", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        )
    }

    confirmClose?.let { acc ->
        AlertDialog(
            onDismissRequest = { confirmClose = null },
            title = { Text("销户「${acc.name}」？") },
            text = { Text("销户后该账户不再计入总资产，历史流水会完整保留。") },
            confirmButton = { TextButton(onClick = { vm.close(acc.id); confirmClose = null }) { Text("确认销户") } },
            dismissButton = { TextButton(onClick = { confirmClose = null }) { Text("取消") } }
        )
    }

    confirmDelete?.let { acc ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("彻底删除「${acc.name}」？") },
            text = { Text("删除后不可恢复。若账户下已有流水或理财持仓，后端会拒绝删除，此时请改用「销户」。") },
            confirmButton = {
                TextButton(onClick = { vm.delete(acc.id); confirmDelete = null }) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("取消") } }
        )
    }

    Scaffold(
        topBar = { TopBar("账户") },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            FloatingActionButton(onClick = { editing = null; showForm = true }) {
                Icon(Icons.Filled.Add, "新增账户")
            }
        }
    ) { padding ->
        when {
            state.loading && state.accounts.isEmpty() -> LoadingBox()
            state.error != null && state.accounts.isEmpty() -> ErrorState(state.error!!) { vm.load() }
            else -> {
                val grouped = ACCOUNT_TYPE_ORDER.mapNotNull { t ->
                    val list = state.accounts.filter { it.type == t }
                    if (list.isEmpty()) null else t to list
                }
                PullRefreshBox(
                    refreshing = state.loading,
                    onRefresh = { vm.load() },
                    modifier = Modifier.fillMaxSize().padding(padding)
                ) {
                LazyColumn(Modifier.fillMaxSize()) {
                    item {
                        Spacer(Modifier.height(12.dp))
                        BalanceCard("总资产", state.totalAssets, "所有活跃账户余额合计", Modifier.padding(horizontal = 16.dp))
                    }
                    if (grouped.isEmpty()) {
                        item {
                            com.xinwallet.app.ui.components.EmptyState("还没有账户，点右下角「+」添加第一个")
                        }
                    }
                    grouped.forEach { (type, list) ->
                        item { SectionTitle("${accountTypeLabel(type)}（${list.size}）") }
                        items(list, key = { it.id }) { acc ->
                            AccountRowWithActions(
                                account = acc,
                                onClick = { navController.navigate(Screen.AccountDetail.create(acc.id)) },
                                onLongClick = { longPressed = acc }
                            )
                        }
                    }
                    item { Spacer(Modifier.height(88.dp)) }
                    }
                }
            }
        }
    }
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun AccountRowWithActions(account: Account, onClick: () -> Unit, onLongClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(44.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(account.icon ?: "💰", style = MaterialTheme.typography.titleMedium) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(account.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                if (account.status != "active") {
                    Spacer(Modifier.width(6.dp))
                    Text("已销户", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                }
            }
            Text("${accountTypeLabel(account.type)} · 长按管理", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatMoney(account.balance), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            if (account.type == "credit_card" && account.creditLimit > 0) {
                Text("额度 ${formatMoney(account.creditLimit)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/**
 * 账户新增 / 编辑表单。
 * 注意：编辑时改的是「期初余额」而不是实时余额 —— 实时余额由账本流水推导，
 * 这与 Web 端 v0.3.0 之后的账户模型保持一致。
 */
@Composable
private fun AccountFormDialog(
    account: Account?,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (name: String, type: String, icon: String, opening: Double, credit: Double) -> Unit
) {
    var name by remember { mutableStateOf(account?.name.orEmpty()) }
    var type by remember { mutableStateOf(account?.type ?: "cash") }
    var icon by remember { mutableStateOf(account?.icon ?: "💰") }
    var opening by remember { mutableStateOf(if (account != null) trimAmount(account.openingBalance) else "") }
    var credit by remember { mutableStateOf(if (account != null && account.creditLimit > 0) trimAmount(account.creditLimit) else "") }
    var localError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = { if (!submitting) onDismiss() },
        title = { Text(if (account == null) "新增账户" else "编辑账户") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()).heightIn(max = 420.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("账户名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(Modifier.height(12.dp))
                DropdownField(
                    label = "账户类型",
                    value = accountTypeLabel(type),
                    options = ACCOUNT_TYPE_ORDER.mapIndexed { idx, t -> accountTypeLabel(t) to idx },
                    onSelected = { idx -> type = ACCOUNT_TYPE_ORDER[idx] }
                )
                Spacer(Modifier.height(12.dp))
                Text("图标", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    ACCOUNT_ICONS.take(5).forEach { emoji -> IconChoice(emoji, icon == emoji) { icon = emoji } }
                }
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    ACCOUNT_ICONS.drop(5).forEach { emoji -> IconChoice(emoji, icon == emoji) { icon = emoji } }
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = opening,
                    onValueChange = { opening = it.filter { c -> c.isDigit() || c == '.' || c == '-' } },
                    label = { Text("期初余额") },
                    supportingText = { Text("当前余额由流水自动推导，这里填开户时的初始金额") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                if (type == "credit_card") {
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = credit,
                        onValueChange = { credit = it.filter { c -> c.isDigit() || c == '.' } },
                        label = { Text("信用额度") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
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
                    if (name.isBlank()) { localError = "请输入账户名称"; return@TextButton }
                    localError = null
                    onSubmit(
                        name.trim(),
                        type,
                        icon,
                        opening.toDoubleOrNull() ?: 0.0,
                        if (type == "credit_card") credit.toDoubleOrNull() ?: 0.0 else 0.0
                    )
                }
            ) { Text(if (submitting) "保存中…" else "保存") }
        },
        dismissButton = { TextButton(enabled = !submitting, onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
private fun IconChoice(emoji: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.size(40.dp).clickable { onClick() }
    ) {
        Box(contentAlignment = Alignment.Center) { Text(emoji, style = MaterialTheme.typography.titleMedium) }
    }
}
