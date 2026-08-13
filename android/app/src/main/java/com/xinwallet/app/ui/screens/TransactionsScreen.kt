package com.xinwallet.app.ui.screens

import java.util.Calendar

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import com.xinwallet.app.ui.components.BookHeader
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
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
    var searchQuery by remember { mutableStateOf(state.search) }
    LaunchedEffect(Unit) {
        snapshotFlow { searchQuery }
            .debounce(300)
            .collectLatest { q ->
                if (q != state.search) {
                    vm.setSearch(q)
                    vm.refresh()
                }
            }
    }

    // 月份选择器 & 账户选择器弹窗状态
    var showMonthPicker by remember { mutableStateOf(false) }
    var showAccountPicker by remember { mutableStateOf(false) }
    // 视图模式：流水（list）/ 日历（calendar）
    var viewMode by remember { mutableStateOf("list") }
    // 日历模式下选中的日期
    var calendarSelectedDay by remember { mutableStateOf<String?>(null) }

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

    if (showMonthPicker) {
        MonthYearPickerDialog(
            initial = state.month,
            onDismiss = { showMonthPicker = false },
            onConfirm = { m ->
                showMonthPicker = false
                vm.selectMonth(m)
            }
        )
    }

    if (showAccountPicker) {
        AccountPickerDialog(
            accounts = state.accounts,
            selected = state.accountFilter,
            onDismiss = { showAccountPicker = false },
            onSelect = { id ->
                showAccountPicker = false
                vm.selectAccount(id)
            }
        )
    }

    Scaffold(topBar = { BookHeader() }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // 搜索框：备注 / 分类名关键字，300ms 防抖后拉取
            SearchBarField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)
            )
            ViewModeToggle(viewMode) { viewMode = it; if (it == "calendar") calendarSelectedDay = null }
            MonthFilterRow(state.months, state.month, { vm.selectMonth(it) }) { showMonthPicker = true }
            TypeFilterRow(state.typeFilter) { vm.selectType(it) }
            AccountFilterRow(state.accounts, state.accountFilter, { vm.selectAccount(it) }) { showAccountPicker = true }

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
                        if (viewMode == "calendar") {
                            CalendarView(
                                month = state.month,
                                items = state.items,
                                selectedDay = calendarSelectedDay,
                                onSelectDay = { calendarSelectedDay = it }
                            )
                        } else {
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
private fun MonthFilterRow(
    months: List<String>,
    selected: String,
    onSelect: (String) -> Unit,
    onOpenPicker: () -> Unit
) {
    // 后端只返回有交易的月份；当前月若无记录也要能选中，故补进去
    val list = remember(months, selected) {
        (if (months.contains(selected)) months else listOf(selected) + months).distinct().take(6)
    }
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        items(list, key = { it }) { m ->
            FilterChip(selected = m == selected, onClick = { onSelect(m) }, label = { Text(prettyMonth(m)) })
        }
        item(key = "picker") {
            FilterChip(
                selected = false,
                onClick = onOpenPicker,
                label = { Text("选择月份") },
                leadingIcon = { Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(18.dp)) }
            )
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
private fun AccountFilterRow(
    accounts: List<Account>,
    selected: Int?,
    onSelect: (Int?) -> Unit,
    onOpenPicker: () -> Unit
) {
    if (accounts.isEmpty()) return
    // 账户多时只露出「全部」+ 当前选中/前两个 + 「更多」，避免横向长条呆板
    val maxInline = 2
    val selectedAcc = accounts.find { it.id == selected }
    val inlineAccounts = remember(accounts, selected) {
        when {
            accounts.size <= maxInline -> accounts
            selectedAcc != null -> listOf(selectedAcc)
            else -> accounts.take(maxInline)
        }
    }
    val hasMore = inlineAccounts.size < accounts.size

    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        item(key = "acc-all") {
            FilterChip(
                selected = selected == null,
                onClick = { onSelect(null) },
                label = { Text("全部账户") }
            )
        }
        items(inlineAccounts, key = { "acc-${it.id}" }) { acc ->
            val isSelected = selected == acc.id
            FilterChip(
                selected = isSelected,
                onClick = { onSelect(acc.id) },
                label = { Text(accountShortLabel(acc), maxLines = 1) }
            )
        }
        if (hasMore) {
            item(key = "acc-more") {
                FilterChip(
                    selected = false,
                    onClick = onOpenPicker,
                    label = { Text("更多账户") },
                    leadingIcon = { Icon(Icons.Filled.KeyboardArrowDown, null, Modifier.size(18.dp)) }
                )
            }
        }
    }
}

private fun accountShortLabel(acc: Account): String {
    val icon = acc.icon?.takeIf { it.isNotBlank() } ?: ""
    val name = acc.name.takeIf { it.isNotBlank() } ?: "账户"
    return "$icon ${name.take(6)}"
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

@Composable
private fun MonthYearPickerDialog(
    initial: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val parts = initial.split("-")
    val initialYear = parts.getOrNull(0)?.toIntOrNull() ?: Calendar.getInstance().get(Calendar.YEAR)
    val initialMonth = parts.getOrNull(1)?.toIntOrNull() ?: (Calendar.getInstance().get(Calendar.MONTH) + 1)

    val currentYear = Calendar.getInstance().get(Calendar.YEAR)
    val years = remember { ((currentYear - 10)..(currentYear + 5)).toList() }
    val months = remember { (1..12).toList() }

    var selYear by remember { mutableStateOf(initialYear) }
    var selMonth by remember { mutableStateOf(initialMonth) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择月份") },
        text = {
            Row(Modifier.fillMaxWidth().height(240.dp)) {
                // 年份列
                LazyColumn(
                    Modifier.weight(1f).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    items(years, key = { it }) { y ->
                        val selected = y == selYear
                        TextButton(onClick = { selYear = y }) {
                            Text(
                                "$y 年",
                                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    }
                }
                // 月份列
                LazyColumn(
                    Modifier.weight(1f).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    items(months, key = { it }) { m ->
                        val selected = m == selMonth
                        TextButton(onClick = { selMonth = m }) {
                            Text(
                                "$m 月",
                                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(String.format("%04d-%02d", selYear, selMonth)) }) {
                Text("确定")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

@Composable
private fun AccountPickerDialog(
    accounts: List<Account>,
    selected: Int?,
    onDismiss: () -> Unit,
    onSelect: (Int?) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("选择账户") },
        text = {
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                item {
                    Row(
                        Modifier.fillMaxWidth().clickable { onSelect(null) }.padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = selected == null, onClick = { onSelect(null) })
                        Spacer(Modifier.width(8.dp))
                        Text("全部账户")
                    }
                }
                items(accounts, key = { it.id }) { acc ->
                    Row(
                        Modifier.fillMaxWidth().clickable { onSelect(acc.id) }.padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(selected = selected == acc.id, onClick = { onSelect(acc.id) })
                        Spacer(Modifier.width(8.dp))
                        Text(accountShortLabel(acc), style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } }
    )
}

private fun prettyMonth(m: String): String {
    val parts = m.split("-")
    return if (parts.size == 2) "${parts[0]}年${parts[1].trimStart('0')}月" else m
}

/* ============================================================
 * 视图模式切换 + 日历视图（参考暖棕记账 app 改版）
 * ============================================================ */

@Composable
private fun ViewModeToggle(current: String, onChange: (String) -> Unit) {
    val options = listOf("list" to "流水", "calendar" to "日历")
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        options.forEach { (key, label) ->
            val selected = current == key
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clickable { onChange(key) },
                shape = RoundedCornerShape(50),
                color = if (selected) Brown500 else MaterialTheme.colorScheme.surface,
                border = if (!selected) androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.onSurface,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarView(
    month: String,
    items: List<com.xinwallet.app.data.model.TransactionItem>,
    selectedDay: String?,
    onSelectDay: (String) -> Unit
) {
    val byDate = remember(items) {
        items.groupBy { it.date.take(10) }.mapValues { (_, list) ->
            val income = list.filter { it.type == "income" }.sumOf { it.amount }
            val expense = list.filter { it.type == "expense" }.sumOf { it.amount }
            income to expense
        }
    }
    val monthYm = remember(month) { parseMonth(month) }
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        item {
            Spacer(Modifier.height(8.dp))
            MonthCalendarGrid(
                year = monthYm.first,
                month = monthYm.second,
                totalsByDate = byDate,
                selectedDay = selectedDay,
                onSelectDay = onSelectDay
            )
            Spacer(Modifier.height(12.dp))
        }
        if (selectedDay != null) {
            val dayItems = items.filter { it.date.take(10) == selectedDay }.sortedByDescending { it.date }
            if (dayItems.isEmpty()) {
                item { Text("${selectedDay} 暂无记录", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
            } else {
                val income = dayItems.filter { it.type == "income" }.sumOf { it.amount }
                val expense = dayItems.filter { it.type == "expense" }.sumOf { it.amount }
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(selectedDay, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("收 ${formatMoney(income)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Text("支 ${formatMoney(expense)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                }
                items(dayItems, key = { "cal-${it.id}" }) { tx ->
                    TransactionRowClickable(tx) { /* 由父级 acting 状态处理（这里只展示） */ }
                }
            }
        }
        item { Spacer(Modifier.height(80.dp)) }
    }
}

/** 6×7 月历格子：含上下月残日（淡化）、当日高亮、当日金额提示 */
@Composable
private fun MonthCalendarGrid(
    year: Int,
    month: Int,
    totalsByDate: Map<String, Pair<Double, Double>>,
    selectedDay: String?,
    onSelectDay: (String) -> Unit
) {
    val cal = java.util.Calendar.getInstance().apply { clear(); set(year, month - 1, 1) }
    val firstWeekday = cal.get(java.util.Calendar.DAY_OF_WEEK) // 1=Sun..7=Sat
    val daysInMonth = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
    val prevMonthDays = firstWeekday - 1
    // 固定 6 行（最多 42 格），便于布局稳定
    val totalCells = 42
    val cells = (0 until totalCells).map { idx ->
        val dayNum = idx - prevMonthDays + 1
        when {
            dayNum < 1 -> {
                val pm = java.util.Calendar.getInstance().apply { clear(); set(year, month - 1, 1); add(java.util.Calendar.MONTH, -1) }
                val pmDays = pm.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
                CellInfo(day = pmDays + dayNum, inMonth = false, date = "")
            }
            dayNum > daysInMonth -> {
                CellInfo(day = dayNum - daysInMonth, inMonth = false, date = "")
            }
            else -> {
                val date = String.format(java.util.Locale.CHINA, "%04d-%02d-%02d", year, month, dayNum)
                CellInfo(day = dayNum, inMonth = true, date = date)
            }
        }
    }
    val weeks = cells.chunked(7)
    val today = remember {
        val t = java.util.Calendar.getInstance()
        String.format(java.util.Locale.CHINA, "%04d-%02d-%02d", t.get(java.util.Calendar.YEAR), t.get(java.util.Calendar.MONTH) + 1, t.get(java.util.Calendar.DAY_OF_MONTH))
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(Modifier.padding(vertical = 12.dp, horizontal = 8.dp)) {
            // 星期表头
            Row(Modifier.fillMaxWidth()) {
                listOf("日", "一", "二", "三", "四", "五", "六").forEach { w ->
                    Text(
                        w,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            weeks.forEach { row ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    row.forEach { cell ->
                        val totals = if (cell.date.isNotEmpty()) totalsByDate[cell.date] else null
                        val isSelected = cell.inMonth && cell.date == selectedDay
                        val isToday = cell.inMonth && cell.date == today
                        CalendarCell(
                            day = cell.day,
                            inMonth = cell.inMonth,
                            isSelected = isSelected,
                            isToday = isToday,
                            income = totals?.first ?: 0.0,
                            expense = totals?.second ?: 0.0,
                            onClick = { if (cell.inMonth) onSelectDay(cell.date) },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

private data class CellInfo(val day: Int, val inMonth: Boolean, val date: String)

@Composable
private fun CalendarCell(
    day: Int,
    inMonth: Boolean,
    isSelected: Boolean,
    isToday: Boolean,
    income: Double,
    expense: Double,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = when {
        isSelected -> Brown500
        isToday -> Brown100
        else -> androidx.compose.ui.graphics.Color.Transparent
    }
    val textColor = when {
        isSelected -> androidx.compose.ui.graphics.Color.White
        !inMonth -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
        else -> MaterialTheme.colorScheme.onSurface
    }
    Box(
        modifier = modifier
            .height(54.dp)
            .padding(2.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .clickable(enabled = inMonth, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                day.toString(),
                style = MaterialTheme.typography.bodyMedium,
                color = textColor,
                fontWeight = if (isSelected || isToday) FontWeight.SemiBold else FontWeight.Normal
            )
            if (inMonth && (income > 0 || expense > 0)) {
                Spacer(Modifier.height(2.dp))
                Text(
                    if (income > 0 && expense > 0) "-${formatMoney(expense)}\n+${formatMoney(income)}"
                    else if (income > 0) "+${formatMoney(income)}"
                    else "-${formatMoney(expense)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) androidx.compose.ui.graphics.Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1
                )
            }
        }
    }
}

private fun parseMonth(m: String): Pair<Int, Int> {
    val parts = m.split("-")
    return if (parts.size == 2) parts[0].toInt() to parts[1].toInt() else 2026 to 1
}
