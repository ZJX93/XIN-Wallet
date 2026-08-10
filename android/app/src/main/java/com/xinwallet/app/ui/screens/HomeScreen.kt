package com.xinwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LinearProgress
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.TrendLineChart
import com.xinwallet.app.ui.components.TransactionRow
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.viewmodel.DashboardViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney

@Composable
fun HomeScreen(navController: NavHostController) {
    val vm: DashboardViewModel = viewModel(factory = viewModelFactory { DashboardViewModel(AppContainer.dashboardRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        topBar = { TopBar("鑫钱包") },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorState(
                state.error!!,
                onRetry = { vm.load() },
                onLogin = {
                    scope.launch {
                        AppContainer.authRepository.logout()
                        AppContainer.authExpired.emit(Unit)
                    }
                }
            )
            state.data != null -> {
                val d = state.data!!
                val totalAssets = if (d.totalAssets > 0) d.totalAssets
                else (d.accounts.sumOf { it.balance } + (d.inv?.totalValue ?: 0.0))
                val totalDebt = d.debt?.totalRemaining ?: 0.0
                val netWorth = if (d.netWorth != 0.0) d.netWorth else (totalAssets - totalDebt)
                val monthInc = d.month?.income ?: 0.0
                val monthExp = d.month?.expense ?: 0.0
                val monthBal = monthInc - monthExp
                val yearInc = d.year?.income ?: 0.0
                val yearExp = d.year?.expense ?: 0.0
                val yearBal = yearInc - yearExp
                val weekInc = d.week?.income ?: 0.0
                val weekExp = d.week?.expense ?: 0.0
                val weekBal = weekInc - weekExp
                val invValue = d.inv?.totalValue ?: 0.0
                val invProfit = d.inv?.totalProfit ?: 0.0
                val savingsRate = if (totalAssets > 0) (d.totalSavings / totalAssets * 100.0) else 0.0
                val todayExp = d.today?.expense ?: 0.0
                val monthly = d.debt?.totalMonthly ?: 0.0
                val holdings = d.inv?.holdings ?: emptyList()

                LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
                    item {
                        Spacer(Modifier.height(12.dp))
                        BalanceCard("总资产", totalAssets, "账户余额 + 理财市值")
                    }
                    item { Spacer(Modifier.height(12.dp)); TwoTiles(
                        { KpiTile("本月结余", formatMoney(monthBal), "收 ${formatMoney(monthInc)} 支 ${formatMoney(monthExp)}", if (monthBal >= 0) IncomeColor else ExpenseColor) },
                        { KpiTile("本年结余", formatMoney(yearBal), "收 ${formatMoney(yearInc)} 支 ${formatMoney(yearExp)}", if (yearBal >= 0) IncomeColor else ExpenseColor) }
                    ) }
                    item { Spacer(Modifier.height(12.dp)); TwoTiles(
                        { KpiTile("本周结余", formatMoney(weekBal), "收 ${formatMoney(weekInc)} 支 ${formatMoney(weekExp)}", if (weekBal >= 0) IncomeColor else ExpenseColor) },
                        { KpiTile("净资产", formatMoney(netWorth), "资产 ${formatMoney(totalAssets)} / 负债 ${formatMoney(totalDebt)}") }
                    ) }
                    item { Spacer(Modifier.height(12.dp)); TwoTiles(
                        { KpiTile("理财盈亏", formatMoney(invProfit), "市值 ${formatMoney(invValue)}", if (invProfit >= 0) IncomeColor else ExpenseColor) },
                        { KpiTile("总负债", formatMoney(totalDebt), "月供 ${formatMoney(monthly)}", if (totalDebt > 0) ExpenseColor else MaterialTheme.colorScheme.onSurface) }
                    ) }
                    item { Spacer(Modifier.height(12.dp)); TwoTiles(
                        { KpiTile("储蓄率", String.format("%.1f", savingsRate) + "%", "累计净储蓄 ${formatMoney(d.totalSavings)}") },
                        { KpiTile("今日支出", formatMoney(todayExp), null) }
                    ) }

                    item { Spacer(Modifier.height(16.dp)); SectionTitle("收支趋势") }
                    item {
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.padding(12.dp)) {
                                TrendLineChart(d.months.map { it.income }, d.months.map { it.expense })
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.size(10.dp).background(IncomeColor, RoundedCornerShape(2.dp)))
                                        Spacer(Modifier.width(4.dp))
                                        Text("收入", style = MaterialTheme.typography.labelSmall)
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.size(10.dp).background(ExpenseColor, RoundedCornerShape(2.dp)))
                                        Spacer(Modifier.width(4.dp))
                                        Text("支出", style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                            }
                        }
                    }

                    item { Spacer(Modifier.height(16.dp)); SectionTitle("资产负债概览") }
                    item {
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                            Column(Modifier.padding(14.dp)) {
                                val liquid = d.accounts.sumOf { it.balance }
                                val base = liquid + invValue
                                if (base > 0) {
                                    Row(Modifier.fillMaxWidth().height(12.dp)) {
                                        Box(Modifier.weight((liquid / base).toFloat().coerceAtLeast(0.02f)).background(IncomeColor, RoundedCornerShape(topStart = 4.dp, bottomStart = 4.dp)))
                                        Box(Modifier.weight((invValue / base).toFloat().coerceAtLeast(0.02f)).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(topEnd = 4.dp, bottomEnd = 4.dp)))
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("流动资产 ${formatMoney(liquid)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("投资资产 ${formatMoney(invValue)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Spacer(Modifier.height(12.dp))
                                }
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Column { Text("总资产", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(formatMoney(totalAssets), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold) }
                                    Column(horizontalAlignment = Alignment.End) { Text("总负债", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(formatMoney(totalDebt), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = ExpenseColor) }
                                    Column(horizontalAlignment = Alignment.End) { Text("净资产", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(formatMoney(netWorth), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = if (netWorth >= 0) IncomeColor else ExpenseColor) }
                                }
                            }
                        }
                    }

                    if (d.budgetRows.isNotEmpty()) {
                        item { Spacer(Modifier.height(16.dp)); SectionTitle("预算执行") }
                        items(d.budgetRows) { b ->
                            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(12.dp)) {
                                Column(Modifier.padding(12.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(b.name, style = MaterialTheme.typography.bodyLarge)
                                        Text("${formatMoney(b.actual)} / ${formatMoney(b.amount)}", style = MaterialTheme.typography.labelMedium)
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    LinearProgress((b.actual / b.amount).toFloat().coerceIn(0f, 1f), MaterialTheme.colorScheme.primary)
                                }
                            }
                        }
                    }

                    if (d.goalRows.isNotEmpty()) {
                        item { Spacer(Modifier.height(16.dp)); SectionTitle("储蓄目标") }
                        items(d.goalRows) { g ->
                            val ratio = if (g.targetAmount > 0) (g.currentAmount / g.targetAmount * 100).toInt().coerceIn(0, 100) else 0
                            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(12.dp)) {
                                Column(Modifier.padding(12.dp)) {
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("${g.icon ?: "🎯"} ${g.name}", style = MaterialTheme.typography.bodyLarge)
                                        Text("$ratio%", style = MaterialTheme.typography.labelMedium)
                                    }
                                    Spacer(Modifier.height(6.dp))
                                    LinearProgress(ratio / 100f, MaterialTheme.colorScheme.primary)
                                    Spacer(Modifier.height(4.dp))
                                    Text("${formatMoney(g.currentAmount)} / ${formatMoney(g.targetAmount)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }

                    if (holdings.isNotEmpty()) {
                        item { Spacer(Modifier.height(16.dp)); SectionTitle("理财持仓") }
                        items(holdings.take(5)) { h ->
                            val gain = h.profit >= 0
                            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp), shape = RoundedCornerShape(12.dp)) {
                                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(40.dp)) {
                                        Box(contentAlignment = Alignment.Center) { Text(h.typeIcon ?: "📈", style = MaterialTheme.typography.titleMedium) }
                                    }
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(h.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                                        Text(h.typeName ?: "理财", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Column(horizontalAlignment = Alignment.End) {
                                        Text(formatMoney(h.currentValue), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
                                        Text("${if (gain) "+" else ""}${String.format("%.2f", h.profitRate)}%", style = MaterialTheme.typography.labelSmall, color = if (gain) IncomeColor else ExpenseColor)
                                    }
                                }
                            }
                        }
                    }

                    d.debt?.let { dt ->
                        if (dt.totalRemaining > 0 || dt.count > 0) {
                            item { Spacer(Modifier.height(16.dp)); SectionTitle("债务概览") }
                            item {
                                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
                                    Column(Modifier.padding(14.dp)) {
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Column { Text("总负债", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(formatMoney(dt.totalRemaining), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = ExpenseColor) }
                                            Column(horizontalAlignment = Alignment.End) { Text("月供", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(formatMoney(dt.totalMonthly), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold) }
                                        }
                                        Spacer(Modifier.height(8.dp))
                                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text("本月需还 ${formatMoney(dt.dueAmount)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                            if (dt.overdue > 0) Text("逾期 ${dt.overdue} 笔", style = MaterialTheme.typography.labelSmall, color = ExpenseColor)
                                            else Text("活跃 ${dt.activeCount} 笔", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    item { Spacer(Modifier.height(16.dp)); SectionTitle("最近交易") }
                    if (d.recentTrans.isEmpty()) {
                        item { EmptyState("暂无交易") }
                    } else {
                        items(d.recentTrans) { tx -> TransactionRow(tx) }
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TwoTiles(a: @Composable () -> Unit, b: @Composable () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.weight(1f)) { a() }
        Box(Modifier.weight(1f)) { b() }
    }
}

@Composable
private fun KpiTile(label: String, value: String, sub: String? = null, valueColor: Color = MaterialTheme.colorScheme.onSurface) {
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = valueColor)
            if (sub != null) {
                Spacer(Modifier.height(2.dp))
                Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
