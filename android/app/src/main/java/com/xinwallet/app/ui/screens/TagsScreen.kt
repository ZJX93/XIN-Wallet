package com.xinwallet.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import com.xinwallet.app.data.model.Tag
import com.xinwallet.app.di.AppContainer
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.LoadingBox
import com.xinwallet.app.ui.components.TopBar
import com.xinwallet.app.ui.viewmodel.TagsViewModel
import com.xinwallet.app.ui.viewmodel.viewModelFactory

/** 预设标签色板（与报表分类配色协调） */
private val TAG_COLORS = listOf(
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"
)

@Composable
fun TagsScreen(navController: NavHostController) {
    val vm: TagsViewModel = viewModel(factory = viewModelFactory { TagsViewModel(AppContainer.tagRepository) })
    val state by vm.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) { vm.load() }
    LaunchedEffect(state.toast) { state.toast?.let { snackbar.showSnackbar(it); vm.consumeToast() } }
    LaunchedEffect(state.error) { state.error?.let { snackbar.showSnackbar(it); vm.consumeError() } }

    Scaffold(
        topBar = { TopBar("标签", onBack = { navController.popBackStack() }) },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            FloatingActionButton(onClick = { vm.openNew() }) { Icon(Icons.Filled.Add, "新建标签") }
        }
    ) { padding ->
        when {
            state.loading && state.tags.isEmpty() -> LoadingBox()
            state.tags.isEmpty() -> EmptyState("还没有标签，点右下角 + 新建一个")
            else -> LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(state.tags) { tag ->
                    TagRow(tag, onEdit = { vm.openEdit(tag) }, onDelete = { vm.delete(tag) })
                }
            }
        }
    }

    state.editing?.let { editing ->
        TagEditDialog(
            editing = editing,
            submitting = state.submitting,
            onDismiss = { vm.closeDialog() },
            onSave = { name, color, icon -> vm.save(name, color, icon) }
        )
    }
}

@Composable
private fun TagRow(tag: Tag, onEdit: () -> Unit, onDelete: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val c = runCatching { Color(android.graphics.Color.parseColor(tag.color)) }
            .getOrDefault(MaterialTheme.colorScheme.primary)
        Surface(shape = CircleShape, color = c, modifier = Modifier.size(36.dp)) {
            Box(contentAlignment = Alignment.Center) {
                Text(tag.icon.ifBlank { "🏷️" }, color = Color.White, fontSize = 18.sp)
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(tag.name.ifBlank { "未命名标签" }, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        IconButton(onClick = onEdit) { Icon(Icons.Filled.Edit, "编辑") }
        IconButton(onClick = onDelete) { Icon(Icons.Filled.Delete, "删除") }
    }
}

@Composable
private fun TagEditDialog(
    editing: Tag,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSave: (String, String, String) -> Unit
) {
    var name by remember(editing.id) { mutableStateOf(editing.name) }
    var color by remember(editing.id) { mutableStateOf(editing.color) }
    var icon by remember(editing.id) { mutableStateOf(editing.icon) }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { onSave(name, color, icon) }, enabled = !submitting) { Text("保存") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !submitting) { Text("取消") }
        },
        title = { Text(if (editing.id == 0) "新建标签" else "编辑标签") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("名称") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = icon,
                    onValueChange = { icon = it },
                    label = { Text("图标（一个 emoji）") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                Text("颜色", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TAG_COLORS.forEach { hex ->
                        val col = Color(android.graphics.Color.parseColor(hex))
                        val selected = color.equals(hex, ignoreCase = true)
                        Box(
                            Modifier.size(32.dp).clip(CircleShape).background(col)
                                .then(if (selected) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape) else Modifier)
                                .clickable { color = hex }
                        )
                    }
                }
            }
        }
    )
}
