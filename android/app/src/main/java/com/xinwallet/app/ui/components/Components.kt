package com.xinwallet.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.xinwallet.app.data.model.Account
import com.xinwallet.app.data.model.Transaction
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.data.model.TransactionItem
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
import com.xinwallet.app.util.formatMoney
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.Brush

@Composable
fun TopBar(title: String, onBack: (() -> Unit)? = null) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().height(56.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (onBack != null) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "返回") }
            }
            Text(title, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

@Composable
fun BalanceCard(title: String, amount: Double, subtitle: String? = null, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    Card(
        modifier = Modifier.fillMaxWidth().then(modifier).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(Modifier.padding(20.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.height(6.dp))
            Text(formatMoney(amount), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
            if (subtitle != null) {
                Spacer(Modifier.height(4.dp))
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f))
            }
        }
    }
}

/**
 * Hero 渐变卡：用于首页"本月支出 ¥1.00"类醒目头卡（暖棕渐变 + 大数字）。
 * 副标题区支持左右两段（本月收入 / 日均支出 等对照指标）。
 */
@Composable
fun HeroGradientCard(
    amount: Double,
    topLeft: String,
    topRight: String? = null,
    bottomLeft: String? = null,
    bottomRight: String? = null,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val gradient = Brush.linearGradient(
        colors = listOf(Brown500, Brown300)
    )
    Surface(
        modifier = Modifier.fillMaxWidth().then(modifier).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        shape = RoundedCornerShape(20.dp),
        color = Color.Transparent
    ) {
        Box(
            Modifier.fillMaxWidth().background(gradient).padding(20.dp)
        ) {
            Column {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(topLeft, style = MaterialTheme.typography.titleMedium, color = Color.White)
                    if (topRight != null) {
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = Color.White.copy(alpha = 0.22f)
                        ) {
                            Text(
                                topRight,
                                style = MaterialTheme.typography.labelMedium,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                Text(
                    "¥ ${formatMoney(amount)}",
                    style = MaterialTheme.typography.displayMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                if (bottomLeft != null || bottomRight != null) {
                    Spacer(Modifier.height(10.dp))
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(24.dp)
                    ) {
                        bottomLeft?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.92f))
                        }
                        bottomRight?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.92f))
                        }
                    }
                }
            }
        }
    }
}

/**
 * 2x2 KPI 网格小卡：用于"支出金额/日均支出/本月预算/剩余预算"四联展示。
 * 每张卡片左侧一个圆形小图标 + 标题，下方大数字。
 */
@Composable
fun StatKpiCard(
    title: String,
    amount: Double,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    Card(
        modifier = Modifier.then(modifier).then(if (onClick != null) Modifier.clickable { onClick() } else Modifier),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = Brown50,
                    modifier = Modifier.size(28.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(icon, contentDescription = null, tint = Brown500, modifier = Modifier.size(16.dp))
                    }
                }
                Spacer(Modifier.width(8.dp))
                Text(title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Spacer(Modifier.height(8.dp))
            Text(
                "¥ ${formatMoney(amount)}",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = Brown500
            )
        }
    }
}

fun accountTypeLabel(type: String): String = when (type) {
    "cash" -> "现金"
    "bank_card" -> "银行卡"
    "credit_card" -> "信用卡"
    "electronic_payment" -> "电子支付"
    "financial_account" -> "理财账户"
    "digital" -> "数字资产"
    else -> "其他"
}

@Composable
fun AccountListItem(account: Account, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable { onClick() }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(44.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(account.icon ?: "💰", style = MaterialTheme.typography.titleMedium) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(account.name, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(accountTypeLabel(account.type), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(formatMoney(account.balance), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
            if (account.type == "credit_card" && account.creditLimit > 0) {
                Text("额度 ${formatMoney(account.creditLimit)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
fun TransactionRow(item: TransactionItem) {
    val dark = LocalIsDark.current
    val isIncome = item.type == "income" || item.type == "transfer_in"
    val isExpense = item.type == "expense" || item.type == "transfer_out"
    val color = when {
        isIncome -> if (dark) IncomeColorDark else IncomeColor
        isExpense -> if (dark) ExpenseColorDark else ExpenseColor
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(40.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(item.category?.icon ?: "📌", style = MaterialTheme.typography.bodyLarge) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(item.category?.name ?: "交易", style = MaterialTheme.typography.bodyLarge)
            val sub = item.counterparty?.let { "${it.dir ?: ""}${it.name}" } ?: item.account?.name ?: item.date.take(10)
            Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            (if (isIncome) "+" else if (isExpense) "-" else "") + formatMoney(item.amount),
            style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold, color = color
        )
    }
}

@Composable
fun RecentTransactionRow(tx: Transaction) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(40.dp)) {
            Box(contentAlignment = Alignment.Center) { Text(tx.catIcon ?: "📌", style = MaterialTheme.typography.bodyLarge) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(tx.catName ?: "交易", style = MaterialTheme.typography.bodyLarge)
            Text(tx.date.take(10), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(formatMoney(tx.amount), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun LinearProgress(percent: Float, color: Color, modifier: Modifier = Modifier) {
    LinearProgressIndicator(
        progress = { percent.coerceIn(0f, 1f) },
        modifier = modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)),
        color = color,
        trackColor = MaterialTheme.colorScheme.surfaceVariant
    )
}

@Composable
fun EmptyState(message: String, modifier: Modifier = Modifier, icon: androidx.compose.ui.graphics.vector.ImageVector? = Icons.Filled.ReceiptLong) {
    Column(modifier.fillMaxWidth().padding(48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        icon?.let {
            Icon(it, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f), modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(12.dp))
        }
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun LoadingBox() {
    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

/**
 * 下拉刷新容器：包裹可滚动内容（LazyColumn / LazyRow / Column(scroll)），
 * 顶部居中显示 Material3 风格的刷新指示器。refreshing 传入 VM 的 loading/refreshing 状态。
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun PullRefreshBox(
    refreshing: Boolean,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
    contentAlignment: Alignment = Alignment.TopStart,
    content: @Composable BoxScope.() -> Unit
) {
    val state = rememberPullRefreshState(refreshing, onRefresh)
    Box(modifier.pullRefresh(state), contentAlignment = contentAlignment) {
        content()
        PullRefreshIndicator(refreshing, state, Modifier.align(Alignment.TopCenter))
    }
}

/**
 * 只读下拉选择框。选项为 (显示文本, id) 列表，空列表时展示 emptyHint。
 * 抽到公共组件，供记一笔 / AI 记账 / 账户表单共用。
 */
@Composable
fun DropdownField(
    label: String,
    value: String,
    options: List<Pair<String, Int>>,
    modifier: Modifier = Modifier,
    emptyHint: String? = null,
    onSelected: (Int) -> Unit
) {
    var expanded by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    Column(modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = {
                IconButton(onClick = { expanded = true }) {
                    Icon(Icons.Filled.ArrowDropDown, contentDescription = "展开")
                }
            },
            modifier = Modifier.fillMaxWidth().clickable { expanded = true }
        )
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
            modifier = Modifier.fillMaxWidth()
        ) {
            if (options.isEmpty()) {
                DropdownMenuItem(
                    text = { Text(emptyHint ?: "暂无选项", color = MaterialTheme.colorScheme.outline) },
                    onClick = { expanded = false }
                )
            } else {
                options.forEach { (name, id) ->
                    DropdownMenuItem(text = { Text(name) }, onClick = { onSelected(id); expanded = false })
                }
            }
        }
    }
}

/** 只读日期输入框，点击弹出 Material3 日期选择器 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(
    label: String,
    date: String,
    modifier: Modifier = Modifier,
    onDateChange: (String) -> Unit
) {
    var show by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    OutlinedTextField(
        value = date,
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        singleLine = true,
        trailingIcon = {
            IconButton(onClick = { show = true }) { Icon(Icons.Filled.DateRange, contentDescription = "选择日期") }
        },
        modifier = modifier.fillMaxWidth().clickable { show = true }
    )
    if (show) {
        val pickerState = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = parseDateMillis(date) ?: System.currentTimeMillis()
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { show = false },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { onDateChange(formatDateMillis(it)) }
                    show = false
                }) { Text("确定") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { show = false }) { Text("取消") }
            }
        ) { androidx.compose.material3.DatePicker(state = pickerState) }
    }
}

private fun parseDateMillis(date: String): Long? = try {
    java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.CHINA).parse(date)?.time
} catch (_: Exception) { null }

private fun formatDateMillis(millis: Long): String {
    val c = java.util.Calendar.getInstance().apply { timeInMillis = millis }
    return String.format(
        java.util.Locale.CHINA, "%04d-%02d-%02d",
        c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1, c.get(java.util.Calendar.DAY_OF_MONTH)
    )
}

/**
 * 只读「日期 + 时间（到秒）」输入框，值格式固定为 yyyy-MM-dd HH:mm:ss。
 *
 * 交互：点输入框或日历图标改日期，点时钟图标改时间；时间弹窗里除了 Material3 的
 * 时/分转盘，额外给一个「秒」输入框，满足按秒记账的需求（后端 date 字段本来就是 datetime）。
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun DateTimePickerField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onValueChange: (String) -> Unit
) {
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    val parts = remember(value) { parseDateTimeParts(value) }

    OutlinedTextField(
        value = value,
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        singleLine = true,
        trailingIcon = {
            Row {
                IconButton(onClick = { showDate = true }) { Icon(Icons.Filled.DateRange, contentDescription = "选择日期") }
                IconButton(onClick = { showTime = true }) { Icon(Icons.Filled.Schedule, contentDescription = "选择时间") }
            }
        },
        modifier = modifier.fillMaxWidth().clickable { showDate = true }
    )

    if (showDate) {
        val pickerState = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = utcMidnightMillis(parts[0], parts[1], parts[2])
        )
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        val c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply { timeInMillis = millis }
                        onValueChange(
                            buildDateTime(
                                c.get(java.util.Calendar.YEAR),
                                c.get(java.util.Calendar.MONTH) + 1,
                                c.get(java.util.Calendar.DAY_OF_MONTH),
                                parts[3], parts[4], parts[5]
                            )
                        )
                    }
                    showDate = false
                }) { Text("确定") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showDate = false }) { Text("取消") }
            }
        ) { androidx.compose.material3.DatePicker(state = pickerState) }
    }

    if (showTime) {
        val timeState = androidx.compose.material3.rememberTimePickerState(
            initialHour = parts[3], initialMinute = parts[4], is24Hour = true
        )
        var secText by remember { mutableStateOf(String.format(java.util.Locale.CHINA, "%02d", parts[5])) }
        AlertDialog(
            onDismissRequest = { showTime = false },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    val sec = (secText.toIntOrNull() ?: 0).coerceIn(0, 59)
                    onValueChange(buildDateTime(parts[0], parts[1], parts[2], timeState.hour, timeState.minute, sec))
                    showTime = false
                }) { Text("确定") }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { showTime = false }) { Text("取消") }
            },
            title = { Text("选择时间") },
            text = {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    androidx.compose.material3.TimePicker(state = timeState)
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("秒", style = MaterialTheme.typography.bodyMedium)
                        Spacer(Modifier.width(10.dp))
                        OutlinedTextField(
                            value = secText,
                            onValueChange = { input -> secText = input.filter { it.isDigit() }.take(2) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.width(96.dp)
                        )
                    }
                }
            }
        )
    }
}

/** 解析 yyyy-MM-dd HH:mm:ss（兼容只有日期的旧值），返回 [年, 月1-12, 日, 时, 分, 秒] */
private fun parseDateTimeParts(value: String): IntArray {
    val text = value.trim()
    val parsed = runCatching {
        java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.CHINA).apply { isLenient = false }.parse(text)
    }.getOrNull() ?: runCatching {
        java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.CHINA).apply { isLenient = false }.parse(text.take(10))
    }.getOrNull()

    val c = java.util.Calendar.getInstance()
    if (parsed != null) c.time = parsed
    return intArrayOf(
        c.get(java.util.Calendar.YEAR),
        c.get(java.util.Calendar.MONTH) + 1,
        c.get(java.util.Calendar.DAY_OF_MONTH),
        c.get(java.util.Calendar.HOUR_OF_DAY),
        c.get(java.util.Calendar.MINUTE),
        c.get(java.util.Calendar.SECOND)
    )
}

private fun buildDateTime(year: Int, month: Int, day: Int, hour: Int, minute: Int, second: Int): String =
    String.format(java.util.Locale.CHINA, "%04d-%02d-%02d %02d:%02d:%02d", year, month, day, hour, minute, second)

/** DatePicker 用 UTC 零点表示"某一天"，这里按 UTC 构造，避免时区把日期挪一天 */
private fun utcMidnightMillis(year: Int, month: Int, day: Int): Long =
    java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC")).apply {
        clear()
        set(year, month - 1, day)
    }.timeInMillis

@Composable
fun ErrorState(message: String, onRetry: (() -> Unit)? = null, onLogin: (() -> Unit)? = null) {
    val scope = rememberCoroutineScope()
    val isAuthError = remember(message) {
        message.contains("登录") || message.contains("过期") || message.contains("401") ||
            message.contains("Unauthorized", ignoreCase = true) || message.contains("token", ignoreCase = true)
    }
    val effectiveOnLogin: (() -> Unit)? = onLogin ?: if (isAuthError) {
        {
            scope.launch {
                AppContainer.authRepository.logout()
                AppContainer.authExpired.emit(Unit)
            }
        }
    } else null
    Column(
        Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Filled.ErrorOutline, "错误", tint = MaterialTheme.colorScheme.error)
        Spacer(Modifier.height(8.dp))
        Text(message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
        if (effectiveOnLogin != null) {
            Spacer(Modifier.height(12.dp))
            Button(onClick = effectiveOnLogin) { Text("重新登录") }
        }
        if (onRetry != null) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onRetry) { Text("重试") }
        }
    }
}

/**
 * 顶部账本标题（截图统一样式）：居中"默认账本 ⇄"，右侧搜索图标。
 * 首页 / 账单 / 统计 三页共用。
 */
@Composable
fun BookHeader(
    onSwapBook: () -> Unit = {},
    onSearch: () -> Unit = {}
) {
    Row(
        Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center
    ) {
        Row(
            Modifier.clickable(onClick = onSwapBook),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("默认账本", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Spacer(Modifier.width(4.dp))
            Text("⇄", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onSearch) {
            Icon(Icons.Filled.Search, contentDescription = "搜索", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
