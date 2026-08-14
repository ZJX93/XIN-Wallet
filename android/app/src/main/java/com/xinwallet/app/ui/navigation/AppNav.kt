package com.xinwallet.app.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavDestination
import androidx.navigation.NavGraph
import com.xinwallet.app.ui.screens.AccountDetailScreen
import com.xinwallet.app.ui.screens.AccountsScreen
import com.xinwallet.app.ui.screens.AddTransactionScreen
import com.xinwallet.app.ui.screens.AiScanScreen
import com.xinwallet.app.ui.screens.CategoryScreen
import com.xinwallet.app.ui.screens.ChatScreen
import com.xinwallet.app.ui.screens.HomeScreen
import com.xinwallet.app.ui.screens.InvestmentDetailScreen
import com.xinwallet.app.ui.screens.InvestmentsScreen
import com.xinwallet.app.ui.screens.LoginScreen
import com.xinwallet.app.ui.screens.PlanningScreen
import com.xinwallet.app.ui.screens.ProfileScreen
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
    object Categories : Screen("categories")
    object Chat : Screen("chat")
}

/**
 * 底部 5 tab：首页 / 账单 / 记账(+) / 统计 / 我的
 * 「规划」与「对话」已下沉到「我的」12 宫格快捷入口；记账用第 3 个 tab（Add 图标）承载。
 */
private val bottomItems = listOf(
    Screen.Home to ("首页" to Icons.Filled.Home),
    Screen.Transactions to ("账单" to Icons.Filled.ReceiptLong),
    Screen.AddTransaction to ("记账" to Icons.Filled.Add),
    Screen.Reports to ("统计" to Icons.Filled.PieChart),
    Screen.Profile to ("我的" to Icons.Filled.Person)
)

/** 当前路由命中到哪个底部 tab（子路由归并到所属 tab） */
fun routeKey(route: String?): String? = when {
    route == null -> null
    route.startsWith("account") -> Screen.Profile.route
    route.startsWith("reports") -> Screen.Reports.route
    route.startsWith("edit") -> Screen.Transactions.route
    route.startsWith("ai") -> Screen.Transactions.route
    route.startsWith("add") -> Screen.AddTransaction.route  // 记账独立 tab
    route.startsWith("chat") -> Screen.Profile.route       // 对话下沉到「我的」
    route.startsWith("transactions") -> Screen.Transactions.route
    route.startsWith("investment") -> Screen.Reports.route  // 理财明细归到「统计」
    route.startsWith("planning") -> Screen.Profile.route    // 规划下沉到「我的」
    else -> route.substringBefore("/")
}

/**
 * 定位 NavGraph 的起始目的地（处理嵌套 NavGraph）。
 * navigation-compose 未提供此扩展，底部导航 popUpTo 时依赖它回到首页。
 */
private fun NavGraph.findStartDestination(): NavDestination {
    var current: NavDestination = this
    while (current is NavGraph) {
        val graph = current
        val next = graph.findNode(graph.startDestinationId)
        if (next == null) break
        current = next
    }
    return current
}

@Composable
fun MainScaffold(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val current = routeKey(navBackStackEntry?.destination?.route)

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 0.dp
                ) {
                    bottomItems.forEach { (screen, pair) ->
                        val (label, icon) = pair
                        val isCenter = screen == Screen.AddTransaction
                        NavigationBarItem(
                            selected = current == screen.route,
                            onClick = {
                                navController.navigate(screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = {
                                if (isCenter) {
                                    // 记账：突出的圆形 tab（仅顶部约 1/6 露出导航栏上沿）
                                    Box(
                                        modifier = Modifier
                                            .offset(y = (-8).dp)
                                            .size(48.dp)
                                            .clip(CircleShape)
                                            .background(MaterialTheme.colorScheme.primary),
                                        contentAlignment = Alignment.Center
                                    ) { Icon(icon, label, tint = Color.White) }
                                } else {
                                    Icon(icon, label)
                                }
                            },
                            label = { Text(label) }
                        )
                    }
                }
            }
        ) { padding ->
            AppNavHost(navController, padding, onLogout)
        }

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
        composable(Screen.Categories.route) { CategoryScreen(navController) }
    }
}