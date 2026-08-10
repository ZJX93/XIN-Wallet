package com.xinwallet.app.ui.screens

import android.Manifest
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import com.xinwallet.app.data.model.ChatMessage
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.viewmodel.ChatViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory
import com.xinwallet.app.util.formatMoney
import com.xinwallet.app.util.prepareImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun ChatScreen(navController: NavHostController) {
    val context = LocalContext.current
    val app = context.applicationContext as android.app.Application
    val vm: ChatViewModel = viewModel(factory = viewModelFactory { ChatViewModel(app, AppContainer.aiRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    // 云端录音需要 RECORD_AUDIO 权限
    val recordPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) vm.startCloudVoice() else vm.onInputChange(vm.state.value.input)
    }

    fun consume(uri: Uri?) {
        if (uri == null) return
        scope.launch {
            val prepared = kotlinx.coroutines.withContext(Dispatchers.IO) { prepareImage(context, uri) }
            if (prepared == null) snackbar.showSnackbar("图片读取失败，请换一张试试")
            else vm.sendImage(Base64.encodeToString(prepared.bytes, Base64.NO_WRAP), "image/jpeg")
        }
    }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { consume(it) }
    val takePhoto = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) consume(cameraUri) }

    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.clearError() } }
    LaunchedEffect(state.toast) { state.toast?.let { snackbar.showSnackbar(it); vm.clearToast() } }

    val listState = rememberLazyListState()
    LaunchedEffect(state.messages.size, state.thinking) {
        if (state.messages.isNotEmpty() || state.thinking) {
            val target = if (state.thinking) state.messages.size else state.messages.size - 1
            if (target >= 0) listState.animateScrollToItem(target)
        }
    }

    Scaffold(
        topBar = { TopBar("AI 对话记账") },
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            ChatInputBar(
                input = state.input,
                onInput = { vm.onInputChange(it) },
                voiceActive = state.voiceMode != null,
                onVoice = {
                    when (state.voiceMode) {
                        null -> if (vm.speechAvailable) vm.startVoice { vm.onInputChange(it) }
                        else recordPerm.launch(Manifest.permission.RECORD_AUDIO)
                        "device" -> vm.stopVoice()
                        "cloud" -> vm.stopCloudVoice()
                    }
                },
                onImage = {
                    try {
                        val dir = File(context.cacheDir, "images").apply { mkdirs() }
                        val file = File(dir, "chat_${System.currentTimeMillis()}.jpg")
                        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                        cameraUri = uri
                        takePhoto.launch(uri)
                    } catch (e: Exception) {
                        pickImage.launch("image/*")
                    }
                },
                onSend = { vm.sendText() },
                sending = state.sending
            )
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            if (state.messages.isEmpty() && !state.thinking) {
                Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                    Text(
                        "用文字、语音或截图告诉 AI 帮你记账，例如：\n· 早餐花了 12 块，微信支付\n· 这个月餐饮一共多少\n· [截图] 帮我记这笔",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(state.messages.size) { index ->
                        val msg = state.messages[index]
                        ChatBubble(msg)
                    }
                    if (state.thinking) {
                        item { ThinkingBubble() }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatBubble(msg: ChatMessage) {
    val isUser = msg.role == "user"
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
        // 用户发的截图缩略图
        if (isUser && msg.imageBase64 != null) {
            val bytes = Base64.decode(msg.imageBase64, Base64.NO_WRAP)
            val bmp = remember(msg.imageBase64) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                modifier = Modifier.padding(bottom = 4.dp)
            ) {
                bmp?.let {
                    androidx.compose.foundation.Image(
                        bitmap = it, contentDescription = "截图",
                        modifier = Modifier.width(180.dp).padding(6.dp)
                    )
                } ?: Text("📷 截图", Modifier.padding(10.dp))
            }
        }
        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
            ),
            modifier = Modifier.fillMaxWidth(0.82f)
        ) {
            Column(Modifier.padding(12.dp)) {
                if (msg.content.isNotBlank()) {
                    Text(
                        msg.content,
                        color = if (isUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                // 助手消息里已建交易确认卡
                msg.transactions.forEach { tx ->
                    val sign = if (tx.type == "income") "+" else "-"
                    val label = when (tx.type) {
                        "income" -> "收入"
                        "transfer" -> "转账"
                        else -> "支出"
                    }
                    Card(
                        Modifier.fillMaxWidth().padding(top = 8.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
                    ) {
                        Column(Modifier.padding(10.dp)) {
                            Text("已记一笔 · $label", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium)
                            Text(
                                "${sign}${formatMoney(tx.amount)}",
                                style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            val sub = listOfNotNull(tx.categoryName, tx.accountName, tx.date).joinToString(" · ")
                            if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ThinkingBubble() {
    Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
        CircularProgressIndicator(Modifier.width(18.dp), strokeWidth = 2.dp)
        Text(" AI 思考中…", Modifier.padding(start = 8.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ChatInputBar(
    input: String,
    onInput: (String) -> Unit,
    voiceActive: Boolean,
    onVoice: () -> Unit,
    onImage: () -> Unit,
    onSend: () -> Unit,
    sending: Boolean
) {
    Column(Modifier.fillMaxWidth().padding(8.dp)) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Bottom,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            IconButton(onClick = onImage) {
                Icon(Icons.Filled.PhotoLibrary, "截图")
            }
            OutlinedTextField(
                value = input,
                onValueChange = onInput,
                placeholder = { Text("说点什么，或发张截图…") },
                modifier = Modifier.weight(1f),
                maxLines = 4,
                singleLine = false
            )
            IconButton(onClick = onVoice, enabled = !sending) {
                Icon(if (voiceActive) Icons.Filled.Stop else Icons.Filled.Mic, if (voiceActive) "停止" else "语音")
            }
            IconButton(onClick = onSend, enabled = input.isNotBlank() && !sending) {
                Icon(Icons.Filled.Send, "发送")
            }
        }
    }
}
