package com.xinwallet.app.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PieChart
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.FabPosition
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
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
import com.xinwallet.app.ui.theme.FabBackground

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
 * 底部 4 tab：首页 / 账单 / 统计 / 我的
 * 「规划」与「对话」已下沉到「我的」12 宫格快捷入口。
 */
private val bottomItems = listOf(
    Screen.Home to ("首页" to Icons.Filled.Home),
    Screen.Transactions to ("账单" to Icons.Filled.ReceiptLong),
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
    var showAddSheet by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 0.dp
                ) {
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
                // 居中黑色大圆 FAB：4 tab 中间始终可见，点击弹出「记一笔 / AI 对话记账」合并菜单
                Box(
                    modifier = Modifier
                        .size(60.dp)
                        .clip(CircleShape)
                        .background(FabBackground),
                    contentAlignment = Alignment.Center
                ) {
                    FloatingActionButton(
                        onClick = { showAddSheet = true },
                        containerColor = FabBackground,
                        contentColor = Color.White,
                        shape = CircleShape,
                        elevation = FloatingActionButtonDefaults.elevation(0.dp, 0.dp),
                        modifier = Modifier.size(56.dp)
                    ) {
                        Icon(Icons.Filled.Add, "记账", modifier = Modifier.size(28.dp))
                    }
                }
            },
            floatingActionButtonPosition = FabPosition.Center
        ) { padding ->
            AppNavHost(navController, padding, onLogout)
        }

        // 记账方式合并弹层：手动记账 / AI 对话记账
        if (showAddSheet) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.35f))
                    .clickable { showAddSheet = false }
            ) {
                Column(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(
                            MaterialTheme.colorScheme.surface,
                            RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
                        )
                        .clickable { /* 吸收点击，避免穿透到遮罩 */ }
                        .padding(20.dp, 18.dp)
                ) {
                    Text(
                        "怎么记这笔账",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(Modifier.height(14.dp))

                    // 选项一：手动记账
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .clickable {
                                showAddSheet = false
                                navController.navigate(Screen.AddTransaction.route)
                            }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.Edit, "手动记账",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(26.dp)
                        )
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text("手动记账", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text(
                                "分类 + 金额键盘一笔一笔录入",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    // 选项二：AI 对话记账
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .clickable {
                                showAddSheet = false
                                navController.navigate(Screen.Chat.route)
                            }
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.Mic, "AI 对话记账",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(26.dp)
                        )
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text("AI 对话记账", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text(
                                "语音 / 文字说出花销，AI 自动识别分类金额",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .clickable { showAddSheet = false }
                            .padding(14.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("取消", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
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