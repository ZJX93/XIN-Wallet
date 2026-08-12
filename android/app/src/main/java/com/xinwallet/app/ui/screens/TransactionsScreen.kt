package com.xinwallet.app.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.TransactionItem
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.PullRefreshBox
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.viewmodel.TransactionsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce

private val TYPE_FILTERS = listOf<Pair<String, String?>>(
    "全部" to null,
    "支出" to "expense",
    "收入" to "income",
    "转账" to "transfer"
)

/**
 * 账单流水页：月份切换 + 类型筛选 + 当月收支汇总 + 按日分组的流水，
 * 点击任意一条可编辑或删除（转账记录只允许删除，由后端联动删掉配对的另一条腿）。
 */
@Composable
fun TransactionsScreen(navController: NavHostController) {
    val vm: TransactionsViewModel = viewModel(factory = viewModelFactory {
        TransactionsViewModel(AppContainer.transactionRepository, AppContainer.accountRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var acting by remember { mutableStateOf<TransactionItem?>(null) }
    var confirmDelete by remember { mutableStateOf<TransactionItem?>(null) }

    LaunchedEffect(Unit) { vm.init() }
    // 从「记一笔 / 编辑 / AI 记账」返回本页时（NavBackStackEntry 重新 RESUME）自动刷新，
    // 保证列表与账户余额同步，不用用户手动下拉。
    var firstResume by remember { mutableStateOf(true) }
    val lifecycleOwner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                if (firstResume) firstResume = false else vm.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.consumeError() } }
    LaunchedEffect(state.toast) { state.toast?.let { snackbar.showSnackbar(it); vm.consumeToast() } }
    // 搜索框防抖：输入停止 300ms 后再拉取，避免逐字符请求
    val searchQuery by remember { mutableStateOf(state.search) }
    LaunchedEffect(Unit) {
        snapshotFlow { searchQuery }
            .debounce(300)
            .collectLatest { q -> if (q != state.search) vm.setSearch(q) }
    }

    acting?.let { item ->
        AlertDialog(
            onDismissRequest = { acting = null },
            title = { Text(item.category?.name ?: "交易") },
            text = {
                Column {
                    Text(formatMoney(item.amount), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(item.date.take(19), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (!item.note.isNullOrBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(item.note, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (item.transferId != null) {
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "转账记录不支持直接编辑，如需修改请删除后重新记账。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            },
            confirmButton = {
                if (item.transferId == null) {
                    TextButton(onClick = {
                        acting = null
                        navController.navigate(Screen.EditTransaction.create(item.id, state.month))
                    }) {
                        Icon(Icons.Filled.Edit, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("编辑")
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = item; acting = null }) {
                    Icon(Icons.Filled.Delete, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(4.dp))
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            }
        )
    }

    confirmDelete?.let { item ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("删除这笔交易？") },
            text = {
                Text(
                    if (item.transferId != null) "转账的转出、转入两条记录会一并删除，账户余额将重新计算。"
                    else "删除后账户余额会按账本重新计算，该操作不可撤销。"
                )
            },
            confirmButton = {
                TextButton(onClick = { vm.delete(item); confirmDelete = null }) {
                    Text("删除", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("取消") } }
        )
    }

    Scaffold(topBar = { TopBar("账单") }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // 搜索框：备注 / 分类名关键字，300ms 防抖后拉取
            SearchBarField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            )
            MonthFilterRow(state.months, state.month) { vm.selectMonth(it) }
            TypeFilterRow(state.typeFilter) { vm.selectType(it) }
            AccountFilterRow(state.accounts, state.accountFilter) { vm.selectAccount(it) }

            when {
                state.loading && state.items.isEmpty() -> LoadingBox()
                state.error != null && state.items.isEmpty() -> ErrorState(state.error!!) { vm.refresh() }
                else -> {
                    val grouped = state.items.groupBy { it.date.take(10) }.toList().sortedByDescending { it.first }
                    PullRefreshBox(
                        refreshing = state.loading,
                        onRefresh = { vm.refresh() },
                        modifier = Modifier.fillMaxSize()
                    ) {
                    LazyColumn(Modifier.fillMaxSize()) {
                        item {
                            Spacer(Modifier.height(8.dp))
                            SummaryCard(
                                income = state.summary?.income ?: 0.0,
                                expense = state.summary?.expense ?: 0.0,
                                balance = state.summary?.balance ?: 0.0
                            )
                            Spacer(Modifier.height(8.dp))
                        }
                        if (grouped.isEmpty()) {
                            val emptyMsg = if (state.search.isNotBlank() || state.accountFilter != null || state.typeFilter != null)
                                "未找到匹配的交易" else "${state.month} 暂无流水记录"
                            item { EmptyState(emptyMsg) }
                        }
                        grouped.forEach { (day, list) ->
                            item(key = "h-$day") { DayHeader(day, list) }
                            items(list, key = { "t-${it.id}" }) { item ->
                                TransactionRowClickable(item) { acting = item }
                            }
                        }
                        item { Spacer(Modifier.height(80.dp)) }
                    }
                }
            }
            }
        }
    }
}

@Composable
private fun SearchBarField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier,
        placeholder = { Text("搜索备注、分类或账户") },
        leadingIcon = { Icon(Icons.Filled.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
        trailingIcon = {
            if (value.isNotEmpty()) {
                IconButton(onClick = { onValueChange("") }) {
                    Icon(Icons.Filled.Close, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        },
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            unfocusedBorderColor = MaterialTheme.colorScheme.surfaceVariant,
            focusedBorderColor = MaterialTheme.colorScheme.primary
        )
    )
}

@Composable
private fun MonthFilterRow(months: List<String>, selected: String, onSelect: (String) -> Unit) {
    // 后端只返回有交易的月份；当前月若无记录也要能选中，故补进去
    val list = remember(months, selected) {
        (if (months.contains(selected)) months else listOf(selected) + months).distinct()
    }
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(list, key = { it }) { m ->
            FilterChip(selected = m == selected, onClick = { onSelect(m) }, label = { Text(prettyMonth(m)) })
        }
    }
}

@Composable
private fun TypeFilterRow(selected: String?, onSelect: (String?) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        TYPE_FILTERS.forEach { (label, value) ->
            FilterChip(selected = selected == value, onClick = { onSelect(value) }, label = { Text(label) })
        }
    }
}

@Composable
private fun AccountFilterRow(accounts: List<Account>, selected: Int?, onSelect: (Int?) -> Unit) {
    if (accounts.isEmpty()) return
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        item(key = "acc-all") {
            FilterChip(selected = selected == null, onClick = { onSelect(null) }, label = { Text("全部账户") })
        }
        items(accounts, key = { it.id }) { acc ->
            FilterChip(
                selected = selected == acc.id,
                onClick = { onSelect(acc.id) },
                label = { Text(listOfNotNull(acc.icon, acc.name).joinToString(" ")) }
            )
        }
    }
}

@Composable
private fun SummaryCard(income: Double, expense: Double, balance: Double) {
    val dark = LocalIsDark.current
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            SummaryCell("收入", income, if (dark) IncomeColorDark else IncomeColor)
            SummaryCell("支出", expense, if (dark) ExpenseColorDark else ExpenseColor)
            SummaryCell("结余", balance, MaterialTheme.colorScheme.onSurface)
        }
    }
}

@Composable
private fun SummaryCell(label: String, value: Double, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Text(formatMoney(value), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = color)
    }
}

@Composable
private fun DayHeader(day: String, list: List<TransactionItem>) {
    val income = list.filter { it.type == "income" }.sumOf { it.amount }
    val expense = list.filter { it.type == "expense" }.sumOf { it.amount }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(day, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.weight(1f))
        val parts = buildList {
            if (income > 0) add("收 ${formatMoney(income)}")
            if (expense > 0) add("支 ${formatMoney(expense)}")
        }
        if (parts.isNotEmpty()) {
            Text(parts.joinToString("  "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TransactionRowClickable(item: TransactionItem, onClick: () -> Unit) {
    val dark = LocalIsDark.current
    val isIncome = item.type == "income" || item.type == "transfer_in"
    val isExpense = item.type == "expense" || item.type == "transfer_out"
    val color = when {
        isIncome -> if (dark) IncomeColorDark else IncomeColor
        isExpense -> if (dark) ExpenseColorDark else ExpenseColor
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(40.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(item.category?.icon ?: "📌", style = MaterialTheme.typography.bodyLarge) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(item.category?.name ?: "交易", style = MaterialTheme.typography.bodyLarge)
            val sub = listOfNotNull(
                item.account?.name,
                item.note?.takeIf { it.isNotBlank() }
            ).joinToString(" · ").ifBlank { item.date.take(10) }
            Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        Text(
            (if (isIncome) "+" else if (isExpense) "-" else "") + formatMoney(item.amount),
            style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = color
        )
    }
}

private fun prettyMonth(m: String): String {
    val parts = m.split("-")
    return if (parts.size == 2) "${parts[0]}年${parts[1].trimStart('0')}月" else m
}
