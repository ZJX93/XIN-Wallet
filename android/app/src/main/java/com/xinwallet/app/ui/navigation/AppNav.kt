package com.xinwallet.app.ui.navigation

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.xinwallet.app.ui.screens.AccountDetailScreen
import com.xinwallet.app.ui.screens.AccountsScreen
import com.xinwallet.app.ui.screens.AddTransactionScreen
import com.xinwallet.app.ui.screens.AiScanScreen
import com.xinwallet.app.ui.screens.ChatScreen
import com.xinwallet.app.ui.screens.HomeScreen
import com.xinwallet.app.ui.screens.InvestmentDetailScreen
import com.xinwallet.app.ui.screens.InvestmentsScreen
import com.xinwallet.app.ui.screens.LoginScreen
import com.xinwallet.app.ui.screens.ProfileScreen
import com.xinwallet.app.ui.screens.PlanningScreen
import com.xinwallet.app.ui.screens.ReportsScreen
import com.xinwallet.app.ui.screens.TagsScreen
import com.xinwallet.app.ui.screens.TransactionsScreen

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object Accounts : Screen("accounts")
    object AccountDetail : Screen("account/{id}") {
        fun create(id: Int) = "account/$id"
    }
    object Transactions : Screen("transactions")
    object AddTransaction : Screen("add")
    object EditTransaction : Screen("edit/{id}?month={month}") {
        fun create(id: Int, month: String? = null) =
            if (month != null) "edit/$id?month=$month" else "edit/$id"
    }
    object AiScan : Screen("ai-scan")
    object Investments : Screen("investments")
    object InvestmentDetail : Screen("investment/{id}") {
        fun create(id: Int) = "investment/$id"
    }
    object Profile : Screen("profile")
    object Planning : Screen("planning")
    object Reports : Screen("reports")
    object Tags : Screen("tags")
    object Chat : Screen("chat")
}

private val bottomItems = listOf(
    Screen.Home to ("首页" to Icons.Filled.Home),
    Screen.Accounts to ("账户" to Icons.Filled.AccountBalanceWallet),
    Screen.Transactions to ("账单" to Icons.Filled.ReceiptLong),
    Screen.Planning to ("规划" to Icons.Filled.Savings),
    Screen.Reports to ("报表" to Icons.Filled.BarChart),
    Screen.Chat to ("对话" to Icons.Filled.Chat),
    Screen.Profile to ("我的" to Icons.Filled.Person)
)

fun routeKey(route: String?): String? = when {
    route == null -> null
    route.startsWith("account") -> Screen.Accounts.route
    route.startsWith("edit") -> Screen.Transactions.route
    route.startsWith("ai") -> Screen.Transactions.route
    route.startsWith("chat") -> Screen.Chat.route
    route.startsWith("transactions") -> Screen.Transactions.route
    route.startsWith("investment") -> Screen.Investments.route
    else -> route.substringBefore("/")
}

@Composable
fun MainScaffold(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val current = routeKey(navBackStackEntry?.destination?.route)

    Scaffold(
        bottomBar = {
            NavigationBar {
                bottomItems.forEach { (screen, pair) ->
                    val (label, icon) = pair
                    NavigationBarItem(
                        selected = current == screen.route,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(icon, label) },
                        label = { Text(label) }
                    )
                }
            }
        },
        floatingActionButton = {
            when (current) {
                Screen.Home.route -> FloatingActionButton(onClick = { navController.navigate(Screen.AddTransaction.route) }) {
                    Icon(Icons.Filled.Add, "记一笔")
                }
            }
        }
    ) { padding ->
        AppNavHost(navController, padding, onLogout)
    }
}

@Composable
fun AppNavHost(navController: NavHostController, padding: PaddingValues, onLogout: () -> Unit) {
    NavHost(
        navController = navController,
        startDestination = Screen.Home.route,
        modifier = Modifier.padding(padding)
    ) {
        composable(Screen.Home.route) { HomeScreen(navController) }
        composable(Screen.Accounts.route) { AccountsScreen(navController) }
        composable(
            Screen.AccountDetail.route,
            arguments = listOf(navArgument("id") { type = androidx.navigation.NavType.IntType })
        ) {
            AccountDetailScreen(navController, it.arguments?.getInt("id") ?: 0)
        }
        composable(Screen.Transactions.route) { TransactionsScreen(navController) }
        composable(Screen.AddTransaction.route) { AddTransactionScreen(navController) }
        composable(
            Screen.EditTransaction.route,
            arguments = listOf(
                navArgument("id") { type = androidx.navigation.NavType.IntType },
                navArgument("month") { type = androidx.navigation.NavType.StringType; nullable = true; defaultValue = null }
            )
        ) {
            val id = it.arguments?.getInt("id") ?: 0
            val month = it.arguments?.getString("month")
            AddTransactionScreen(navController, editId = id, month = month)
        }
        composable(Screen.AiScan.route) { AiScanScreen(navController) }
        composable(Screen.Investments.route) { InvestmentsScreen(navController) }
        composable(
            Screen.InvestmentDetail.route,
            arguments = listOf(navArgument("id") { type = androidx.navigation.NavType.IntType })
        ) {
            InvestmentDetailScreen(navController, it.arguments?.getInt("id") ?: 0)
        }
        composable(Screen.Profile.route) { ProfileScreen(navController, onLogout) }
        composable(Screen.Planning.route) { PlanningScreen(navController) }
        composable(Screen.Reports.route) { ReportsScreen() }
        composable(Screen.Chat.route) { ChatScreen(navController) }
        composable(Screen.Tags.route) { TagsScreen(navController) }
    }
}
