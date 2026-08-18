package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.Investment
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.viewmodel.InvestmentsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import com.xinwallet.app.util.formatMoneySigned

@Composable
fun InvestmentDetailScreen(navController: NavHostController, id: Int) {
    val vm: InvestmentsViewModel = viewModel(factory = viewModelFactory { InvestmentsViewModel(AppContainer.investmentRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val inv = state.investments.find { it.id == id }

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        topBar = { TopBar(inv?.name ?: "理财详情", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorState(state.error!!) { vm.load() }
            inv == null -> EmptyState("未找到该理财记录")
            else -> InvestmentDetailContent(inv, Modifier.fillMaxSize().padding(padding))
        }
    }
}

@Composable
private fun InvestmentDetailContent(inv: Investment, modifier: Modifier = Modifier) {
    val dark = LocalIsDark.current
    val gain = inv.profit >= 0
    val profitColor = if (gain) (if (dark) IncomeColorDark else IncomeColor) else (if (dark) ExpenseColorDark else ExpenseColor)
    LazyColumn(modifier.padding(horizontal = 16.dp)) {
        item {
            Spacer(Modifier.height(12.dp))
            BalanceCard(
                "当前市值", inv.currentValue,
                "总成本 ${formatMoney(inv.totalCost)}",
                Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                ProfitStatCard("收益", formatMoneySigned(inv.profit), profitColor, Modifier.weight(1f))
                ProfitStatCard("收益率", "${String.format("%.2f", inv.profitRate)}%", profitColor, Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
        }
        item { SectionTitle("持仓信息") }
        item {
            InfoRow("名称", inv.name)
            InfoRow("代码", if (inv.code.isBlank()) "—" else inv.code)
            InfoRow("类型", "${inv.typeIcon ?: "📈"} ${inv.typeName ?: "理财"}")
            InfoRow("关联账户", inv.accName ?: "—")
            InfoRow("买入价", formatMoney(inv.buyPrice))
            InfoRow("现价", formatMoney(inv.currentPrice))
            InfoRow("持有数量", if (inv.quantity > 0) inv.quantity.toString() else "—")
            InfoRow("买入日期", if (inv.buyDate.isBlank()) "—" else inv.buyDate.take(10))
            if (!inv.note.isNullOrBlank()) InfoRow("备注", inv.note!!)
            Spacer(Modifier.height(16.dp))
        }
        item {
            // 交易记录入口：跳转独立页展示买入/卖出/分红等流水
            Surface(
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceVariant,
                modifier = Modifier.fillMaxWidth().clickable { navController.navigate(Screen.InvestmentTransactions.create(inv.id)) }
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("📋 交易记录", style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowForward,
                        contentDescription = "查看交易记录",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ProfitStatCard(label: String, value: String, color: androidx.compose.ui.graphics.Color, modifier: Modifier = Modifier) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = modifier
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(88.dp))
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f))
}
