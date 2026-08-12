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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.TransactionRow
import com.xinwallet.app.ui.components.accountTypeLabel
import com.xinwallet.app.ui.viewmodel.TransactionsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney

@Composable
fun AccountDetailScreen(navController: NavHostController, accountId: Int) {
    val vm: TransactionsViewModel = viewModel(factory = viewModelFactory { TransactionsViewModel(AppContainer.transactionRepository, AppContainer.accountRepository) })
    val state by vm.state.collectAsState()
    var account by remember { mutableStateOf<Account?>(null) }
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        vm.load(accountId = accountId)
        val r = AppContainer.accountRepository.getAccounts()
        if (r is ApiResult.Success) account = r.data?.accounts?.find { it.id == accountId }
    }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    Scaffold(
        topBar = { TopBar(account?.name ?: "账户", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) }
    ) { padding ->
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorState(state.error!!) { vm.load(accountId = accountId) }
            else -> {
                LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
                    item {
                        Spacer(Modifier.height(12.dp))
                        account?.let { acc ->
                            val sub = accountTypeLabel(acc.type) + if (acc.creditLimit > 0) " · 额度 ${formatMoney(acc.creditLimit)}" else ""
                            BalanceCard("当前余额", acc.balance, sub)
                            Spacer(Modifier.height(12.dp))
                        }
                        SectionTitle("交易记录")
                    }
                    if (state.items.isEmpty()) item { EmptyState("该账户暂无交易") }
                    else items(state.items) { TransactionRow(it) }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}
