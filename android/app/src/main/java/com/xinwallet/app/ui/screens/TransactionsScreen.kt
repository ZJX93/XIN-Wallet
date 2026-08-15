package com.xinwallet.app.ui.screens

import java.util.Calendar

import androidx.compose.foundation.background
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
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
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale
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
import com.xinwallet.app.ui.components.BookSwitcherSheet
import com.xinwallet.app.ui.components.CalendarCellData
import com.xinwallet.app.ui.components.CellKind
import com.xinwallet.app.ui.components.SharedCalendarCell
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import androidx.compose.foundation.isSystemInDarkTheme
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
import com.xinwallet.app.ui.viewmodel.shiftMonth
import com.xinwallet.app.ui.viewmodel.TransactionsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import com.xinwallet.app.util.todayDate
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce

/**
 * 账单流水页：月份切换 + 类型筛选 + 当月收支汇总 + 按日分组的流水，
 * 点击任意一条可编辑或删除（转账记录只允许删除，由后端联动删掉配对的另一条腿）。
 */
@Composable
fun TransactionsScreen(navController: NavHostController, initialMonth: String? = null, initialViewMode: String? = null) {
    val vm: TransactionsViewModel = viewModel(factory = viewModelFactory {
        TransactionsViewModel(AppContainer.transactionRepository, AppContainer.accountRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var acting by remember { mutableStateOf<TransactionItem?>(null) }
    var confirmDelete by remember { mutableStateOf<TransactionItem?>(null) }
    var showBookSheet by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // 外部传入的初始月份（如从首页"8月1日-8月31日"跳转而来）
    var appliedInitialMonth by remember { mutableStateOf(false) }
    if (initialMonth != null && !appliedInitialMonth) {
        vm.selectMonth(initialMonth)
        appliedInitialMonth = true
    }
    // 路由里传 view=calendar 时才显式进入日历视图；其他情况一律默认 list
    var appliedInitialView by remember { mutableStateOf(false) }
    if (initialViewMode != null && !appliedInitialView) {
        vm.setViewMode(initialViewMode)
        appliedInitialView = true
    }

    // 当前账本切换后重新初始化（X-Book-Id 已由 AuthInterceptor 注入，vm.init 拉取对应账本数据）
    val curBookId = AppContainer.currentBookId.collectAsState().value
    LaunchedEffect(curBookId) { vm.init() }
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

    // 月份选择器弹窗状态
    var showMonthPicker by remember { mutableStateOf(false) }
    // 视图模式：流水（list）/ 日历（calendar），由 ViewModel 持有，每次进入页面默认为 list
    val viewMode = state.viewMode
    // 日历模式下选中的日期（默认选中今日，显示今日详情）
    var calendarSelectedDay by remember { mutableStateOf(todayDate()) }

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

    BookSwitcherSheet(
        show = showBookSheet,
        onDismiss = { showBookSheet = false },
        onSelect = { id ->
            scope.launch { AppContainer.switchBook(id) }
            showBookSheet = false
        },
        onCreate = { name ->
            scope.launch { AppContainer.createBook(name) }
            showBookSheet = false
        }
    )

    Scaffold(topBar = { BookHeader(onSwapBook = { showBookSheet = true }, onSearch = { navController.navigate(Screen.Search.route) }) }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            // 顶部：流水/日历 切换 + 月份左右切换
            TxTypeMonthBar(
                viewMode = viewMode,
                onViewChange = { vm.setViewMode(it); if (it == "calendar") calendarSelectedDay = todayDate() },
                month = state.month,
                onPrevMonth = { vm.selectMonth(shiftMonth(state.month, -1)) },
                onNextMonth = { vm.selectMonth(shiftMonth(state.month, 1)) },
                onOpenPicker = { showMonthPicker = true }
            )

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
                                        balance = state.summary?.balance ?: 0.0,
                                        txCount = state.items.size
                                    )
                                    Spacer(Modifier.height(8.dp))
                                }
                                if (grouped.isEmpty()) {
                                    val emptyMsg = if (state.accountFilter != null || state.typeFilter != null)
                                        "未找到匹配的交易" else "${state.month} 暂无流水记录"
                                    item { EmptyState(emptyMsg) }
                                } else {
                                    // 整月流水合并为一张卡：日期头 + 当天交易 + 分隔线
                                    item(key = "transactions-card") {
                                        TransactionsCard(grouped) { item -> acting = item }
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
private fun TxTypeMonthBar(
    viewMode: String,
    onViewChange: (String) -> Unit,
    month: String,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onOpenPicker: () -> Unit
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // 左：流水 / 日历 切换（与统计页支出/收入/结余完全一致：外圆角10dp/内9dp/padding3dp/激活padding3dp）
        Row(
            Modifier
                .weight(1f)
                .clip(RoundedCornerShape(10.dp))
                .background(Color(0xFFE7EDEE))
                .padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            listOf("list" to "流水", "calendar" to "日历").forEach { (key, label) ->
                val on = viewMode == key
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(9.dp))
                        .background(if (on) Brown500 else Color.Transparent)
                        .clickable { onViewChange(key) }
                        .padding(vertical = 3.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        label,
                        color = if (on) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp,
                        softWrap = false
                    )
                }
            }
        }
        // 右：月份选择器（‹ 月份 ›），点击月份打开选择弹窗
        Box(
            Modifier.size(32.dp).clickable { onPrevMonth() },
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.ChevronLeft, "上个月", modifier = Modifier.size(20.dp), tint = Brown500)
        }
        Text(
            prettyMonth(month),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            fontSize = 14.sp,
            modifier = Modifier.clickable { onOpenPicker() }
        )
        Box(
            Modifier.size(32.dp).clickable { onNextMonth() },
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.ChevronRight, "下个月", modifier = Modifier.size(20.dp), tint = Brown500)
        }
    }
}

@Composable
private fun SummaryCard(income: Double, expense: Double, balance: Double, txCount: Int) {
    val gradient = androidx.compose.ui.graphics.Brush.horizontalGradient(
        colors = listOf(Brown500, Brown300)
    )
    androidx.compose.material3.Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(20.dp),
        color = Color.Transparent
    ) {
        Box(Modifier.fillMaxWidth().background(gradient).padding(horizontal = 18.dp, vertical = 18.dp)) {
            Column {
                Text("结余", style = MaterialTheme.typography.titleMedium, color = Color.White)
                Spacer(Modifier.height(4.dp))
                Text(
                    "¥ ${formatMoney(balance)}",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    KpiCell("本月支出", expense)
                    KpiCell("本月收入", income)
                    KpiCell("本月预算", 0.0)
                    KpiCell("本月剩余", 0.0)
                }
            }
        }
    }
}

@Composable
private fun KpiCell(label: String, value: Double) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = Color.White.copy(alpha = 0.85f),
            softWrap = false
        )
        Spacer(Modifier.height(2.dp))
        Text(
            formatMoney(value),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            softWrap = false,
            maxLines = 1
        )
    }
}

@Composable
private fun DayHeader(day: String, list: List<TransactionItem>) {
    val income = list.filter { it.type == "income" }.sumOf { it.amount }
    val expense = list.filter { it.type == "expense" }.sumOf { it.amount }
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp),
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

/** 整月流水一张大卡：日期头 + 当天交易（行间细分隔线），日期分组之间粗分隔线 */
@Composable
private fun TransactionsCard(
    grouped: List<Pair<String, List<TransactionItem>>>,
    onItemClick: (TransactionItem) -> Unit
) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(vertical = 2.dp)) {
            grouped.forEachIndexed { gi, (day, list) ->
                DayHeader(day, list)
                list.forEachIndexed { idx, item ->
                    TransactionRowClickable(item) { onItemClick(item) }
                    if (idx != list.lastIndex) {
                        HorizontalDivider(color = Color(0xFFF1F3F4), modifier = Modifier.padding(horizontal = 14.dp))
                    }
                }
                if (gi != grouped.lastIndex) {
                    HorizontalDivider(color = Color(0xFFF1F3F4), modifier = Modifier.padding(horizontal = 16.dp))
                }
            }
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
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 14.dp, vertical = 10.dp),
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

private fun prettyMonth(m: String): String {
    val parts = m.split("-")
    return if (parts.size == 2) "${parts[0]}年${parts[1].trimStart('0')}月" else m
}

/* ============================================================
 * 视图模式切换 + 日历视图（参考暖棕记账 app 改版）
 * ============================================================ */

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
                val balance = income - expense
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(selectedDay, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Text("收 ${formatMoney(income)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Text("支 ${formatMoney(expense)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                        Spacer(Modifier.width(12.dp))
                        Text(
                            "结余 ${if (balance >= 0) "+" else ""}${formatMoney(balance)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (balance >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                        )
                    }
                }
                items(dayItems, key = { "cal-${it.id}" }) { tx ->
                    TransactionRowClickable(tx) { /* 由父级 acting 状态处理（这里只展示） */ }
                }
            }
        }
        item { Spacer(Modifier.height(120.dp)) }
    }
}

/** 6×7 月历格子：含上下月残日（淡化）、当日高亮、当日金额提示（与首页日历完全一致） */
@Composable
private fun MonthCalendarGrid(
    year: Int,
    month: Int,
    totalsByDate: Map<String, Pair<Double, Double>>,
    selectedDay: String?,
    onSelectDay: (String) -> Unit
) {
    // 周一开始（与首页日历一致）
    val cal = java.util.Calendar.getInstance().apply {
        clear(); set(year, month - 1, 1); setFirstDayOfWeek(java.util.Calendar.MONDAY); firstDayOfWeek = java.util.Calendar.MONDAY
    }
    val firstWeekday = cal.get(java.util.Calendar.DAY_OF_WEEK)
    val colOffset = ((firstWeekday - java.util.Calendar.MONDAY) + 7) % 7
    val daysInMonth = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)

    // 上下月信息
    val prevCal = (cal.clone() as java.util.Calendar).apply { add(java.util.Calendar.MONTH, -1) }
    val prevDaysInMonth = prevCal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH)
    val nextCal = (cal.clone() as java.util.Calendar).apply { add(java.util.Calendar.MONTH, 1) }

    val totalCells = 42
    val cells = (0 until totalCells).map { idx -> idx - colOffset + 1 }.map { dayNum ->
        when {
            dayNum < 1 -> {
                CellInfo(day = prevDaysInMonth + dayNum, inMonth = false, date = "", month = -1)
            }
            dayNum > daysInMonth -> {
                CellInfo(day = dayNum - daysInMonth, inMonth = false, date = "", month = 1)
            }
            else -> {
                val date = String.format(java.util.Locale.CHINA, "%04d-%02d-%02d", year, month, dayNum)
                CellInfo(day = dayNum, inMonth = true, date = date, month = 0)
            }
        }
    }
    val weeks = cells.chunked(7)
    val today = remember {
        val t = java.util.Calendar.getInstance()
        String.format(java.util.Locale.CHINA, "%04d-%02d-%02d", t.get(java.util.Calendar.YEAR), t.get(java.util.Calendar.MONTH) + 1, t.get(java.util.Calendar.DAY_OF_MONTH))
    }
    // 月份名（用于上下月残日显示）
    val monthNames = arrayOf("一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二")
    val prevMonthLabel = "${monthNames[prevCal.get(java.util.Calendar.MONTH)]}月"
    val nextMonthLabel = "${monthNames[nextCal.get(java.util.Calendar.MONTH)]}月"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            // 星期表头（周一开始，与首页一致）
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                listOf("一", "二", "三", "四", "五", "六", "日").forEach { w ->
                    Text(
                        w,
                        modifier = Modifier.weight(1f),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            weeks.forEach { row ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    row.forEachIndexed { idx, cell ->
                        val totals = if (cell.date.isNotEmpty()) totalsByDate[cell.date] else null
                        val isSelected = cell.inMonth && cell.date == selectedDay
                        val isToday = cell.inMonth && cell.date == today
                        val dayData = if (cell.inMonth && totals != null) {
                            com.xinwallet.app.data.model.CalendarDay(
                                date = cell.date,
                                income = totals.first,
                                expense = totals.second,
                                hasRecord = true
                            )
                        } else null
                        val kind = when (cell.month) {
                            -1 -> CellKind.PREV
                            1 -> CellKind.NEXT
                            else -> CellKind.CURRENT
                        }
                        val cellData = CalendarCellData(
                            kind = kind,
                            date = cell.date.ifEmpty { null },
                            day = if (cell.inMonth) cell.day else null,
                            // 与首页一致：仅每个残月区域的第一格显示月名，其余留空
                            dayLabel = when {
                                cell.month == -1 && cell.day == prevDaysInMonth - colOffset + 1 -> prevMonthLabel
                                cell.month == 1 && cell.day == 1 -> nextMonthLabel
                                else -> null
                            }
                        )
                        Box(modifier = Modifier.weight(1f)) {
                            SharedCalendarCell(
                                cell = cellData,
                                isSelected = isSelected,
                                isToday = isToday,
                                dayData = dayData,
                                onClick = { if (cell.inMonth) onSelectDay(cell.date) }
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun cellMoney(v: Double): String {
    // 两位小数、无千分符、无前导 0（如 100 → 100.00，1 → 1.00，10000 → 10000.00）
    return String.format(Locale.US, "%.2f", v)
}

private fun cellFontSize(s: String): androidx.compose.ui.unit.TextUnit {
    // 长度自适应：越长字号越小，避免超出日期格
    return when (s.length) {
        in 0..6 -> 9.sp
        in 7..8 -> 8.sp
        else -> 7.sp
    }
}

private data class CellInfo(val day: Int, val inMonth: Boolean, val date: String, val month: Int)

// 本地 CalendarCell 已删除——账单页日历改为使用 SharedCalendarCell（components/CalendarCell.kt）

private fun parseMonth(m: String): Pair<Int, Int> {
    val parts = m.split("-")
    return if (parts.size == 2) parts[0].toInt() to parts[1].toInt() else 2026 to 1
}
