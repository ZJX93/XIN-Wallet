package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.InvestmentTransaction
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.viewmodel.InvestmentsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import com.xinwallet.app.util.formatMoneySigned
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

@Composable
fun InvestmentTransactionsScreen(navController: NavHostController, id: Int) {
    val scope = rememberCoroutineScope()
    val vm: InvestmentsViewModel = viewModel(factory = viewModelFactory { InvestmentsViewModel(AppContainer.investmentRepository) })
    val state by vm.state.collectAsState()
    val inv = state.investments.find { it.id == id }

    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var list by remember { mutableStateOf<List<InvestmentTransaction>>(emptyList()) }

    LaunchedEffect(Unit) { vm.load() }

    LaunchedEffect(Unit) {
        scope.launch {
            when (val res = AppContainer.investmentRepository.getTransactions(id)) {
                is com.xinwallet.app.data.remote.ApiResult.Success -> {
                    list = res.data ?: emptyList()
                    loading = false
                }
                is com.xinwallet.app.data.remote.ApiResult.Error -> {
                    error = res.message
                    loading = false
                }
            }
        }
    }

    Scaffold(topBar = { TopBar("${inv?.name ?: "理财"} · 交易记录", onBack = { navController.popBackStack() }) }) { padding ->
        when {
            loading -> LoadingBox()
            error != null -> ErrorState(error!!) { /* 重新拉取 */ scope.launch { loading = true; error = null; when (val res = AppContainer.investmentRepository.getTransactions(id)) { is com.xinwallet.app.data.remote.ApiResult.Success -> { list = res.data ?: emptyList(); loading = false } is com.xinwallet.app.data.remote.ApiResult.Error -> { error = res.message; loading = false } } } }
            list.isEmpty() -> EmptyState("暂无交易记录")
            else -> {
                LazyColumn(
                    Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)
                ) {
                    item { Spacer(Modifier.height(12.dp)) }
                    items(list) { tx -> TxRow(tx) }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}

@Composable
private fun TxRow(tx: InvestmentTransaction) {
    val dark = LocalIsDark.current
    val isBuy = tx.type == "buy" || tx.type == "reinvest"
    val isSell = tx.type == "sell"
    val gainColor = if (dark) IncomeColorDark else IncomeColor
    val lossColor = if (dark) ExpenseColorDark else ExpenseColor

    val amountColor = when {
        isBuy -> lossColor          // 买入/红利再投：资金流出
        isSell -> gainColor         // 卖出：资金流入
        else -> MaterialTheme.colorScheme.onSurface  // 分红/利息：收入
    }

    Surface(
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)
    ) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                // 类型标签
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = amountColor.copy(alpha = 0.14f),
                    modifier = Modifier.padding(bottom = 6.dp)
                ) {
                    Text(
                        tx.typeLabel,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = amountColor,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
                Text(
                    tx.date.take(10).ifBlank { tx.date },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (!tx.note.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        tx.note!!,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    "单价 ${formatMoney(tx.price)} · 数量 ${tx.quantity}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    formatMoneySigned(tx.amount),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = amountColor
                )
            }
        }
    }
}
