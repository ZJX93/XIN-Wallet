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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LinearProgress
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.RecentTransactionRow
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.TrendLineChart
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

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        topBar = { TopBar("鑫钱包") },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorState(state.error!!) { vm.load() }
            state.data != null -> {
                val d = state.data!!
                val totalAssets = d.accounts.sumOf { it.balance } + (d.invSummary?.totalValue ?: 0.0)
                LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
                    item {
                        Spacer(Modifier.height(12.dp))
                        BalanceCard("总资产", totalAssets, "账户余额 + 理财市值")
                    }
                    item {
                        Spacer(Modifier.height(12.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            StatMiniCard("本月收入", d.month?.income ?: 0.0, true, Modifier.weight(1f))
                            StatMiniCard("本月支出", d.month?.expense ?: 0.0, false, Modifier.weight(1f))
                        }
                    }
                    item {
                        Spacer(Modifier.height(16.dp))
                        SectionTitle("近 6 月趋势")
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
                    item { Spacer(Modifier.height(16.dp)); SectionTitle("最近交易") }
                    if (d.recentTrans.isEmpty()) {
                        item { EmptyState("暂无交易") }
                    } else {
                        items(d.recentTrans) { tx -> RecentTransactionRow(tx) }
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
fun StatMiniCard(label: String, value: Double, isIncome: Boolean, modifier: Modifier = Modifier) {
    Card(modifier, shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(4.dp))
            Text(formatMoney(value), style = MaterialTheme.typography.titleMedium, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = if (isIncome) IncomeColor else ExpenseColor)
        }
    }
}
