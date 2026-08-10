package com.xinwallet.app.ui.screens

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
import androidx.compose.foundation.background
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.CategoryPie
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.TrendLineChart
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.viewmodel.ReportsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import java.text.DecimalFormat
import java.util.Calendar
import java.util.Locale
import kotlin.math.abs

private val TYPE_OPTIONS = listOf("monthly" to "月", "quarterly" to "季", "annual" to "年")

private fun defaultPeriod(type: String): String {
    val c = Calendar.getInstance()
    return when (type) {
        "quarterly" -> { val q = c.get(Calendar.MONTH) / 3 + 1; "${c.get(Calendar.YEAR)}-Q$q" }
        "annual" -> "${c.get(Calendar.YEAR)}"
        else -> String.format(Locale.CHINA, "%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
    }
}

private fun shiftPeriod(type: String, period: String, delta: Int): String {
    return when (type) {
        "annual" -> {
            val y = period.toIntOrNull() ?: Calendar.getInstance().get(Calendar.YEAR)
            "${y + delta}"
        }
        "quarterly" -> {
            val m = Regex("(\\d{4})-Q(\\d)").find(period)
            var y = m?.groupValues?.get(1)?.toInt() ?: Calendar.getInstance().get(Calendar.YEAR)
            var q = m?.groupValues?.get(2)?.toInt() ?: 1
            q += delta
            while (q < 1) { q += 4; y -= 1 }
            while (q > 4) { q -= 4; y += 1 }
            "$y-Q$q"
        }
        else -> {
            val m = Regex("(\\d{4})-(\\d{2})").find(period)
            val y = m?.groupValues?.get(1)?.toInt() ?: Calendar.getInstance().get(Calendar.YEAR)
            val mo = m?.groupValues?.get(2)?.toInt() ?: 1
            val c = Calendar.getInstance().apply { set(y, mo - 1, 1); add(Calendar.MONTH, delta) }
            String.format(Locale.CHINA, "%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportsScreen() {
    val vm: ReportsViewModel = viewModel(factory = viewModelFactory { ReportsViewModel(AppContainer.reportRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    var type by remember { mutableStateOf("monthly") }
    var period by remember { mutableStateOf(defaultPeriod("monthly")) }

    LaunchedEffect(type, period) { vm.load(type, period) }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.consumeError() } }

    Scaffold(
        topBar = { TopBar(state.report?.label ?: "报表分析") },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading && state.report == null -> LoadingBox()
            state.error != null && state.report == null -> ErrorState(state.error!!, onRetry = { vm.load(type, period) })
            state.report != null -> ReportContent(state.report!!, type, period,
                onTypeChange = {
                    type = it
                    period = defaultPeriod(it)
                },
                onShift = { period = shiftPeriod(type, period, it) },
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
    type: String,
    period: String,
    onTypeChange: (String) -> Unit,
    onShift: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    var expenseParent by remember { mutableStateOf<Int?>(null) }
    var incomeParent by remember { mutableStateOf<Int?>(null) }

    val topExpenseItems = remember(report.expenseByCategory, expenseParent) {
        if (expenseParent == null) report.expenseByCategory.filter { it.parentId == null }
        else report.expenseByCategory.filter { it.parentId == expenseParent }
    }
    val topIncomeItems = remember(report.incomeByCategory, incomeParent) {
        if (incomeParent == null) report.incomeByCategory.filter { it.parentId == null }
        else report.incomeByCategory.filter { it.parentId == incomeParent }
    }

    fun hasChildren(parentId: Int, items: List<com.xinwallet.app.data.model.ReportCategorySlice>) =
        items.any { it.parentId == parentId }

    LazyColumn(modifier.padding(horizontal = 16.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
        item {
            // 周期类型切换 + 上/下周期
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(onClick = { onShift(-1) }) { Icon(Icons.Filled.ChevronLeft, "上一周期") }
                SingleChoiceSegmentedButtonRow {
                    TYPE_OPTIONS.forEachIndexed { index, (value, label) ->
                        SegmentedButton(selected = type == value, onClick = { onTypeChange(value) }, shape = SegmentedButtonDefaults.itemShape(index, TYPE_OPTIONS.size)) {
                            Text(label)
                        }
                    }
                }
                IconButton(onClick = { onShift(1) }) { Icon(Icons.Filled.ChevronRight, "下一周期") }
            }
            Spacer(Modifier.height(12.dp))
        }

        item { SummaryCards(report) }
        item { Spacer(Modifier.height(8.dp)) }

        if (report.compare != null) {
            item { CompareRow(report) }
            item { Spacer(Modifier.height(8.dp)) }
        }

        item { CategorySectionTitle(
            title = if (expenseParent == null) "支出分类占比" else "支出 · ${report.expenseByCategory.find { it.id == expenseParent }?.name ?: ""}",
            showBack = expenseParent != null,
            onBack = { expenseParent = null }
        ) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(12.dp)) {
                    CategoryPie(
                        items = topExpenseItems,
                        onSliceClick = { slice ->
                            if (expenseParent == null && hasChildren(slice.id, report.expenseByCategory)) {
                                expenseParent = slice.id
                            }
                        }
                    )
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }

        item { CategorySectionTitle(
            title = if (incomeParent == null) "收入分类占比" else "收入 · ${report.incomeByCategory.find { it.id == incomeParent }?.name ?: ""}",
            showBack = incomeParent != null,
            onBack = { incomeParent = null }
        ) }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(12.dp)) {
                    CategoryPie(
                        items = topIncomeItems,
                        onSliceClick = { slice ->
                            if (incomeParent == null && hasChildren(slice.id, report.incomeByCategory)) {
                                incomeParent = slice.id
                            }
                        }
                    )
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }

        item { SectionTitle("趋势（收入/支出）") }
        item {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(12.dp)) {
                    TrendLineChart(report.dailyTrend.map { it.income }, report.dailyTrend.map { it.expense })
                    Spacer(Modifier.height(6.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        LegendDot(IncomeColor, "收入")
                        Spacer(Modifier.width(16.dp))
                        LegendDot(ExpenseColor, "支出")
                    }
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }

        if (report.topExpenses.isNotEmpty()) {
            item { SectionTitle("大额支出 Top5") }
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                    Column(Modifier.padding(8.dp)) {
                        report.topExpenses.forEach {
                            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(it.categoryIcon ?: "📌", fontSize = 18.sp, modifier = Modifier.width(28.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(it.categoryName ?: "支出", style = MaterialTheme.typography.bodyMedium)
                                    Text(it.date.take(10) + (it.note?.takeIf { n -> n.isNotBlank() }?.let { n -> " · $n" } ?: ""), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(formatMoney(it.amount), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCards(report: com.xinwallet.app.data.model.FinanceReport) {
    val s = report.summary
    Column(Modifier.fillMaxWidth()) {
        // 第一行：收入 / 支出
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryCard("收入", formatMoney(s.income), true, Modifier.weight(1f))
            SummaryCard("支出", formatMoney(s.expense), false, Modifier.weight(1f))
        }
        Spacer(Modifier.height(10.dp))
        // 第二行：结余 / 储蓄率
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SummaryCard("结余", formatMoney(s.balance), s.balance >= 0, Modifier.weight(1f))
            SummaryCard("储蓄率", "${DecimalFormat("0.0").format(s.savingsRate)}%", s.savingsRate >= 0, Modifier.weight(1f))
        }
    }
}

@Composable
private fun SummaryCard(title: String, value: String, good: Boolean, modifier: Modifier = Modifier) {
    val dark = LocalIsDark.current
    val color = if (good) (if (dark) IncomeColorDark else IncomeColor) else (if (dark) ExpenseColorDark else ExpenseColor)
    Card(modifier, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun CompareRow(report: com.xinwallet.app.data.model.FinanceReport) {
    val c = report.compare ?: return
    val df = DecimalFormat("0.0")
    fun pct(cur: Double, prev: Double): String {
        if (prev == 0.0) return "—"
        val v = (cur - prev) / abs(prev) * 100
        return (if (v >= 0) "+" else "") + df.format(v) + "%"
    }
    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text("环比 ${c.label}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                CompareItem("收入", pct(c.income, report.summary.income))
                CompareItem("支出", pct(c.expense, report.summary.expense))
                CompareItem("结余", pct(c.balance, report.summary.balance))
            }
        }
    }
}

@Composable
private fun CompareItem(label: String, pctText: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(pctText, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LegendDot(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).clip(RoundedCornerShape(3.dp)).background(color))
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CategorySectionTitle(title: String, showBack: Boolean, onBack: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (showBack) {
            IconButton(onClick = onBack, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Filled.ChevronLeft, contentDescription = "返回")
            }
            Spacer(Modifier.width(4.dp))
        }
        Text(title, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
    }
}
