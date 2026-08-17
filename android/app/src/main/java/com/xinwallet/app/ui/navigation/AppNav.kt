@file:OptIn(ExperimentalMaterial3Api::class)

package com.xinwallet.app.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.PieChart
import androidx.compose.material.icons.outlined.ReceiptLong
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.navArgument
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavDestination
import androidx.navigation.NavGraph
import com.xinwallet.app.ui.screens.AccountDetailScreen
import com.xinwallet.app.ui.screens.AccountsScreen
import com.xinwallet.app.ui.screens.AddTransactionScreen
import com.xinwallet.app.ui.screens.AiScanScreen
import com.xinwallet.app.ui.screens.AppLockScreen
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
import com.xinwallet.app.ui.screens.BudgetScreen
import com.xinwallet.app.ui.screens.SavingsGoalsScreen
import com.xinwallet.app.ui.screens.LoanScreen
import com.xinwallet.app.ui.screens.SettingsScreen
import com.xinwallet.app.ui.screens.SearchScreen
import com.xinwallet.app.ui.theme.Brown500
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Edit
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String) {
    object Home : Screen("home")
    object Accounts : Screen("accounts")
    object AccountDetail : Screen("account/{id}") {
        fun create(id: Int) = "account/$id"
    }
    object Transactions : Screen("transactions?month={month}&view={view}") {
        fun create(month: String? = null, view: String? = null): String {
            val sb = StringBuilder("transactions")
            if (month != null) sb.append("?month=$month")
            if (view != null) sb.append(if (sb.contains("?")) "&view=$view" else "?view=$view")
            return sb.toString()
        }
    }
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
    object Search : Screen("search")
    object Tags : Screen("tags")
    object Categories : Screen("categories")
    object Chat : Screen("chat")
    object Budgets : Screen("budgets")
    object SavingsGoals : Screen("savings-goals")
    object Debts : Screen("debts")
    object Settings : Screen("settings")
    object AppLock : Screen("app_lock")
}

/**
 * 底部 4 tab：首页 / 账单 / 统计 / 我的
 * 中间圆形「记账」按钮由 MainScaffold 单独叠加（不是 NavigationBarItem）。
 */
private val bottomItems = listOf(
    Screen.Home to ("首页" to Icons.Outlined.Home),
    Screen.Transactions to ("账单" to Icons.Outlined.ReceiptLong),
    Screen.Reports to ("统计" to Icons.Outlined.PieChart),
    Screen.Profile to ("我的" to Icons.Outlined.Person)
)

/** 单个底部文字 tab（图标 + 文字，整体垂直居中，参考 com.miaoa.cola 紧凑布局） */
@Composable
private fun TabItem(
    screen: Screen,
    pair: Pair<String, ImageVector>,
    current: String?,
    navigateRoot: (String) -> Unit
) {
    val (label, icon) = pair
    val selected = current == screen.route
    val tint = if (selected) MaterialTheme.colorScheme.primary
               else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        modifier = Modifier
            .clickable { navigateRoot(screen.route) }
            .padding(horizontal = 4.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            Modifier.offset(y = 0.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 选中态：仅图标底部柔和阴影（无底色填充），阴影随选中平滑出现，整体下移使其留在 tab 栏内
            val elev by animateDpAsState(
                targetValue = if (selected) 3.dp else 0.dp,
                animationSpec = tween(durationMillis = 220),
                label = "tabElev"
            )
            Box(
                Modifier
                    .shadow(elevation = elev, shape = CircleShape, clip = false, ambientColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.35f), spotColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.35f))
                    .padding(4.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, label, tint = tint, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.height(4.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = tint)
        }
    }
}

/** 当前路由命中到哪个底部 tab（子路由归并到所属 tab） */
fun routeKey(route: String?): String? = when {
    route == null -> null
    route.startsWith("account") -> Screen.Profile.route
    route.startsWith("reports") -> Screen.Reports.route
    route.startsWith("edit") -> Screen.Transactions.route
    route.startsWith("ai") -> Screen.Transactions.route
    route.startsWith("add") -> Screen.AddTransaction.route  // 记账独立 tab
    route.startsWith("chat") -> Screen.Profile.route       // 对话下沉到「我的」
    route.startsWith("budgets") -> Screen.Profile.route
    route.startsWith("savings") -> Screen.Profile.route
    route.startsWith("debts") -> Screen.Profile.route
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

/** 不显示底部 tab 栏的路由（AI 记账 / 手动记账为沉浸式交互页，避开 5 槽均分干扰） */
private fun isNoTabRoute(route: String?): Boolean {
    if (route == null) return false
    return route.startsWith("chat") || route.startsWith("add") || route.startsWith("edit")
}

@Composable
fun MainScaffold(onLogout: () -> Unit) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val current = routeKey(navBackStackEntry?.destination?.route)
    val currentRoute = navBackStackEntry?.destination?.route
    val showBottomBar = !isNoTabRoute(currentRoute)
    var showAddMenu by remember { mutableStateOf(false) }

    // 必须是 val lambda 而不是局部 fun：fun 名不能直接当 (String)->Unit 传递，
    // 而 TabItem 需要把它当值传过去（之前内联 clickable 直接调用没问题）。
    val navigateRoot: (String) -> Unit = { route ->
        // 底部 tab 传的是 Screen.route 模式串（含 {month}/{view} 占位符），
        // 直接 navigate 会把字面量 "{view}" 当作参数值，导致 viewMode 既不匹配 list 也不匹配 calendar。
        // 这里对 transactions 用无参 create() 规范化，保证默认进入「流水」视图。
        val actual = if (route == Screen.Transactions.route) Screen.Transactions.create() else route
        navController.navigate(actual) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            contentWindowInsets = WindowInsets(0, 0, 0, 0),
            bottomBar = {
                // 沉浸页（chat/add/edit）直接隐藏整条 tab 栏，避免给输入区让出 64dp 视觉噪音
                if (showBottomBar) {
                    // 底部栏：bar 64dp（用户反馈 79dp 过高），圆 46dp 垂直居中
                    // - 5 槽均分（首页/账单/圆/统计/我的）
                    // - Scaffold.contentWindowInsets=WindowInsets(0) 阻断默认给 bottomBar 加系统栏 inset
                    val navH = 64.dp
                    Box(
                        Modifier.fillMaxWidth()
                            .height(navH)
                            // 仅靠阴影营造「悬浮于内容之上」的层次感（更柔和）
                            .shadow(elevation = 2.dp, clip = false)
                            .background(MaterialTheme.colorScheme.surface)
                    ) {
                        Row(
                            Modifier.fillMaxWidth().fillMaxHeight(),
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            // 5 个图标等距分布：首页 / 账单 / 圆 / 统计 / 我的
                            //   - 图标大小可以不一致（圆比 tab 图标大）
                            //   - 图标之间的空白间距全部相等（SpaceEvenly）
                            bottomItems.take(1).forEach { (screen, pair) ->
                                TabItem(screen, pair, current, navigateRoot)
                            }
                            bottomItems.drop(1).take(1).forEach { (screen, pair) ->
                                TabItem(screen, pair, current, navigateRoot)
                            }
                            // 中间「记账」暖棕圆形按钮：作为 Row 第 3 个成员参与等距分布
                            Box(
                                Modifier
                                    .size(46.dp)
                                    .clip(CircleShape)
                                    .background(Brown500)
                                    .shadow(elevation = 4.dp, shape = CircleShape, clip = false, ambientColor = Brown500.copy(alpha = 0.5f), spotColor = Brown500.copy(alpha = 0.5f))
                                    .clickable { showAddMenu = true },
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Filled.Add,
                                    contentDescription = "记账",
                                    tint = Color.White,
                                    modifier = Modifier.size(30.dp)
                                )
                            }
                            bottomItems.drop(2).take(1).forEach { (screen, pair) ->
                                TabItem(screen, pair, current, navigateRoot)
                            }
                            bottomItems.drop(3).forEach { (screen, pair) ->
                                TabItem(screen, pair, current, navigateRoot)
                            }
                        }
                    }
                }
            }
        ) { padding ->
            AppNavHost(navController, padding, onLogout)
        }

        if (showAddMenu) {
            // 半透明遮罩：点在空白区域关闭；两个圆形按钮浮在 tab 栏上方 20mm 处
            Box(Modifier.fillMaxSize()) {
                Box(
                    Modifier.matchParentSize()
                        .background(Color.Black.copy(alpha = 0.45f))
                        .clickable { showAddMenu = false }
                )
                Row(
                    Modifier.align(Alignment.BottomCenter).padding(bottom = 140.dp),
                    horizontalArrangement = Arrangement.spacedBy(36.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    AddQuickCircle("AI 记账", Icons.Filled.AutoAwesome) {
                        showAddMenu = false
                        navigateRoot(Screen.Chat.route)
                    }
                    AddQuickCircle("手动记账", Icons.Filled.Edit) {
                        showAddMenu = false
                        navigateRoot(Screen.AddTransaction.route)
                    }
                }
            }
        }

    }
}

/** 记账快捷圆形按钮：暖棕圆 + 白图标 + 下方文字 */
@Composable
private fun AddQuickCircle(label: String, icon: ImageVector, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() }
    ) {
        Box(
            Modifier
                .size(66.dp)
                .clip(CircleShape)
                .background(Brown500)
                .shadow(elevation = 6.dp, shape = CircleShape, clip = false, ambientColor = Brown500.copy(alpha = 0.5f), spotColor = Brown500.copy(alpha = 0.5f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(32.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(label, color = Color.White, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
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
        composable(
            route = Screen.Transactions.route,
            arguments = listOf(
                navArgument("month") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("view") { type = NavType.StringType; nullable = true; defaultValue = null }
            )
        ) { backStackEntry ->
            val monthArg = backStackEntry.arguments?.getString("month")
            val viewArg = backStackEntry.arguments?.getString("view")
            TransactionsScreen(navController, initialMonth = monthArg, initialViewMode = viewArg)
        }
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
        composable(Screen.Reports.route) { ReportsScreen(navController) }
        composable(Screen.Search.route) { SearchScreen(navController) }
        composable(Screen.Chat.route) { ChatScreen(navController) }
        composable(Screen.Tags.route) { TagsScreen(navController) }
        composable(Screen.Categories.route) { CategoryScreen(navController) }
        composable(Screen.Budgets.route) { BudgetScreen(navController) }
        composable(Screen.SavingsGoals.route) { SavingsGoalsScreen(navController) }
        composable(Screen.Debts.route) { LoanScreen(navController) }
        composable(Screen.Settings.route) { SettingsScreen(navController) }
        composable(Screen.AppLock.route) { AppLockScreen(navController, mode = "Settings") }
    }
}