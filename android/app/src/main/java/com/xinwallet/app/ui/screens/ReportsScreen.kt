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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.xinwallet.app.data.model.ReportCategorySlice
import com.xinwallet.app.data.model.TopTransaction
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BookHeader
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
fun ReportsScreen() {
    val vm: ReportsViewModel = viewModel(factory = viewModelFactory { ReportsViewModel(AppContainer.reportRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.consumeError() } }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading && state.report == null -> LoadingBox()
            state.error != null && state.report == null -> ErrorState(state.error!!, onRetry = { vm.setPeriod(state.period) })
            state.report != null -> ReportContent(
                report = state.report!!,
                dataType = state.dataType,
                period = state.period,
                topTransactions = state.topTransactions,
                onDataTypeChange = vm::setDataType,
                onShiftMonth = { vm.setPeriod(shiftMonth(state.period, it)) },
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
    topTransactions: List<TopTransaction>,
    onDataTypeChange: (String) -> Unit,
    onShiftMonth: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    var granularity by remember { mutableStateOf("minor") } // 截图：默认"小类"激活

    // KPI 计算
    val kpis = remember(report, dataType) { buildKpis(dataType, report) }

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
        if (granularity == "major") rawCats.filter { it.parentId == null } else rawCats
    }

    LazyColumn(modifier, contentPadding = PaddingValues(bottom = 24.dp)) {

        // 顶部：账本标题
        item { BookHeader() }

        // 类型 tab + 月份选择器（同一行；与下方 KPI 两列网格对齐：
        // 左列=段选择器(宽度=支出金额卡)，右列=月份选择器(右对齐，右边缘=日均支出卡)，中间间隙=卡片间隙）
        item {
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
                // 右列：月份选择器（右对齐，右边缘对齐"日均支出"卡）
                Row(
                    Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.End
                ) {
                    Box(
                        Modifier.size(32.dp).clickable { onShiftMonth(-1) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Filled.ChevronLeft, "上个月",
                            modifier = Modifier.size(20.dp),
                            tint = Brown500
                        )
                    }
                    Text(
                        monthLabel(period),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                    Box(
                        Modifier.size(32.dp).clickable { onShiftMonth(1) },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Filled.ChevronRight, "下个月",
                            modifier = Modifier.size(20.dp),
                            tint = Brown500
                        )
                    }
                }
            }
        }

        // KPI 卡片（按维度不同）
        item { KpiGrid(kpis) }
        item { Spacer(Modifier.height(12.dp)) }

        // 趋势
        item { TrendCard(dataType, report, series, peakIndex) }
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

/**
 * 顶部账本标题：复用共享 BookHeader（默认账本 + 切换 / 搜索图标）。
 */

/* ────────── KPI 网格 ────────── */

private data class KpiSpec(val title: String, val value: String, val accent: Color, val icon: String)

private fun buildKpis(dataType: String, report: com.xinwallet.app.data.model.FinanceReport): List<KpiSpec> {
    val s = report.summary
    val dark = false // ReportsScreen 通过 LocalIsDark 读取时再分辨颜色
    val main = Color(0xFF995F2C) // 暖棕主色，跟暖棕品牌一致
    return when (dataType) {
        "income" -> listOf(
            KpiSpec("收入金额", "¥ ${formatMoney(s.income)}", Color(0xFFC11435), "💵"),
            KpiSpec("日均收入", "¥ ${formatMoney(s.income / 30.coerceAtLeast(1))}", Color(0xFFC11435), "📅")
        )
        "balance" -> listOf(
            KpiSpec("结余金额", "¥ ${formatMoney(s.balance)}", main, "🎯"),
            KpiSpec("日均结余", "¥ ${formatMoney(s.balance / 30.coerceAtLeast(1))}", main, "📅")
        )
        else -> {
            // 支出：4 张 = 支出金额 / 日均支出 / 本月预算 / 剩余预算
            val totalBudget = report.budgetExecution.sumOf { it.budget }
            val totalActual = report.budgetExecution.sumOf { it.actual }
            val remaining = totalBudget - totalActual
            val green = Color(0xFF009558)
            listOf(
                KpiSpec("支出金额", "¥ ${formatMoney(s.expense)}", green, "💸"),
                KpiSpec("日均支出", "¥ ${formatMoney(s.avgDailyExpense)}", green, "📅"),
                KpiSpec("本月预算", "¥ ${formatMoney(totalBudget)}", main, "💰"),
                KpiSpec("剩余预算", "¥ ${formatMoney(remaining)}", main, "⏳")
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
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
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
    peakIndex: Int?
) {
    val (title, color, peakLabel, cumLabel) = when (dataType) {
        "income" -> Quadruple(
            "收入趋势",
            Color(0xFFC11435),
            peakIndex?.let { "${isoDay(report.dailyTrend[it].date)}    结余: ¥ ${formatMoney(series[it])}" }
                ?: "本月暂无收入",
            "累计收入: ¥ ${formatMoney(series.sum())}"
        )
        "balance" -> Quadruple(
            "结余趋势",
            Color(0xFF995F2C),
            peakIndex?.let { "${isoDay(report.dailyTrend[it].date)}    结余: ¥ ${formatMoney(series[it])}" }
                ?: "本月暂无结余",
            "期末结余: ¥ ${formatMoney(series.lastOrNull() ?: 0.0)}"
        )
        else -> Quadruple(
            "支出趋势",
            Color(0xFF009558),
            peakIndex?.let { "${isoDay(report.dailyTrend[it].date)}    支出: ¥ ${formatMoney(series[it])}" }
                ?: "本月暂无支出",
            "累计支出: ¥ ${formatMoney(series.sum())}"
        )
    }
    Column(Modifier.padding(horizontal = 16.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Card(
            Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(Modifier.padding(14.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(peakLabel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(cumLabel, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = color)
                }
                Spacer(Modifier.height(8.dp))
                if (series.isEmpty() || (series.maxOrNull() ?: 0.0) <= 0) {
                    EmptyState("该周期暂无数据")
                } else {
                    com.xinwallet.app.ui.components.TrendLineChartSingle(series, color, peakIndex = peakIndex)
                    Spacer(Modifier.height(2.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf("01", "05", "10", "15", "20", "25", "30").forEach {
                            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
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
    Column(Modifier.padding(horizontal = 16.dp)) {
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
        Card(
            Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(Modifier.padding(14.dp)) {
                if (categories.isEmpty()) {
                    EmptyState("该周期暂无分类数据")
                } else {
                    val top = categories.maxByOrNull { it.total }
                    // 顶部 label: "餐饮 100%" + 引导线
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${top?.name ?: ""} 100%",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.Medium
                        )
                        Spacer(Modifier.width(6.dp))
                        Box(Modifier.height(1.dp).width(36.dp).background(MaterialTheme.colorScheme.outlineVariant))
                    }
                    Spacer(Modifier.height(6.dp))
                    DonutChart(
                        data = categories.map { it.name to it.total },
                        centerTitle = top?.name,
                        centerAmount = top?.let { "¥ ${formatMoney(it.total)}" }
                    )
                    Spacer(Modifier.height(8.dp))
                    CategoryBars(categories)
                }
            }
        }
    }
}

/* ────────── 明细排行 ────────── */

@Composable
private fun DetailRankingCard(items: List<TopTransaction>, isIncome: Boolean) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Text("明细排行", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Card(
            Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(Modifier.padding(vertical = 4.dp)) {
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
                                (if (isIncome) "¥ " else "-¥ ") + formatMoney(tx.amount),
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
}

/* ────────── 结余：每日概况大表格 ────────── */

@Composable
private fun DailyOverviewTable(report: com.xinwallet.app.data.model.FinanceReport) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Text("每日概况", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Card(
            Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column {
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
