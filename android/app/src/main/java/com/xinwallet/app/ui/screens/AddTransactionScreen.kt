package com.xinwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
import com.xinwallet.app.ui.viewmodel.AddTransactionViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDateTime
import kotlinx.coroutines.launch

/**
 * 记一笔 / 编辑交易（参考暖棕记账 app 改版）
 *
 * 布局：
 *   [TopBar]
 *   1) 类型段（支出 / 收入 / 转账 / 借贷） — 选中态暖棕填充 + 白字
 *   2) 分类圆形网格（4 列 × N 行） — 选中态实心青底 + 白字
 *   3) 金额区：大字号 ¥0.00 + 备注行
 *   4) Chip 栏：今天 / 账本 / 资产账户 / 图片 / 不报销
 *   5) 4×5 自定义数字键盘（最右列：⌫ + - 完成）
 *
 * 转账模式：分类网格替换为「转出/转入」账户网格
 *
 * @param editId >0 表示编辑模式（转账项编辑被禁用）
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddTransactionScreen(navController: NavHostController, editId: Int = 0, month: String? = null) {
    val vm: AddTransactionViewModel = viewModel(factory = viewModelFactory {
        AddTransactionViewModel(AppContainer.transactionRepository, AppContainer.accountRepository, AppContainer.categoryRepository)
    })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val isEdit = editId > 0

    // 类型段：支出 / 收入 / 转账 / 借贷
    var type by remember { mutableStateOf("expense") }
    var amount by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var accountId by remember { mutableStateOf<Int?>(null) }
    var categoryId by remember { mutableStateOf<Int?>(null) }
    var fromId by remember { mutableStateOf<Int?>(null) }
    var toId by remember { mutableStateOf<Int?>(null) }
    // 业务侧日期字段（保留到分钟级）；UI 上 Chip 显示 "今天"，点击改日期
    var date by remember { mutableStateOf(todayDateTime()) }
    var prefilled by remember { mutableStateOf(false) }
    // 借贷模式：标记属于借出/借入。0=out, 1=in
    var debtDirection by remember { mutableStateOf(0) }
    // 不报销开关（仅支出）
    var notReimbursable by remember { mutableStateOf(false) }
    // 图片附件（占位：暂未接入选图）
    var hasImage by remember { mutableStateOf(false) }
    // AI 内联面板
    var aiMode by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { vm.loadOptions(if (isEdit) editId else null, month) }
    LaunchedEffect(state.success) { if (state.success) navController.popBackStack() }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it) } }

    LaunchedEffect(state.editing) {
        val tx = state.editing
        if (tx != null && !prefilled) {
            type = if (tx.type == "income") "income" else "expense"
            amount = trimAmount(tx.amount)
            note = tx.note.orEmpty()
            accountId = tx.account?.id
            categoryId = tx.category?.id
            date = tx.date.trim().let { if (it.length >= 19) it.substring(0, 19) else it.take(10) + " 00:00:00" }
            prefilled = true
        }
    }

    fun doSubmit(keepOpen: Boolean) {
        val amt = amount.toDoubleOrNull() ?: 0.0
        if (amt <= 0) { scope.launch { snackbar.showSnackbar("请输入有效金额") }; return }
        when {
            isEdit -> {
                if (accountId == null) { scope.launch { snackbar.showSnackbar("请选择账户") }; return }
                if (categoryId == null) { scope.launch { snackbar.showSnackbar("请选择分类") }; return }
                vm.submitEdit(editId, accountId!!, categoryId!!, amt, note, type, date)
            }
            type == "transfer" -> {
                if (fromId == null || toId == null) { scope.launch { snackbar.showSnackbar("请选择转出和转入账户") }; return }
                if (fromId == toId) { scope.launch { snackbar.showSnackbar("转出和转入账户不能相同") }; return }
                vm.submitTransfer(fromId!!, toId!!, amt, note, date)
            }
            type == "debt" -> {
                // 借贷：复用转账端点的方向语义；当前实现暂用支出/收入标记作为兜底
                if (accountId == null) { scope.launch { snackbar.showSnackbar("请选择账户") }; return }
                if (categoryId == null) { scope.launch { snackbar.showSnackbar("请选择分类") }; return }
                val t = if (debtDirection == 0) "expense" else "income"
                vm.submitExpense(accountId!!, categoryId!!, amt, note, t, date)
            }
            else -> {
                if (accountId == null) { scope.launch { snackbar.showSnackbar("请选择账户") }; return }
                if (categoryId == null) { scope.launch { snackbar.showSnackbar("请选择分类") }; return }
                vm.submitExpense(accountId!!, categoryId!!, amt, note, type, date)
            }
        }
        if (keepOpen) {
            // "再记" 模式：保留当前类型/账户/分类，清空金额与备注
            amount = ""
            note = ""
        }
    }

    Scaffold(
        topBar = { TopBar(if (isEdit) "编辑交易" else "记一笔", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        if (aiMode) {
            Column(Modifier.fillMaxSize().padding(padding)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("AI 智能记账", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    TextButton(onClick = { aiMode = false }) { Text("收起") }
                }
                Box(Modifier.weight(1f)) { AiScanContent(navController, PaddingValues()) }
            }
            return@Scaffold
        }
        if (state.loading && state.accounts.isEmpty() && state.categories.isEmpty()) {
            LoadingBox()
            return@Scaffold
        }

        Column(Modifier.fillMaxSize().padding(padding)) {
            // ---- 类型段（4 列） ----
            TypeSegmentedRow(
                current = type,
                isEdit = isEdit,
                onChange = {
                    type = it
                    categoryId = null
                    if (it == "transfer") { fromId = null; toId = null }
                }
            )

            // ---- 分类 / 账户选择区 ----
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (type) {
                    "transfer" -> AccountGridSelector(
                        titleLeft = "转出账户",
                        titleRight = "转入账户",
                        accounts = state.accounts,
                        selectedLeftId = fromId,
                        selectedRightId = toId,
                        onSelectLeft = { fromId = it },
                        onSelectRight = { toId = it }
                    )
                    "debt" -> Column {
                        DebtDirectionToggle(debtDirection) { debtDirection = it }
                        CategoryGrid(
                            categories = state.categories.filter { it.type == if (debtDirection == 0) "expense" else "income" },
                            selectedId = categoryId,
                            onSelect = { categoryId = it }
                        )
                        Spacer(Modifier.height(8.dp))
                        AccountChipRow(
                            accounts = state.accounts,
                            selectedId = accountId,
                            onSelect = { accountId = it }
                        )
                    }
                    else -> CategoryGrid(
                        categories = state.categories.filter { it.type == type },
                        selectedId = categoryId,
                        onSelect = { categoryId = it }
                    )
                }
            }

            // ---- 金额区 ----
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "¥",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(end = 4.dp, bottom = 6.dp)
                    )
                    Text(
                        if (amount.isBlank()) "0.00" else amount,
                        style = MaterialTheme.typography.displayLarge,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Spacer(Modifier.height(4.dp))
                Text(
                    if (note.isBlank()) "点击填写备注..." else note,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (note.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            // 备注行点击：在金额键盘上方弹出一个简易输入条（这里仅占位）
                            scope.launch { snackbar.showSnackbar("备注：长按或侧边补充（可在设置里启用全键盘）") }
                        }
                )
            }

            // ---- Chip 栏（转账/借贷模式只显示日期 chip） ----
            ChipRow(
                type = type,
                date = date.take(10),
                accountName = state.accounts.find { it.id == accountId }?.name ?: "默认账本",
                hasImage = hasImage,
                notReimbursable = notReimbursable,
                onPickDate = {
                    scope.launch { snackbar.showSnackbar("日期选择：${date.take(10)}（后续接入日历弹窗）") }
                },
                onToggleImage = { hasImage = !hasImage },
                onToggleNotReimbursable = { notReimbursable = !notReimbursable },
                onAi = { aiMode = true }
            )

            // ---- 4×5 自定义数字键盘 ----
            NumericKeypad(
                value = amount,
                onValueChange = { amount = it },
                onSubmit = { doSubmit(false) },
                onSubmitAndNew = { doSubmit(true) }
            )
        }
    }
}

/* ============================================================
 * 私有组件
 * ============================================================ */

/** 4 段类型选择：支出 / 收入 / 转账 / 借贷 */
@Composable
private fun TypeSegmentedRow(current: String, isEdit: Boolean, onChange: (String) -> Unit) {
    val items = listOf(
        Triple("expense", "支出", false),
        Triple("income", "收入", false),
        Triple("transfer", "转账", isEdit),       // 编辑模式隐藏转账
        Triple("debt", "借贷", false)
    )
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items.forEach { (key, label, hidden) ->
            if (hidden) return@forEach
            val selected = current == key
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .height(36.dp)
                    .clickable { onChange(key) },
                shape = RoundedCornerShape(50),
                color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                border = if (!selected) androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelLarge,
                        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal
                    )
                }
            }
        }
    }
}

/** 分类圆形网格：4 列 × N 行。选中态：实心青底 + 白字；未选中：浅青填充 + 灰文字 */
@Composable
private fun CategoryGrid(
    categories: List<com.xinwallet.app.data.model.Category>,
    selectedId: Int?,
    onSelect: (Int) -> Unit
) {
    if (categories.isEmpty()) {
        emptyGridPlaceholder()
        return
    }
    val list = categories
    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        list.chunked(4).forEach { row ->
            Row(Modifier.fillMaxWidth()) {
                row.forEach { cat ->
                    CategoryGridCell(cat = cat, selected = selectedId == cat.id, onClick = { onSelect(cat.id) }, modifier = Modifier.weight(1f))
                }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
        if (list.size % 4 != 0) Spacer(Modifier.height(4.dp))
        // "+ 分类管理" 占位 cell
        CategoryGridCell(
            cat = com.xinwallet.app.data.model.Category(id = -1, name = "分类管理", icon = "➕"),
            selected = false,
            onClick = { /* 跳分类管理 - 由调用方在 Chips 处理；此处仅占位 */ },
            isPlaceholder = true,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun emptyGridPlaceholder() {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("暂无分类", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun CategoryGridCell(
    cat: com.xinwallet.app.data.model.Category,
    selected: Boolean,
    onClick: () -> Unit,
    isPlaceholder: Boolean = false,
    modifier: Modifier = Modifier
) {
    val bg = when {
        isPlaceholder -> MaterialTheme.colorScheme.surfaceVariant
        selected -> Brown500
        else -> Brown50
    }
    val fg = when {
        isPlaceholder -> MaterialTheme.colorScheme.onSurfaceVariant
        selected -> Color.White
        else -> MaterialTheme.colorScheme.onSurface
    }
    Column(
        modifier = modifier.clickable(onClick = onClick).padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            Modifier.size(44.dp).clip(CircleShape).background(bg),
            contentAlignment = Alignment.Center
        ) {
            Text(
                cat.icon ?: "📌",
                fontSize = 22.sp,
                color = fg
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            cat.name,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1
        )
    }
}

/** 转账模式：左右两组账户圆形按钮 */
@Composable
private fun AccountGridSelector(
    titleLeft: String,
    titleRight: String,
    accounts: List<com.xinwallet.app.data.model.Account>,
    selectedLeftId: Int?,
    selectedRightId: Int?,
    onSelectLeft: (Int) -> Unit,
    onSelectRight: (Int) -> Unit
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(titleLeft, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        AccountChipRow(accounts = accounts, selectedId = selectedLeftId, onSelect = onSelectLeft)
        Spacer(Modifier.height(16.dp))
        Text(titleRight, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        AccountChipRow(accounts = accounts, selectedId = selectedRightId, onSelect = onSelectRight)
    }
}

@Composable
private fun AccountChipRow(
    accounts: List<com.xinwallet.app.data.model.Account>,
    selectedId: Int?,
    onSelect: (Int) -> Unit
) {
    if (accounts.isEmpty()) {
        Text("暂无账户，请先在「账户」页添加", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    LazyVerticalGrid(
        columns = GridCells.Fixed(4),
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        items(accounts) { acc ->
            val selected = selectedId == acc.id
            Surface(
                modifier = Modifier.fillMaxWidth().height(56.dp).clickable { onSelect(acc.id) },
                shape = RoundedCornerShape(12.dp),
                color = if (selected) Brown500 else Brown50,
                border = if (!selected) androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null
            ) {
                Column(
                    Modifier.padding(6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(acc.icon ?: "💰", fontSize = 18.sp)
                    Spacer(Modifier.height(2.dp))
                    Text(
                        acc.name,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
                        maxLines = 1
                    )
                }
            }
        }
    }
}

/** 借贷方向切换（借出/借入） */
@Composable
private fun DebtDirectionToggle(current: Int, onChange: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        listOf(0 to "借出", 1 to "借入").forEach { (idx, label) ->
            val selected = current == idx
            Surface(
                modifier = Modifier.height(36.dp).clickable { onChange(idx) },
                shape = RoundedCornerShape(50),
                color = if (selected) Brown500 else MaterialTheme.colorScheme.surface,
                border = if (!selected) androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant) else null
            ) {
                Box(Modifier.padding(horizontal = 16.dp), contentAlignment = Alignment.Center) {
                    Text(label, color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}

/** Chip 栏：今天 / 账本 / 资产账户 / 图片 / 不报销 / AI */
@Composable
private fun ChipRow(
    type: String,
    date: String,
    accountName: String,
    hasImage: Boolean,
    notReimbursable: Boolean,
    onPickDate: () -> Unit,
    onToggleImage: () -> Unit,
    onToggleNotReimbursable: () -> Unit,
    onAi: () -> Unit
) {
    if (type == "transfer") {
        // 转账模式只显示日期 Chip
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp)) {
            Chip(date, leading = "🗓", onClick = onPickDate)
        }
        return
    }
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Chip(date, leading = "🗓", onClick = onPickDate)
        Chip(accountName, leading = "💼")
        if (type == "expense") {
            Chip(if (hasImage) "图片 ✓" else "图片", leading = "🖼", onClick = onToggleImage)
            Chip(if (notReimbursable) "不报销 ✓" else "不报销", leading = "🚫", onClick = onToggleNotReimbursable)
        }
        Chip("AI 拍照", leading = "📷", onClick = onAi)
    }
}

/** Chip 单元：暖棕淡填充 + 圆角胶囊 */
@Composable
private fun Chip(label: String, leading: String? = null, onClick: (() -> Unit)? = null) {
    val mod = if (onClick != null) Modifier.clickable { onClick() } else Modifier
    Surface(
        modifier = mod,
        shape = RoundedCornerShape(50),
        color = Brown50,
        border = androidx.compose.foundation.BorderStroke(1.dp, Brown100)
    ) {
        Row(
            Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (leading != null) {
                Text(leading, fontSize = 12.sp)
                Spacer(Modifier.width(4.dp))
            }
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
        }
    }
}

/** 4×5 自定义数字键盘 */
@Composable
private fun NumericKeypad(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSubmitAndNew: () -> Unit
) {
    fun append(ch: String) {
        // 限制：仅 1 个小数点；小数位最多 2 位；开头不能有多个 0
        var next = value + ch
        if (ch == ".") {
            if (value.contains(".")) return
            if (value.isEmpty()) next = "0."
        }
        val dotIdx = next.indexOf(".")
        if (dotIdx >= 0 && next.length - dotIdx - 1 > 2) return
        if (next.startsWith("0") && !next.startsWith("0.") && next.length > 1) next = next.trimStart('0').let { if (it.startsWith(".")) "0$it" else it }
        onValueChange(next)
    }
    fun backspace() {
        if (value.isEmpty()) return
        onValueChange(value.dropLast(1))
    }
    fun clear() = onValueChange("")

    Column(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface).padding(8.dp)
    ) {
        // 行 1：1 2 3 ⌫
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KeyCell("1", Modifier.weight(1f)) { append("1") }
            KeyCell("2", Modifier.weight(1f)) { append("2") }
            KeyCell("3", Modifier.weight(1f)) { append("3") }
            KeyCell("⌫", Modifier.weight(1f), isAction = true) { backspace() }
        }
        Spacer(Modifier.height(6.dp))
        // 行 2：4 5 6 +
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KeyCell("4", Modifier.weight(1f)) { append("4") }
            KeyCell("5", Modifier.weight(1f)) { append("5") }
            KeyCell("6", Modifier.weight(1f)) { append("6") }
            KeyCell("+", Modifier.weight(1f), isAction = true) { append("+") }
        }
        Spacer(Modifier.height(6.dp))
        // 行 3：7 8 9 -
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KeyCell("7", Modifier.weight(1f)) { append("7") }
            KeyCell("8", Modifier.weight(1f)) { append("8") }
            KeyCell("9", Modifier.weight(1f)) { append("9") }
            KeyCell("-", Modifier.weight(1f), isAction = true) { append("-") }
        }
        Spacer(Modifier.height(6.dp))
        // 行 4：. 0 再记 完成
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            KeyCell(".", Modifier.weight(1f)) { append(".") }
            KeyCell("0", Modifier.weight(1f)) { append("0") }
            KeyCell("再记", Modifier.weight(1f), isAction = true) { onSubmitAndNew() }
            KeyCell("完成", Modifier.weight(1f), isPrimary = true) { onSubmit() }
        }
        Spacer(Modifier.height(2.dp))
    }
}

@Composable
private fun KeyCell(
    label: String,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    isAction: Boolean = false,
    onClick: () -> Unit
) {
    val bg = when {
        isPrimary -> Brown500
        isAction -> MaterialTheme.colorScheme.surfaceVariant
        else -> MaterialTheme.colorScheme.surface
    }
    val fg = when {
        isPrimary -> Color.White
        else -> MaterialTheme.colorScheme.onSurface
    }
    Box(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(if (isPrimary) 12.dp else 50.dp))
            .background(bg)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            label,
            style = MaterialTheme.typography.titleMedium,
            color = fg,
            fontWeight = if (isPrimary || isAction) FontWeight.SemiBold else FontWeight.Medium
        )
    }
}

/* 金额回填时去掉多余小数：120.00 -> 120，12.50 -> 12.5 */
internal fun trimAmount(value: Double): String {
    val s = java.math.BigDecimal(value).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()
    return s.trimEnd('0').trimEnd('.').ifEmpty { "0" }
}