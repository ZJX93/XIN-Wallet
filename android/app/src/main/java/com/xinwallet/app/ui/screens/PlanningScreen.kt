package com.xinwallet.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.RequestQuote
import androidx.compose.material3.Icon
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController

@Composable
fun PlanningScreen(navController: NavHostController) {
    var tab by remember { mutableStateOf(0) }
    val tabs = listOf(
        "预算" to Icons.Filled.AccountBalance,
        "储蓄目标" to Icons.Filled.Savings,
        "债务" to Icons.Filled.RequestQuote
    )
    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = tab) {
            tabs.forEachIndexed { index, (label, icon) ->
                Tab(
                    selected = tab == index,
                    onClick = { tab = index },
                    text = { Text(label) },
                    icon = { Icon(icon, label) }
                )
            }
        }
        when (tab) {
            0 -> BudgetsTab()
            1 -> SavingsTab()
            2 -> DebtsTab()
        }
    }
}
