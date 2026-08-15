package com.xinwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
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
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.LinkOff
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.saveable.rememberSaveable
import com.xinwallet.app.di.AppContainer
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import java.util.Calendar
import java.util.TimeZone
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.accountTypeLabel
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
import com.xinwallet.app.ui.viewmodel.AddTransactionViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.todayDateTime
import com.xinwallet.app.util.formatMoney
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.Manifest
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.LocationManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/* ============================================================
 * 屏幕
 * 布局（按截图）：
 *   [顶栏 返回 | 支出 / 收入 | (空)]
 *   1) 一级标签 区（收起按钮 + 5 列分类网格）
 *   2) chips 行：默认账本 / 账户 / 日期 / 时间 / 不关联 / 收起（固定在分类下方）
 *   3) 位置 chip 行：合肥
 *   4) ¥0.00 + 备注占位
 *   5) 选择记账心情 5 个 chips
 *   6) 4×5 自定义键盘（+-×/ 数字 ( ) ⌫ 清空 . 确定）
 * ============================================================ */

/** GPS 定位：通过 LocationManager 拿经纬度，反向地理编码为城市/区/街道。 */
private suspend fun getCurrentLocation(context: android.content.Context): String? {
    return withContext(Dispatchers.IO) {
        try {
            val lm = context.getSystemService(android.content.Context.LOCATION_SERVICE) as? LocationManager ?: return@withContext null
            // 优先使用 GPS，否则 NETWORK
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            val loc = providers.asSequence()
                .filter { lm.isProviderEnabled(it) }
                .mapNotNull { runCatching { @Suppress("MissingPermission") lm.getLastKnownLocation(it) }.getOrNull() }
                .firstOrNull() ?: return@withContext null

            if (!Geocoder.isPresent()) return@withContext null
            val geocoder = Geocoder(context)
            val addrs = geocoder.getFromLocation(loc.latitude, loc.longitude, 1)
            val a = addrs?.firstOrNull() ?: return@withContext null
            // 拼接：city > subAdmin > featureName；优先显示"市-区"
            val parts = listOfNotNull(
                a.locality?.takeIf { it.isNotBlank() },
                a.subAdminArea?.takeIf { it.isNotBlank() }?.removeSuffix("市")?.removeSuffix("区"),
                a.thoroughfare?.takeIf { it.isNotBlank() }
            ).distinct()
            if (parts.isEmpty()) null else parts.joinToString("·")
        } catch (e: Exception) {
            null
        }
    }
}

private data class Mood(val emoji: String, val label: String)
private val MOODS = listOf(
    Mood("🚕", "该花的"),
    Mood("💸", "剁手了"),
    Mood("🐶", "情势我"),
    Mood("💃", "踩雷单"),
    Mood("🧘", "心如止水")
)

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

    // 顶层状态：仅支出/收入（截图布局，转账/借贷暂不暴露在 UI）
    var type by rememberSaveable { mutableStateOf("expense") }
    var amount by rememberSaveable { mutableStateOf("") }
    var note by rememberSaveable { mutableStateOf("") }
    var accountId by rememberSaveable { mutableStateOf<Int?>(null) }
    var categoryId by rememberSaveable { mutableStateOf<Int?>(null) }
    var date by rememberSaveable { mutableStateOf(todayDateTime()) }
    var prefilled by remember { mutableStateOf(false) }
    var notReimbursable by rememberSaveable { mutableStateOf(false) }
    var tagsCollapsed by rememberSaveable { mutableStateOf(false) }
    var selectedMood by rememberSaveable { mutableStateOf<String?>(null) }
    var location by rememberSaveable { mutableStateOf("") }
    var selectedBookId by rememberSaveable { mutableStateOf<Int?>(null) }

    // 选择类弹层 / 对话框状态
    var showAccountSheet by remember { mutableStateOf(false) }
    var showBookSheet by remember { mutableStateOf(false) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimePicker by remember { mutableStateOf(false) }
    var showNoteDialog by remember { mutableStateOf(false) }
    var showLocationDialog by remember { mutableStateOf(false) }
    var noteDraft by remember { mutableStateOf("") }
    var locationDraft by remember { mutableStateOf("") }

    val books by AppContainer.books.collectAsState()
    val currentBookId by AppContainer.currentBookId.collectAsState()

    // —— GPS 定位 ——
    val context = LocalContext.current
    var isLocating by remember { mutableStateOf(false) }
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                       perms[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            isLocating = true
            scope.launch {
                val addr = getCurrentLocation(context)
                if (addr != null) locationDraft = addr
                isLocating = false
                if (addr == null) snackbar.showSnackbar("无法获取定位，请检查GPS是否开启")
            }
        } else {
            isLocating = false
            scope.launch { snackbar.showSnackbar("未授予定位权限") }
        }
    }

    LaunchedEffect(Unit) { vm.loadOptions(if (isEdit) editId else null, month) }

    // 账户加载完成后，若用户尚未手动选择，则默认选中「默认账户」(没有则首个)，避免永远卡在"请选择账户"
    LaunchedEffect(state.accounts) {
        if (accountId == null && state.accounts.isNotEmpty()) {
            accountId = state.accounts.firstOrNull { it.isDefault }?.id ?: state.accounts.first().id
        }
    }
    // 账本默认选中当前账本
    LaunchedEffect(books) {
        if (selectedBookId == null && books.isNotEmpty()) {
            selectedBookId = currentBookId.takeIf { it > 0 } ?: books.firstOrNull()?.id
        }
    }
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
            location = tx.location.orEmpty()
            notReimbursable = (tx.linkType == "none")
            prefilled = true
        }
    }

    fun doSubmit(keepOpen: Boolean) {
        val amt = amount.toDoubleOrNull() ?: 0.0
        if (amt <= 0) { scope.launch { snackbar.showSnackbar("请输入有效金额") }; return }
        if (accountId == null) { scope.launch { snackbar.showSnackbar("请选择账户") }; return }
        if (categoryId == null) { scope.launch { snackbar.showSnackbar("请选择分类") }; return }
        val loc = location.takeIf { it.isNotBlank() }
        val lt = if (notReimbursable) "none" else null
        if (isEdit) {
            vm.submitEdit(editId, accountId!!, categoryId!!, amt, note, type, date, loc, lt, null)
        } else {
            vm.submitExpense(accountId!!, categoryId!!, amt, note, type, date, loc, lt, null)
        }
        if (keepOpen) {
            amount = ""
            note = ""
        }
    }

    Scaffold(
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
        topBar = { TopBarSegmented(type, onBack = { navController.popBackStack() }, onChange = { type = it; categoryId = null }) },
        snackbarHost = { SnackbarHost(snackbar) },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        if (state.loading && state.accounts.isEmpty() && state.categories.isEmpty()) {
            LoadingBox()
            return@Scaffold
        }

        Column(Modifier.fillMaxSize().padding(padding)) {
            // —— 上半部：可滚动（分类） ——
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
                CategorySection(
                    categories = state.categories.filter { it.type == type },
                    selectedId = categoryId,
                    collapsed = tagsCollapsed,
                    onToggleCollapsed = { tagsCollapsed = !tagsCollapsed },
                    onSelect = { categoryId = it }
                )
            }

            // —— chips 行固定在滚动区下方（不随分类滚动跑掉） ——
            ContextChipsRow(
                date = date,
                accountName = state.accounts.find { it.id == accountId }?.name ?: "请选择账户",
                bookName = books.find { it.id == selectedBookId }?.name ?: "默认账本",
                notReimbursable = notReimbursable,
                onToggleNotReimbursable = { notReimbursable = !notReimbursable },
                onPickAccount = { showAccountSheet = true },
                onPickBook = { showBookSheet = true },
                onPickDate = { showDatePicker = true },
                onPickTime = { showTimePicker = true },
                onCollapse = { tagsCollapsed = !tagsCollapsed }
            )

            LocationChipRow(
                location = location,
                onPickLocation = { locationDraft = location; showLocationDialog = true }
            )

            // —— 下半部：记账功能固定在底部（不随上半部滚动跑掉） ——
            //   金额 + 备注 + 心情 + 键盘 永远在视口下方；加 navigationBarsPadding 防系统手势条覆盖
            Column(Modifier.navigationBarsPadding()) {
                AmountBlock(
                    amount = amount,
                    note = note,
                    onAmountChange = { amount = it },
                    onNoteChange = { note = it },
                    onEditNote = { noteDraft = note; showNoteDialog = true }
                )

                MoodSection(selected = selectedMood, onSelect = { selectedMood = it })

                NewKeypad(
                    value = amount,
                    onValueChange = { amount = it },
                    onSubmit = { doSubmit(false) },
                    onSubmitAndNew = { doSubmit(true) }
                )
            }

            // —— 账户选择底部弹层 ——
            if (showAccountSheet) {
                ModalBottomSheet(
                    onDismissRequest = { showAccountSheet = false },
                    sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                    containerColor = MaterialTheme.colorScheme.surface
                ) {
                    Column(
                        Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text("选择账户", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 4.dp))
                        Spacer(Modifier.height(4.dp))
                        // 与资产账户页一致：按类型分组显示（现金/储蓄卡/信用卡/电子支付/金融账户/数字货币/其他）
                        val grouped = ACCOUNT_TYPE_ORDER.mapNotNull { t ->
                            val list = state.accounts.filter { it.type == t }
                            if (list.isEmpty()) null else t to list
                        }
                        val known = ACCOUNT_TYPE_ORDER.toSet()
                        val other = state.accounts.filter { it.type !in known }
                        val allGroups = grouped + if (other.isNotEmpty()) listOf("other" to other) else emptyList()
                        allGroups.forEach { (type, list) ->
                            Text(
                                "${accountTypeLabel(type)}（${list.size}）",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp)
                            )
                            list.forEach { acc ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable { accountId = acc.id; showAccountSheet = false }
                                        .padding(vertical = 12.dp, horizontal = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(acc.icon ?: "💰", fontSize = 22.sp, modifier = Modifier.padding(end = 12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Text(acc.name, style = MaterialTheme.typography.bodyLarge)
                                        Text("余额 ${formatMoney(acc.balance)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (accountId == acc.id) Icon(Icons.Filled.Check, contentDescription = null, tint = Brown500)
                                }
                                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                            }
                        }
                    }
                }
            }

            // —— 日期选择 ——
            if (showDatePicker) {
                val dateState = rememberDatePickerState(initialSelectedDateMillis = dateToMillis(date))
                DatePickerDialog(
                    onDismissRequest = { showDatePicker = false },
                    confirmButton = {
                        TextButton(onClick = {
                            dateState.selectedDateMillis?.let { date = millisToDateStr(it, date) }
                            showDatePicker = false
                        }) { Text("确定") }
                    },
                    dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("取消") } }
                ) {
                    DatePicker(state = dateState)
                }
            }

            // —— 时间选择（到秒）——
            if (showTimePicker) {
                val parts = date.split(" ").getOrNull(1)?.split(":") ?: listOf("0", "0", "0")
                val tpState = rememberTimePickerState(
                    initialHour = parts.getOrNull(0)?.toIntOrNull() ?: 0,
                    initialMinute = parts.getOrNull(1)?.toIntOrNull() ?: 0,
                    is24Hour = true
                )
                var seconds by remember { mutableStateOf(parts.getOrNull(2)?.toIntOrNull() ?: 0) }
                AlertDialog(
                    onDismissRequest = { showTimePicker = false },
                    title = { Text("选择时间（到秒）") },
                    text = {
                        Column {
                            TimePicker(state = tpState)
                            Spacer(Modifier.height(12.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("秒：", style = MaterialTheme.typography.bodyLarge)
                                listOf(0, 15, 30, 45).forEach { s ->
                                    val on = seconds == s
                                    Row(
                                        Modifier
                                            .padding(end = 8.dp)
                                            .clip(RoundedCornerShape(50))
                                            .background(if (on) Brown500 else Brown50)
                                            .clickable { seconds = s }
                                            .padding(horizontal = 12.dp, vertical = 6.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text("%02d".format(s), color = if (on) Color.White else MaterialTheme.colorScheme.onSurface,
                                            style = MaterialTheme.typography.labelMedium)
                                    }
                                }
                            }
                        }
                    },
                    confirmButton = {
                        TextButton(onClick = {
                            val datePart = date.split(" ").getOrNull(0) ?: todayDateTime().split(" ").first()
                            date = "%s %02d:%02d:%02d".format(datePart, tpState.hour, tpState.minute, seconds)
                            showTimePicker = false
                        }) { Text("确定") }
                    },
                    dismissButton = { TextButton(onClick = { showTimePicker = false }) { Text("取消") } }
                )
            }

            // —— 账本选择 ——
            if (showBookSheet) {
                ModalBottomSheet(
                    onDismissRequest = { showBookSheet = false },
                    sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
                    containerColor = MaterialTheme.colorScheme.surface
                ) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
                        Text("选择账本", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 4.dp))
                        Spacer(Modifier.height(4.dp))
                        books.forEach { book ->
                            Row(
                                Modifier.fillMaxWidth()
                                    .clickable {
                                        selectedBookId = book.id
                                        showBookSheet = false
                                        scope.launch { AppContainer.switchBook(book.id) }
                                    }
                                    .padding(vertical = 12.dp, horizontal = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(book.icon.ifBlank { "📒" }, fontSize = 22.sp, modifier = Modifier.padding(end = 12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(book.name, style = MaterialTheme.typography.bodyLarge)
                                    if (book.isDefault) Text("默认账本", style = MaterialTheme.typography.labelSmall, color = Brown500)
                                }
                                if (selectedBookId == book.id) Icon(Icons.Filled.Check, contentDescription = null, tint = Brown500)
                            }
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
                        }
                    }
                }
            }

            // —— 地点输入 ——
            if (showLocationDialog) {
                AlertDialog(
                    onDismissRequest = { showLocationDialog = false },
                    title = { Text("地点") },
                    text = {
                        Column {
                            OutlinedTextField(
                                value = locationDraft,
                                onValueChange = { locationDraft = it },
                                singleLine = true,
                                placeholder = { Text("输入地点（如：合肥、公司）") },
                                modifier = Modifier.fillMaxWidth()
                            )
                            Spacer(Modifier.height(8.dp))
                            OutlinedButton(
                                onClick = {
                                    val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                                        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                                    if (hasPermission) {
                                        isLocating = true
                                        scope.launch {
                                            val addr = getCurrentLocation(context)
                                            if (addr != null) locationDraft = addr
                                            isLocating = false
                                            if (addr == null) snackbar.showSnackbar("无法获取定位，请检查GPS是否开启")
                                        }
                                    } else {
                                        locationPermissionLauncher.launch(arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        ))
                                    }
                                },
                                enabled = !isLocating,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Icon(Icons.Filled.LocationOn, contentDescription = null, modifier = Modifier.size(16.dp), tint = Brown500)
                                Spacer(Modifier.width(6.dp))
                                Text(if (isLocating) "定位中…" else "获取设备定位")
                            }
                        }
                    },
                    confirmButton = { TextButton(onClick = { location = locationDraft.trim(); showLocationDialog = false }) { Text("保存") } },
                    dismissButton = {
                        Row {
                            if (location.isNotBlank()) {
                                TextButton(onClick = { location = ""; locationDraft = ""; showLocationDialog = false }) { Text("清除", color = MaterialTheme.colorScheme.error) }
                            }
                            TextButton(onClick = { showLocationDialog = false }) { Text("取消") }
                        }
                    }
                )
            }

            // —— 备注编辑 ——
            if (showNoteDialog) {
                AlertDialog(
                    onDismissRequest = { showNoteDialog = false },
                    title = { Text("备注") },
                    text = {
                        OutlinedTextField(
                            value = noteDraft,
                            onValueChange = { noteDraft = it },
                            singleLine = false,
                            maxLines = 3,
                            placeholder = { Text("最多30个字符") },
                            modifier = Modifier.fillMaxWidth()
                        )
                    },
                    confirmButton = { TextButton(onClick = { note = noteDraft.take(30); showNoteDialog = false }) { Text("保存") } },
                    dismissButton = { TextButton(onClick = { showNoteDialog = false }) { Text("取消") } }
                )
            }
        }
    }
}

/* ============================================================
 * 私有组件
 * ============================================================ */

/** 顶栏：返回 + 支出/收入 2 段 tab（截图风格，标题居中） */
@Composable
private fun TopBarSegmented(current: String, onBack: () -> Unit, onChange: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .statusBarsPadding()
            .height(56.dp)
            .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
        }
        // 支出 / 收入 段控件
        Row(
            Modifier
                .weight(1f)
                .padding(horizontal = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            listOf("expense" to "支出", "income" to "收入").forEach { (key, label) ->
                val on = current == key
                Column(
                    Modifier
                        .clickable { onChange(key) }
                        .padding(horizontal = 18.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        label,
                        style = MaterialTheme.typography.titleMedium,
                        color = if (on) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = if (on) FontWeight.Bold else FontWeight.Medium
                    )
                    Spacer(Modifier.height(2.dp))
                    if (on) {
                        Box(
                            Modifier
                                .height(2.dp)
                                .width(28.dp)
                                .background(MaterialTheme.colorScheme.onSurface, RoundedCornerShape(1.dp))
                        )
                    }
                }
            }
        }
        Spacer(Modifier.width(48.dp)) // 与左侧 IconButton 视觉对齐
    }
}

/* 快捷记账卡片已删除 */

/**
 * 2) 分类 卡片：一级 + 二级合并到同一 Card 内。
 *  - 顶部标题 + 收起/展开（控制整个一级卡的整体折叠）
 *  - 一级 5 列网格；点一级：选中 + 如有子级则在卡片内追加该一级的二级网格
 *  - 点同一已展开一级 → 折叠二级；点其他一级 → 切换展开到新的一级
 *  - 二级选中不改变展开状态
 */
@Composable
private fun CategorySection(
    categories: List<com.xinwallet.app.data.model.Category>,
    selectedId: Int?,
    collapsed: Boolean,
    onToggleCollapsed: () -> Unit,
    onSelect: (Int) -> Unit
) {
    val oneLevel = remember(categories) { categories.filter { it.parentId == null } }
    val childrenMap = remember(categories) {
        categories.filter { it.parentId != null }.groupBy { it.parentId!! }
    }
    var expandedId by remember { mutableStateOf<Int?>(null) }

    Surface(
        Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp),
        shape = RoundedCornerShape(14.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 10.dp)) {
            // 顶部：标题 + 收起/展开
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp)) {
                Text("一级标签：", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                Surface(
                    shape = RoundedCornerShape(50),
                    color = Brown50,
                    modifier = Modifier.clickable(onClick = onToggleCollapsed)
                ) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(if (collapsed) "展开" else "收起", style = MaterialTheme.typography.labelMedium, color = Brown500)
                        Spacer(Modifier.width(2.dp))
                        Icon(
                            if (collapsed) Icons.Filled.KeyboardArrowDown else Icons.Filled.KeyboardArrowUp,
                            contentDescription = null,
                            tint = Brown500,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
            if (oneLevel.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text("暂无分类", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                return@Column
            }
            // 一级标签网格
            if (collapsed) {
                Row(Modifier.fillMaxWidth()) {
                    oneLevel.take(5).forEach { cat ->
                        CategoryCell(
                            cat = cat,
                            selected = selectedId == cat.id,
                            onClick = {
                                onSelect(cat.id)
                                val kids = childrenMap[cat.id].orEmpty()
                                expandedId = when {
                                    kids.isEmpty() -> null
                                    expandedId == cat.id -> null
                                    else -> cat.id
                                }
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                    if (oneLevel.size < 5) repeat(5 - oneLevel.size) { Spacer(Modifier.weight(1f)) }
                }
                return@Column
            }
            Column {
                val rows = oneLevel.chunked(5)
                rows.forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        row.forEach { cat ->
                            CategoryCell(
                                cat = cat,
                                selected = selectedId == cat.id || (childrenMap[cat.id].orEmpty().any { it.id == selectedId }),
                                onClick = {
                                    onSelect(cat.id)
                                    val kids = childrenMap[cat.id].orEmpty()
                                    expandedId = when {
                                        kids.isEmpty() -> null
                                        expandedId == cat.id -> null
                                        else -> cat.id
                                    }
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (row.size < 5) repeat(5 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
            // 二级展开区：在同一卡片内追加（不跳出卡片边界）
            val expandedCat = oneLevel.firstOrNull { it.id == expandedId }
            val children = expandedCat?.let { childrenMap[it.id].orEmpty() }.orEmpty()
            if (expandedCat != null && children.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f))
                Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text("${expandedCat.name} 二级标签：", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(6.dp))
                Column {
                    children.chunked(5).forEach { row ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            row.forEach { cat ->
                                CategoryCell(
                                    cat = cat,
                                    selected = selectedId == cat.id,
                                    onClick = { onSelect(cat.id) },
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            if (row.size < 5) repeat(5 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
}

/** 分类 cell：选中实心棕 + 白字；未选中浅棕背景 */
@Composable
private fun CategoryCell(
    cat: com.xinwallet.app.data.model.Category,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bg = if (selected) Brown500 else Brown50
    val fg = if (selected) Color.White else MaterialTheme.colorScheme.onSurface
    Column(
        modifier = modifier.clickable(onClick = onClick).padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(bg),
            contentAlignment = Alignment.Center
        ) {
            Text(cat.icon?.takeIf { it.isNotBlank() } ?: "📌", fontSize = 22.sp, color = fg)
        }
        Spacer(Modifier.height(2.dp))
        Text(
            cat.name,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

/** 3) 上下文 chips 行：账本 / 账户 / 日期 / 时间 / 不关联 / 收起 ✓ */
@Composable
private fun ContextChipsRow(
    date: String,
    accountName: String,
    bookName: String,
    notReimbursable: Boolean,
    onToggleNotReimbursable: () -> Unit,
    onPickAccount: () -> Unit,
    onPickBook: () -> Unit,
    onPickDate: () -> Unit,
    onPickTime: () -> Unit,
    onCollapse: () -> Unit
) {
    val scroll = rememberScrollState()
    val dateLabel = remember(date) { date.split(" ").getOrNull(0)?.let { "今天" } ?: "今天" }
    val timeLabel = remember(date) {
        val t = date.split(" ").getOrNull(1)?.take(8) ?: "00:00:00"
        t
    }
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(scroll)
            .padding(horizontal = 14.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        QuickChip(icon = Icons.Filled.MenuBook, label = bookName, onClick = onPickBook)
        QuickChip(icon = Icons.Filled.AccountBox, label = accountName, onClick = onPickAccount)
        QuickChip(icon = Icons.Filled.CalendarToday, label = dateLabel, onClick = onPickDate)
        QuickChip(icon = Icons.Filled.Schedule, label = timeLabel, onClick = onPickTime)
        QuickChip(
            icon = Icons.Filled.LinkOff,
            label = if (notReimbursable) "不关联 ✓" else "不关联",
            active = notReimbursable,
            onClick = onToggleNotReimbursable
        )
        // 收起 按钮
        Row(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(50))
                .clickable(onClick = onCollapse)
                .padding(horizontal = 12.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("收起", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.width(2.dp))
            Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** 4) 位置 chip 行（地点可点击编辑） */
@Composable
private fun LocationChipRow(
    location: String,
    onPickLocation: () -> Unit
) {
    val scroll = rememberScrollState()
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(scroll)
            .padding(horizontal = 14.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        QuickChip(
            icon = Icons.Filled.LocationOn,
            label = if (location.isBlank()) "添加地点" else location,
            onClick = onPickLocation,
            tintIcon = Brown500
        )
    }
}

@Composable
private fun QuickChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean = false,
    onClick: (() -> Unit)? = null,
    tintIcon: Color? = null
) {
    val mod = if (onClick != null) Modifier.clickable { onClick() } else Modifier
    val bg = if (active) Brown500 else Brown50
    val border = if (active) Brown500 else Brown100
    val fg = if (active) Color.White else MaterialTheme.colorScheme.onSurface
    val iconColor = when {
        active -> Color.White
        tintIcon != null -> tintIcon
        else -> Brown500
    }
    Row(
        modifier = mod
            .clip(RoundedCornerShape(50))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(14.dp), tint = iconColor)
        Spacer(Modifier.width(4.dp))
        Text(label, style = MaterialTheme.typography.labelMedium, color = fg)
    }
}

/** 5) ¥0.00 + 备注占位（截图：金额大字 + 占位备注） */
@Composable
private fun AmountBlock(
    amount: String,
    note: String,
    onAmountChange: (String) -> Unit,
    onNoteChange: (String) -> Unit,
    onEditNote: () -> Unit = {}
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(
                "¥",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(end = 6.dp, bottom = 8.dp)
            )
            Text(
                if (amount.isBlank()) "0.00" else amount,
                style = MaterialTheme.typography.displayMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        Spacer(Modifier.height(2.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                if (note.isBlank()) "点击填写备注(最多30个字符)" else note,
                style = MaterialTheme.typography.bodyMedium,
                color = if (note.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).clickable { onEditNote() }
            )
            if (note.isNotBlank()) {
                Spacer(Modifier.width(8.dp))
                Text("✕", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.clickable { onNoteChange("") })
            }
        }
    }
}

/** 6) 选择记账心情：5 个 chips，截图风格（红心 emoji + 文字） */
@Composable
private fun MoodSection(selected: String?, onSelect: (String) -> Unit) {
    val scroll = rememberScrollState()
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(scroll)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 标题（截图：🧡 选择记账心情）
        Row(
            Modifier
                .clip(RoundedCornerShape(50))
                .background(Brown50)
                .border(1.dp, Brown100, RoundedCornerShape(50))
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("🧡", fontSize = 12.sp)
            Spacer(Modifier.width(4.dp))
            Text("选择记账心情", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface)
        }
        MOODS.forEach { m ->
            val on = selected == m.label
            Row(
                Modifier
                    .clip(RoundedCornerShape(50))
                    .background(if (on) Brown500 else Brown50)
                    .border(1.dp, if (on) Brown500 else Brown100, RoundedCornerShape(50))
                    .clickable { onSelect(if (on) "" else m.label) }
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(m.emoji, fontSize = 12.sp)
                Spacer(Modifier.width(4.dp))
                Text(m.label, style = MaterialTheme.typography.labelMedium, color = if (on) Color.White else MaterialTheme.colorScheme.onSurface)
            }
        }
    }
}

/** 7) 4×5 自定义键盘（截图布局） */
@Composable
private fun NewKeypad(
    value: String,
    onValueChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onSubmitAndNew: () -> Unit
) {
    fun append(ch: String) {
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
    fun backspace() { if (value.isNotEmpty()) onValueChange(value.dropLast(1)) }
    fun clear() = onValueChange("")

    Column(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp)) {
        val rows = listOf(
            listOf("+" to { append("+") }, "1" to { append("1") }, "2" to { append("2") }, "3" to { append("3") }, "⌫" to { backspace() }),
            listOf("-" to { append("-") }, "4" to { append("4") }, "5" to { append("5") }, "6" to { append("6") }, "清空" to { clear() }),
            listOf("×" to { append("*") }, "7" to { append("7") }, "8" to { append("8") }, "9" to { append("9") }, "." to { append(".") }),
            listOf("/" to { append("/") }, "(" to { append("(") }, "0" to { append("0") }, ")" to { append(")") }, "确定" to { onSubmit() })
        )
        rows.forEachIndexed { idx, row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { (label, action) ->
                    val isPrimary = label == "确定"
                    val isAction = label in setOf("⌫", "清空", "+", "-", "×", "/")
                    val isOperator = label in setOf("+", "-", "×", "/", "(", ")")
                    KeypadCell(
                        label = label,
                        onClick = action,
                        modifier = Modifier.weight(1f),
                        isPrimary = isPrimary,
                        isAction = isAction,
                        isOperator = isOperator
                    )
                }
            }
            if (idx != rows.lastIndex) Spacer(Modifier.height(6.dp))
        }
        Spacer(Modifier.height(2.dp))
    }
}

@Composable
private fun KeypadCell(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isPrimary: Boolean = false,
    isAction: Boolean = false,
    isOperator: Boolean = false
) {
    val bg = when {
        isPrimary -> Brown500
        isAction -> MaterialTheme.colorScheme.surfaceVariant
        isOperator -> Brown100
        else -> MaterialTheme.colorScheme.surface
    }
    val fg = if (isPrimary) Color.White else MaterialTheme.colorScheme.onSurface
    Box(
        modifier = modifier
            .height(50.dp)
            .clip(RoundedCornerShape(if (isPrimary) 12.dp else 10.dp))
            .background(bg)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        when (label) {
            "⌫" -> Icon(Icons.Filled.Backspace, contentDescription = "退格", tint = fg)
            else -> Text(
                label,
                style = MaterialTheme.typography.titleMedium,
                color = fg,
                fontWeight = if (isPrimary || isAction || isOperator) FontWeight.SemiBold else FontWeight.Medium
            )
        }
    }
}

internal fun trimAmount(value: Double): String {
    val s = java.math.BigDecimal(value).setScale(2, java.math.RoundingMode.HALF_UP).toPlainString()
    return s.trimEnd('0').trimEnd('.').ifEmpty { "0" }
}

/** 将 "2026-08-15 10:16:00" 或 "2026-08-15" 转为 epoch millis（UTC 当天 00:00） */
internal fun dateToMillis(dateStr: String): Long {
    return try {
        val parts = dateStr.trim().split(" ")
        val datePart = parts[0]
        val (y, m, d) = datePart.split("-").map { it.toInt() }
        val cal = Calendar.getInstance()
        cal.clear()
        cal.set(y, m - 1, d)
        cal.timeInMillis
    } catch (_: Exception) { System.currentTimeMillis() }
}

/** 将 DatePicker 选中的 millis 转回 "yyyy-MM-dd HH:mm:ss"（保留原时间部分） */
internal fun millisToDateStr(millis: Long, originalDate: String): String {
    return try {
        val cal = Calendar.getInstance()
        cal.timeInMillis = millis
        val y = cal.get(Calendar.YEAR)
        val m = cal.get(Calendar.MONTH) + 1
        val d = cal.get(Calendar.DAY_OF_MONTH)
        val timePart = originalDate.trim().split(" ").getOrNull(1)?.take(8) ?: "00:00:00"
        "%04d-%02d-%02d %s".format(y, m, d, timePart)
    } catch (_: Exception) { originalDate }
}