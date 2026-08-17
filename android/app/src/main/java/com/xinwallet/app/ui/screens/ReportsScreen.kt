package com.xinwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Calendar
import java.util.Locale
import androidx.lifecycle.viewmodel.compose.viewModel
import com.xinwallet.app.data.model.ReportCategorySlice
import com.xinwallet.app.data.model.TopTransaction
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BookHeader
import androidx.navigation.NavHostController
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.components.BookSwitcherSheet
import com.xinwallet.app.ui.components.CategoryBars
import com.xinwallet.app.ui.components.DonutChart
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LinearProgress
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.viewmodel.ReportsViewModel
import com.xinwallet.app.ui.viewmodel.shiftMonth
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.util.formatMoney
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import java.util.regex.Pattern

private val DATA_TYPE_OPTIONS = listOf("expense" to "支出", "income" to "收入", "balance" to "结余")
private val GRAN_OPTIONS = listOf("minor" to "小类", "major" to "大类") // 截图：默认"小类"激活

/** "2026-08" → "2026年8月" */
private fun monthLabel(period: String): String {
    val m = Pattern.compile("(\\d{4})-(\\d{2})").matcher(period)
    if (!m.find()) return period
    return "${m.group(1)}年${m.group(2)?.toIntOrNull() ?: 0}月"
}

/** 顶部时间选择器显示文案：月=年月，年=年份，自定义=年月-年月 */
private fun periodDisplay(period: String, periodMode: String): String {
    return when (periodMode) {
        "year" -> "${period.take(4)}年"
        "custom" -> {
            val p = period.split("~")
            val s = p.getOrNull(0)?.take(7) ?: period
            val e = p.getOrNull(1)?.take(7) ?: period
            "$s - $e"
        }
        else -> monthLabel(period)
    }
}

/** "2026-08-12" → "2026-08-12"（趋势头部用 ISO 日期，跟截图一致） */
private fun isoDay(iso: String): String = iso.take(10)

/**
 * 统计页（截图版布局）：
 * 顶部：[支出/收入/结余 tab]               [‹ 2026年08月 ›]
 *   ─ 支出: 4KPI(2x2) → 支出趋势 → 分类排行 → 明细排行
 *   ─ 收入: 2KPI → 收入趋势 → 分类排行 → 明细排行
 *   ─ 结余: 2KPI → 结余趋势 → 每日概况（绿色表头大表格）
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen(navController: NavHostController) {
    val vm: ReportsViewModel = viewModel(factory = viewModelFactory { ReportsViewModel(AppContainer.reportRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    // 当前账本切换后重新拉取报表
    val curBookId = AppContainer.currentBookId.collectAsState().value
    LaunchedEffect(curBookId) { vm.reload() }

    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.consumeError() } }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0), // 与首页/账单一致：让 BookHeader.statusBarsPadding 单独负责状态栏 inset，避免双层留白
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading && state.report == null -> LoadingBox()
            state.error != null && state.report == null -> ErrorState(state.error!!, onRetry = { vm.setPeriod(state.period) })
            state.report != null -> ReportContent(
                report = state.report!!,
                dataType = state.dataType,
                period = state.period,
                periodMode = state.periodMode,
                months = emptyList(), // TODO: 从后端获取有交易的月份列表
                minYear = Calendar.getInstance().get(Calendar.YEAR) - 5, // 默认近 5 年，可从数据推算
                topTransactions = state.topTransactions,
                onDataTypeChange = vm::setDataType,
                onPeriodChange = { period, mode -> vm.setPeriodMode(mode); vm.setPeriod(period) },
                onSearch = { navController.navigate(Screen.Search.route) },
                modifier = Modifier.fillMaxSize().padding(padding)
            )
            else -> EmptyState("暂无报表数据")
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportContent(
    report: com.xinwallet.app.data.model.FinanceReport,
    dataType: String,
    period: String,
    periodMode: String = "month",
    months: List<String> = emptyList(),
    minYear: Int,
    topTransactions: List<TopTransaction>,
    onDataTypeChange: (String) -> Unit,
    onPeriodChange: (String, String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier
) {
    var granularity by remember { mutableStateOf("major") } // 默认"大类"激活
    var showBookSheet by remember { mutableStateOf(false) }
    var showPeriodPicker by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // KPI 计算
    val kpis = remember(report, dataType, periodMode, period) { buildKpis(dataType, report, periodMode, period) }

    // 趋势序列 + 峰值日
    val series = remember(report, dataType) {
        when (dataType) {
            "income" -> report.dailyTrend.map { it.income }
            "balance" -> {
                val out = mutableListOf<Double>()
                var acc = 0.0
                report.dailyTrend.forEach { p -> acc += (p.income - p.expense); out.add(acc) }
                out
            }
            else -> report.dailyTrend.map { it.expense }
        }
    }
    val peakIndex = remember(series) {
        if (series.isEmpty()) null else run {
            var idx = 0
            for (i in series.indices) if (series[i] > series[idx]) idx = i
            idx
        }
    }

    // 分类排行数据（仅 支出/收入 维度）
    val rawCats = remember(report, dataType) {
        if (dataType == "income") report.incomeByCategory else report.expenseByCategory
    }
    val cats = remember(rawCats, granularity) {
        if (granularity == "major") {
            // 「大类」仅展示顶层分类（parentId 为空，后端已将其子类的金额上卷到此处）
            rawCats.filter { it.parentId == null }
        } else {
            // 「小类」= 末级（叶子）分类：既包含挂在顶层下的二级子类（parentId 非空），
            // 也包含本身没有子类的顶层分类（parentId 为空，但无其他分类以其为父）。
            // 过滤掉「是其它分类父级」的分类，避免大类与子类同时出现造成重复/叠加。
            val parentIds = rawCats.mapNotNull { it.parentId }.toSet()
            rawCats.filter { it.id !in parentIds }
        }
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

    // 时间选择器弹窗
    if (showPeriodPicker) {
        ReportPeriodPickerDialog(
            initialPeriod = period,
            initialMode = periodMode,
            minYear = minYear,
            onDismiss = { showPeriodPicker = false },
            onConfirm = { newPeriod, newMode ->
                showPeriodPicker = false
                onPeriodChange(newPeriod, newMode)
            }
        )
    }

    Column(modifier) {
        // —— 顶部固定区（账本头） ——
        BookHeader(onSwapBook = { showBookSheet = true }, onSearch = onSearch)

        // —— 类型 tab + 月份选择器（同一行；不随下方报表滚动） ——
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // 左列：类型 tab（填充整列，宽度对齐"支出金额"卡；3 段均分列宽）
            Row(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFFE7EDEE))
                    .padding(3.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                DATA_TYPE_OPTIONS.forEach { (value, label) ->
                    val on = dataType == value
                    Box(
                        Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(9.dp))
                            .background(if (on) Brown500 else Color.Transparent)
                            .clickable { onDataTypeChange(value) }
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
            // 右列：周期选择器（点击打开选择弹窗）
            Row(
                Modifier.weight(1f),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.End
            ) {
                Box(
                    Modifier.size(32.dp).clickable(enabled = periodMode != "custom") {
                        // 左箭头：按月 shiftMonth，按年 ±1 年（自定义模式无相邻周期概念）
                        if (periodMode == "year") {
                            val y = period.take(4).toIntOrNull() ?: return@clickable
                            onPeriodChange("${y - 1}", "year")
                        } else {
                            onPeriodChange(shiftMonth(period, -1), periodMode)
                        }
                    },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Filled.ChevronLeft, "上一个周期",
                        modifier = Modifier.size(20.dp),
                        tint = Brown500
                    )
                }
                Text(
                    periodDisplay(period, periodMode),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    modifier = Modifier.clickable { showPeriodPicker = true }
                )
                Box(
                    Modifier.size(32.dp).clickable(enabled = periodMode != "custom") {
                        // 右箭头：按月 shiftMonth，按年 +1 年（自定义模式无相邻周期概念）
                        if (periodMode == "year") {
                            val y = period.take(4).toIntOrNull() ?: return@clickable
                            onPeriodChange("${y + 1}", "year")
                        } else {
                            onPeriodChange(shiftMonth(period, 1), periodMode)
                        }
                    },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Filled.ChevronRight, "下一个周期",
                        modifier = Modifier.size(20.dp),
                        tint = Brown500
                    )
                }
            }
        }

        // —— 仅下方报表内容滚动 ——
        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            // KPI 卡片（按维度不同）
            item { KpiGrid(kpis) }
            item { Spacer(Modifier.height(12.dp)) }

            // 趋势
            item { TrendCard(dataType, report, series, peakIndex, periodMode) }
            item { Spacer(Modifier.height(12.dp)) }

            // 支出 / 收入：分类排行 + 明细排行
            if (dataType != "balance") {
                item {
                    CategoryRankingCard(
                        categories = cats,
                        granularity = granularity,
                        onGranularityChange = { granularity = it }
                    )
                }
                item { Spacer(Modifier.height(12.dp)) }
                if (topTransactions.isNotEmpty()) {
                    item { DetailRankingCard(topTransactions, isIncome = dataType == "income") }
                }
            } else {
                // 结余：每日概况大表格
                item { DailyOverviewTable(report) }
            }
        }
    }
}

/**
 * 顶部账本标题：复用共享 BookHeader（默认账本 + 切换 / 搜索图标）。
 */

/* ────────── KPI 网格 ────────── */

private data class KpiSpec(val title: String, val value: String, val accent: Color, val icon: String)

/**
 * 根据时间维度计算「均值」标签与除数：
 * - 按月：日均，除数 30
 * - 按年：月均，除数 12
 * - 自定义：≤2月→日均(天数)；>2月 且 ≤2年→月均(月数)；>2年→年均(年数)
 */
private fun avgLabelAndDivisor(periodMode: String, period: String): Pair<String, Double> {
    return when (periodMode) {
        "year" -> "月均" to 12.0
        "custom" -> {
            val parts = period.split("~")
            if (parts.size == 2) {
                val s = parseDate(parts[0]); val e = parseDate(parts[1])
                if (s != null && e != null) {
                    val days = ((e.timeInMillis - s.timeInMillis) / 86_400_000L).toInt() + 1
                    if (days <= 60) return "日均" to days.toDouble().coerceAtLeast(1.0)
                    val months = (e.get(Calendar.YEAR) - s.get(Calendar.YEAR)) * 12 +
                        (e.get(Calendar.MONTH) - s.get(Calendar.MONTH))
                    if (months > 24) return "年均" to (e.get(Calendar.YEAR) - s.get(Calendar.YEAR)).toDouble().coerceAtLeast(1.0)
                    return "月均" to months.toDouble().coerceAtLeast(1.0)
                }
            }
            "日均" to 30.0
        }
        else -> "日均" to 30.0
    }
}

/** "YYYY-MM" 或 "YYYY-MM-DD" → Calendar（解析失败返回 null） */
private fun parseDate(d: String): Calendar? {
    val m = Regex("(\\d{4})-(\\d{2})(?:-(\\d{2}))?").find(d) ?: return null
    val y = m.groupValues[1].toIntOrNull() ?: return null
    val mo = m.groupValues[2].toIntOrNull()?.minus(1) ?: return null
    val day = m.groupValues[3].toIntOrNull() ?: 1
    return Calendar.getInstance().apply { set(y, mo, day) }
}

private fun buildKpis(dataType: String, report: com.xinwallet.app.data.model.FinanceReport, periodMode: String = "month", period: String): List<KpiSpec> {
    val s = report.summary
    val main = Color(0xFF995F2C) // 暖棕主色
    // 预算前缀：本月 / 本年 / (自定义无前缀)
    val periodPrefix = when (periodMode) {
        "year" -> "本年"
        "custom" -> ""
        else -> "本月"
    }
    val (avgLabel, avgDivisor) = avgLabelAndDivisor(periodMode, period)
    return when (dataType) {
        "income" -> listOf(
            KpiSpec("收入金额", formatMoney(s.income), Color(0xFFC11435), "💵"),
            KpiSpec("${avgLabel}收入", formatMoney(s.income / avgDivisor), Color(0xFFC11435), "📅")
        )
        "balance" -> listOf(
            KpiSpec("结余金额", formatMoney(s.balance), main, "🎯"),
            KpiSpec("${avgLabel}结余", formatMoney(s.balance / avgDivisor), main, "📅")
        )
        else -> {
            // 支出：4 张 = 支出金额 / (日均|月均|年均)支出 / (本月|本年)预算 / 剩余预算
            val totalBudget = report.budgetExecution.sumOf { it.budget }
            val totalActual = report.budgetExecution.sumOf { it.actual }
            val remaining = totalBudget - totalActual
            val green = Color(0xFF009558)
            listOf(
                KpiSpec("支出金额", formatMoney(s.expense), green, "💸"),
                KpiSpec("${avgLabel}支出", formatMoney(s.expense / avgDivisor), green, "📅"),
                KpiSpec(if (periodPrefix.isEmpty()) "预算" else "${periodPrefix}预算", formatMoney(totalBudget), main, "💰"),
                KpiSpec("剩余预算", formatMoney(remaining), main, "⏳")
            )
        }
    }
}

@Composable
private fun KpiGrid(specs: List<KpiSpec>) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        specs.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { sp -> KpiCard(sp, Modifier.weight(1f)) }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

@Composable
private fun KpiCard(s: KpiSpec, modifier: Modifier = Modifier) {
    Card(
        modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(26.dp)) {
                    Box(contentAlignment = Alignment.Center) { Text(s.icon, fontSize = 14.sp) }
                }
                Spacer(Modifier.width(8.dp))
                Text(s.title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            Text(s.value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = s.accent)
        }
    }
}

/* ────────── 趋势卡片 ────────── */

@Composable
private fun TrendCard(
    dataType: String,
    report: com.xinwallet.app.data.model.FinanceReport,
    series: List<Double>,
    peakIndex: Int?,
    periodMode: String = "month"
) {
    // 选中日索引：默认峰值日；点击图表切换为点中的那一天
    var selectedIndex by remember(series) { mutableStateOf(peakIndex) }

    val (title, color, dayLabelPrefix, cumLabel) = when (dataType) {
        "income" -> Quadruple(
            "收入趋势",
            Color(0xFFC11435),
            "收入",
            "累计收入 ${formatMoney(series.sum())}"
        )
        "balance" -> Quadruple(
            "结余趋势",
            Color(0xFF995F2C),
            "结余",
            "期末结余 ${formatMoney(series.lastOrNull() ?: 0.0)}"
        )
        else -> Quadruple(
            "支出趋势",
            Color(0xFF009558),
            "支出",
            "累计支出 ${formatMoney(series.sum())}"
        )
    }

    // 左：选中日期 + 当日值（无 ¥ 符号）；累计始终为整月累计
    val dayLabel = selectedIndex
        ?.takeIf { it in report.dailyTrend.indices && it in series.indices }
        ?.let { "${isoDay(report.dailyTrend[it].date)}  $dayLabelPrefix ${formatMoney(series[it])}" }
        ?: "本月暂无数据"

    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(dayLabel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(cumLabel, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = color)
            }
            Spacer(Modifier.height(8.dp))
            if (series.isEmpty() || (series.maxOrNull() ?: 0.0) <= 0) {
                EmptyState("该周期暂无数据")
            } else {
                com.xinwallet.app.ui.components.TrendLineChartSingle(
                    series, color,
                    peakIndex = selectedIndex,
                    onTapIndex = { selectedIndex = it }
                )
                Spacer(Modifier.height(2.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    // 按年模式显示 01-12 月，按月模式显示日期
                    val xLabels = if (periodMode == "year") {
                        (1..12).map { String.format("%02d", it) }
                    } else {
                        listOf("01", "05", "10", "15", "20", "25", "30")
                    }
                    xLabels.forEach {
                        Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

/* ────────── 分类排行（截图大环形+引导线+列表项） ────────── */

@Composable
private fun CategoryRankingCard(
    categories: List<ReportCategorySlice>,
    granularity: String,
    onGranularityChange: (String) -> Unit
) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("分类排行", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Row {
                    GRAN_OPTIONS.forEach { (value, label) ->
                        val selected = granularity == value
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = if (selected) Color(0xFF1F1F1F) else MaterialTheme.colorScheme.surfaceVariant,
                            modifier = Modifier.padding(start = 4.dp)
                        ) {
                            Text(
                                label,
                                color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelMedium,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(50))
                                    .noRippleClickable { onGranularityChange(value) }
                                    .padding(horizontal = 14.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            if (categories.isEmpty()) {
                EmptyState("该周期暂无分类数据")
            } else {
                // 选中的分类（默认金额最大的分类），点击环形图色块切换
                var selectedName by remember(categories) { mutableStateOf(categories.maxByOrNull { it.total }?.name) }
                val selected = categories.find { it.name == selectedName } ?: categories.firstOrNull()
                Spacer(Modifier.height(6.dp))
                // 稳定 data：避免每次点击都重建 DonutChart 手势检测器导致卡顿
                val pieData = remember(categories) { categories.map { it.name to it.total } }
                DonutChart(
                    data = pieData,
                    centerTitle = selected?.name,
                    centerAmount = selected?.let { formatMoney(it.total) },
                    selectedLabel = selected?.name,
                    onSliceClick = { name -> selectedName = name }
                )
                Spacer(Modifier.height(8.dp))
                CategoryBars(categories)
            }
        }
    }
}

/* ────────── 明细排行 ────────── */

@Composable
private fun DetailRankingCard(items: List<TopTransaction>, isIncome: Boolean) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(vertical = 4.dp)) {
            Text(
                "明细排行",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
            )
            items.forEach { tx ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        modifier = Modifier.size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) { Text(tx.categoryIcon ?: "📌") }
                    }
                    Spacer(Modifier.width(12.dp))
                    Text(
                        tx.categoryName ?: "交易",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            (if (isIncome) "" else "-") + formatMoney(tx.amount),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = if (isIncome) Color(0xFFC11435) else Color(0xFF009558)
                        )
                        Text(
                            tx.date.take(10).replace("-", "."),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

/* ────────── 结余：每日概况大表格 ────────── */

@Composable
private fun DailyOverviewTable(report: com.xinwallet.app.data.model.FinanceReport) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            Text(
                "每日概况",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)
            )
            // 表头（暖棕品牌色，截图是薄荷绿——这里保留暖棕保持一致）
            Row(
                Modifier.fillMaxWidth().background(Color(0xFF995F2C)),
                horizontalArrangement = Arrangement.SpaceAround,
                verticalAlignment = Alignment.CenterVertically
            ) {
                    listOf("日期", "支出", "收入", "结余").forEach {
                        Text(
                            it,
                            color = Color.White,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(vertical = 12.dp).weight(1f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
                report.dailyTrend.forEach { p ->
                    val balance = p.income - p.expense
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceAround,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        listOf(
                            p.date.takeLast(5).replace("-", "."),
                            if (p.expense > 0) "-${formatMoney(p.expense)}" else "—",
                            if (p.income > 0) "+${formatMoney(p.income)}" else "—",
                            if (balance != 0.0) formatMoney(balance) else "—"
                        ).forEachIndexed { idx, text ->
                            val color = when (idx) {
                                1 -> Color(0xFFC11435) // 支出按收入红 +符号位
                                2 -> Color(0xFF009558) // 收入按支出绿
                                3 -> if (balance < 0) Color(0xFFC11435) else Color(0xFF009558)
                                else -> MaterialTheme.colorScheme.onSurface
                            }
                            Text(
                                text,
                                style = MaterialTheme.typography.bodySmall,
                                color = color,
                                modifier = Modifier.padding(vertical = 10.dp).weight(1f),
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center
                            )
                        }
                    }
                }
                // 汇总行
                val totalExpense = report.summary.expense
                val totalIncome = report.summary.income
                val totalBalance = totalIncome - totalExpense
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant),
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    listOf(
                        "汇总",
                        if (totalExpense > 0) "-${formatMoney(totalExpense)}" else "—",
                        if (totalIncome > 0) "+${formatMoney(totalIncome)}" else "—",
                        formatMoney(totalBalance)
                    ).forEachIndexed { idx, text ->
                        Text(
                            text,
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = when (idx) {
                                3 -> if (totalBalance < 0) Color(0xFFC11435) else Color(0xFF009558)
                                1 -> Color(0xFFC11435)
                                2 -> Color(0xFF009558)
                                else -> MaterialTheme.colorScheme.onSurface
                            },
                            modifier = Modifier.padding(vertical = 12.dp).weight(1f),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }
}

/* ────────── 工具 ────────── */

private data class Quadruple<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

@Composable
private fun Modifier.noRippleClickable(onClick: () -> Unit): Modifier =
    this.then(
        Modifier.clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = onClick
        )
    )

/* ────────── 统计页时间选择器弹窗（三 tab：按月/按年/自定义） ────────── */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReportPeriodPickerDialog(
    initialPeriod: String,      // "YYYY-MM" 或 "YYYY"
    initialMode: String,        // "month" / "year" / "custom"
    minYear: Int,               // 最早交易年份（按年视图首页起点）
    onDismiss: () -> Unit,
    onConfirm: (String, String) -> Unit   // (period, mode)
) {
    val currentYear = Calendar.getInstance().get(Calendar.YEAR)
    val currentMonthInt = Calendar.getInstance().get(Calendar.MONTH) + 1

    val initYear = initialPeriod.take(4).toIntOrNull() ?: currentYear
    val initMonth = if (initialPeriod.length >= 7) initialPeriod.substring(5, 7).trimStart('0').toIntOrNull() ?: currentMonthInt else currentMonthInt

    var mode by remember { mutableStateOf(initialMode) }
    var selYear by remember { mutableStateOf(initYear) }
    var selMonth by remember { mutableStateOf(initMonth) }
    // 按年视图：12 年一页
    var selYearBase by remember {
        mutableStateOf(((initYear - minYear).coerceAtLeast(0) / 12) * 12 + minYear)
    }
    // 自定义：起止月份（格式 YYYY-MM）
    var customStart by remember { mutableStateOf(if (initialMode == "custom" && initialPeriod.contains("~")) initialPeriod.substringBefore("~") else "") }
    var customEnd by remember { mutableStateOf(if (initialMode == "custom" && initialPeriod.contains("~")) initialPeriod.substringAfter("~") else "") }

    val months = remember { (1..12).toList() }
    val monthYears = remember { (currentYear - 8)..(currentYear + 3) }
    val pageYears = remember(selYearBase) { (selYearBase..selYearBase + 11).toList() }

    // 选中色：青绿色（与截图一致）
    val accentColor = ExpenseColor

    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        containerColor = Color.White,
        dragHandle = null
    ) {
        Column(Modifier.padding(horizontal = 24.dp)) {
            // 顶部 tab：按月查看 / 按年查看 / 自定义（无背景，选中显示下划线）
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                listOf("month" to "按月查看", "year" to "按年查看", "custom" to "自定义").forEach { (key, label) ->
                    val on = mode == key
                    Column(
                        Modifier.clickable { mode = key }.padding(horizontal = 14.dp, vertical = 12.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            label,
                            color = if (on) accentColor else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp
                        )
                        if (on) {
                            Spacer(Modifier.height(6.dp))
                            Box(Modifier.width(28.dp).height(2.dp).background(accentColor))
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))

            when (mode) {
                "month" -> {
                    // 第二行：年份选择
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = { selYear -= 1 }, enabled = selYear > monthYears.first()) {
                            Icon(Icons.Filled.ChevronLeft, "上一年", tint = accentColor)
                            Spacer(Modifier.width(4.dp))
                            Text("${selYear - 1}", color = accentColor, fontSize = 13.sp)
                        }
                        Text("$selYear", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { selYear += 1 }, enabled = selYear < monthYears.last()) {
                            Text("${selYear + 1}", color = accentColor, fontSize = 13.sp)
                            Spacer(Modifier.width(4.dp))
                            Icon(Icons.Filled.ChevronRight, "下一年", tint = accentColor)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    // 12 个月份网格，点击即确认
                    val cols = 4
                    months.chunked(cols).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { m ->
                                val isSelected = m == selMonth && selYear == initYear
                                val isCurrent = m == currentMonthInt && currentYear == selYear
                                // 未来月份置灰（当前年且月份 > 当前月）
                                val isFuture = currentYear == selYear && m > currentMonthInt
                                Box(
                                    Modifier
                                        .weight(1f)
                                        .aspectRatio(2.2f)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(
                                            when {
                                                isSelected -> accentColor
                                                isCurrent -> Color(0xFFE8F5E9)
                                                isFuture -> Color(0xFFF0F0F0)
                                                else -> Color(0xFFF5F5F5)
                                            }
                                        )
                                        .clickable(enabled = !isFuture) {
                                            onConfirm(String.format("%04d-%02d", selYear, m), "month")
                                        },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        "${m}月",
                                        color = when {
                                            isSelected -> Color.White
                                            isCurrent -> accentColor
                                            isFuture -> Color(0xFFBDBDBD)
                                            else -> MaterialTheme.colorScheme.onSurface
                                        },
                                        fontWeight = if (isSelected || isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                                        fontSize = 14.sp
                                    )
                                }
                            }
                            repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }
                "year" -> {
                    // 第二行：年份翻页（12 年一页）
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = { selYearBase = (selYearBase - 12).coerceAtLeast(minYear) }, enabled = selYearBase > minYear) {
                            Icon(Icons.Filled.ChevronLeft, "上一页", tint = accentColor)
                            Spacer(Modifier.width(4.dp))
                            Text("${selYearBase - 1}", color = accentColor, fontSize = 13.sp)
                        }
                        Text("年份", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { selYearBase += 12 }) {
                            Text("${selYearBase + 12}", color = accentColor, fontSize = 13.sp)
                            Spacer(Modifier.width(4.dp))
                            Icon(Icons.Filled.ChevronRight, "下一页", tint = accentColor)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    // 年份网格：12 个年份，点击即确认
                    val yCols = 4
                    pageYears.chunked(yCols).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { y ->
                                val isSelected = y == selYear
                                val isCurrent = y == currentYear
                                Box(
                                    Modifier
                                        .weight(1f)
                                        .aspectRatio(2.0f)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(
                                            when {
                                                isSelected -> accentColor
                                                isCurrent -> Color(0xFFE8F5E9)
                                                else -> Color(0xFFF5F5F5)
                                            }
                                        )
                                        .clickable { onConfirm("$y", "year") },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        "$y",
                                        color = when {
                                            isSelected -> Color.White
                                            isCurrent -> accentColor
                                            else -> MaterialTheme.colorScheme.onSurface
                                        },
                                        fontWeight = if (isSelected || isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                                        fontSize = 15.sp
                                    )
                                }
                            }
                            repeat(yCols - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                }
                "custom" -> {
                    // 自定义：按月选择起止（开始/结束切换 + 年份箭头 + 12 月网格）
                    var editing by remember { mutableStateOf("start") }
                    var sy by remember { mutableStateOf(customStart.take(4).toIntOrNull() ?: currentYear) }
                    var ey by remember { mutableStateOf(customEnd.take(4).toIntOrNull() ?: currentYear) }
                    val cols = 4
                    val activeYear = if (editing == "start") sy else ey

                    // 开始 / 结束 切换（无背景，选中白底）
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0xFFF0EDEE)).padding(3.dp),
                        horizontalArrangement = Arrangement.Center
                    ) {
                        listOf("start" to "开始", "end" to "结束").forEach { (key, label) ->
                            val on = editing == key
                            Box(
                                Modifier.weight(1f).clip(RoundedCornerShape(9.dp))
                                    .background(if (on) Color.White else Color.Transparent)
                                    .clickable { editing = key }
                                    .padding(vertical = 7.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    label,
                                    color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 13.sp
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(16.dp))

                    // 当前编辑字段的年份箭头
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = { if (editing == "start") sy -= 1 else ey -= 1 }) {
                            Icon(Icons.Filled.ChevronLeft, "上一年", tint = accentColor)
                            Spacer(Modifier.width(4.dp))
                            Text("${activeYear - 1}", color = accentColor, fontSize = 13.sp)
                        }
                        Text("$activeYear", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { if (editing == "start") sy += 1 else ey += 1 }) {
                            Text("${activeYear + 1}", color = accentColor, fontSize = 13.sp)
                            Spacer(Modifier.width(4.dp))
                            Icon(Icons.Filled.ChevronRight, "下一年", tint = accentColor)
                        }
                    }
                    Spacer(Modifier.height(16.dp))

                    // 12 个月份网格：点击设置当前编辑字段
                    months.chunked(cols).forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            row.forEach { m ->
                                val mm = String.format("%04d-%02d", activeYear, m)
                                val isSel = if (editing == "start") mm == customStart else mm == customEnd
                                Box(
                                    Modifier
                                        .weight(1f)
                                        .aspectRatio(2.2f)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(if (isSel) accentColor else Color(0xFFF5F5F5))
                                        .clickable { if (editing == "start") customStart = mm else customEnd = mm },
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        "${m}月",
                                        color = if (isSel) Color.White else MaterialTheme.colorScheme.onSurface,
                                        fontWeight = if (isSel) FontWeight.SemiBold else FontWeight.Normal,
                                        fontSize = 14.sp
                                    )
                                }
                            }
                            repeat(cols - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                        Spacer(Modifier.height(10.dp))
                    }

                    Spacer(Modifier.height(8.dp))
                    // 已选范围提示
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        Text(
                            "${if (customStart.isEmpty()) "开始?" else customStart}  ~  ${if (customEnd.isEmpty()) "结束?" else customEnd}",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    // 确定按钮
                    androidx.compose.material3.Button(
                        onClick = { onConfirm("$customStart~$customEnd", "custom") },
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = accentColor),
                        enabled = customStart.isNotEmpty() && customEnd.isNotEmpty()
                    ) {
                        Text("确定", color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}
