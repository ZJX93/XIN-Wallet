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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.viewmodel.InvestmentsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import com.xinwallet.app.util.formatMoneySigned

@Composable
fun InvestmentsContent(navController: NavHostController, contentPadding: PaddingValues = PaddingValues()) {
    val vm: InvestmentsViewModel = viewModel(factory = viewModelFactory { InvestmentsViewModel(AppContainer.investmentRepository) })
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load() }
    // 回到前台（从后台返回）：重新拉取理财数据
    LaunchedEffect(Unit) {
        AppContainer.onForeground.collect { vm.load() }
    }

    when {
        state.loading -> LoadingBox()
        state.error != null -> ErrorState(state.error!!) { vm.load() }
        state.investments.isEmpty() -> EmptyState("暂无理财持仓")
        else -> {
            val sum = state.summary
            val grouped = state.investments.groupBy { it.typeName ?: "其他" }
            LazyColumn(Modifier.fillMaxSize().padding(contentPadding)) {
                item {
                    Spacer(Modifier.height(12.dp))
                    if (sum != null) {
                        val sub = "总成本 ${formatMoney(sum.totalCost)} · 总收益 ${formatMoneySigned(sum.totalProfit)}"
                        BalanceCard("理财总市值", sum.totalValue, sub, Modifier.padding(horizontal = 16.dp))
                    } else {
                        BalanceCard("理财总市值", state.investments.sumOf { it.currentValue }, null, Modifier.padding(horizontal = 16.dp))
                    }
                }
                grouped.forEach { (typeName, list) ->
                    item { SectionTitle("$typeName（${list.size}）") }
                    items(list) { inv ->
                        InvestmentRow(inv) { navController.navigate(Screen.InvestmentDetail.create(inv.id)) }
                    }
                }
                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
}

@Composable
fun InvestmentsScreen(navController: NavHostController) {
    Scaffold(topBar = { TopBar("理财") }) { padding ->
        InvestmentsContent(navController, padding)
    }
}

@Composable
private fun InvestmentRow(inv: Investment, onClick: () -> Unit) {
    val dark = LocalIsDark.current
    val gain = inv.profit >= 0
    val profitColor = if (gain) (if (dark) IncomeColorDark else IncomeColor) else (if (dark) ExpenseColorDark else ExpenseColor)
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(44.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(inv.typeIcon ?: "📈", style = MaterialTheme.typography.titleMedium) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(inv.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(inv.typeName ?: "理财", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (inv.status == "sold") {
                    Spacer(Modifier.width(6.dp))
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                        modifier = Modifier.padding(0.dp)
                    ) {
                        Text(
                            "已清仓",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.outline,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                        )
                    }
                }
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatMoney(inv.currentValue), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            Text(
                "${formatMoneySigned(inv.profit)}  (${String.format("%.2f", inv.profitRate)}%)",
                style = MaterialTheme.typography.labelSmall, color = profitColor
            )
        }
    }
}
