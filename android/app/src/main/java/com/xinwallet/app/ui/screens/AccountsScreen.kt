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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.AccountListItem
import com.xinwallet.app.ui.components.BalanceCard
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.ErrorState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.SectionTitle
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.components.accountTypeLabel
import com.xinwallet.app.ui.navigation.Screen
import com.xinwallet.app.ui.viewmodel.AccountsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney

val ACCOUNT_TYPE_ORDER = listOf("cash", "bank_card", "credit_card", "electronic_payment", "financial_account", "digital", "other")

@Composable
fun AccountsScreen(navController: NavHostController) {
    val vm: AccountsViewModel = viewModel(factory = viewModelFactory { AccountsViewModel(AppContainer.accountRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    Scaffold(topBar = { TopBar("账户") }, snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        when {
            state.loading -> LoadingBox()
            state.error != null -> ErrorState(state.error!!) { vm.load() }
            else -> {
                val grouped = ACCOUNT_TYPE_ORDER.mapNotNull { t ->
                    val list = state.accounts.filter { it.type == t }
                    if (list.isEmpty()) null else t to list
                }
                LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                    item {
                        Spacer(Modifier.height(12.dp))
                        BalanceCard("总资产", state.totalAssets, "所有活跃账户余额合计", Modifier.padding(horizontal = 16.dp))
                    }
                    grouped.forEach { (type, list) ->
                        item { SectionTitle("${accountTypeLabel(type)}（${list.size}）") }
                        items(list) { acc ->
                            AccountListItem(acc) { navController.navigate(Screen.AccountDetail.create(acc.id)) }
                        }
                    }
                    item { Spacer(Modifier.height(16.dp)) }
                }
            }
        }
    }
}
