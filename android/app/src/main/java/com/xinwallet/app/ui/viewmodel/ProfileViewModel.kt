package com.xinwallet.app.ui.viewmodel

import android.content.Context
import android.os.Environment
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.model.UpdateProfileRequest
import com.xinwallet.app.data.repository.AuthRepository
import com.xinwallet.app.data.repository.UpdateRepository
import com.xinwallet.app.di.AppContainer
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ProfileUiState(
    val themeMode: String = "system",
    val baseUrl: String = "",
    val username: String = "",
    val nickname: String = "",
    val avatar: String? = null,
    val memberDays: Int = 0,
    val editing: Boolean = false,
    val message: String? = null
)

/** 应用内升级状态机 */
data class UpdateUiState(
    val checking: Boolean = false,
    val currentVersion: String = "",
    val latestVersion: String = "",
    val apkUrl: String = "",
    val hasUpdate: Boolean = false,
    val error: String? = null,
    val downloading: Boolean = false,
    val progress: Int = 0,
    val localApkPath: String? = null
)

private fun isPlaceholderUrl(url: String): Boolean =
    url.isBlank() || url.contains("127.0.0.1") || url.contains("localhost")

class ProfileViewModel(
    private val session: SessionManager,
    private val authRepo: AuthRepository,
    private val updateRepo: UpdateRepository = UpdateRepository()
) : ViewModel() {

    private val _state = MutableStateFlow(ProfileUiState())
    val state: StateFlow<ProfileUiState> = _state

    private val _updateState = MutableStateFlow(UpdateUiState())
    val updateState: StateFlow<UpdateUiState> = _updateState

    init {
        viewModelScope.launch {
            _state.value = ProfileUiState(
                themeMode = session.themeMode(),
                baseUrl = session.baseUrl().takeUnless(::isPlaceholderUrl) ?: "",
                username = session.username(),
                nickname = session.nickname(),
                memberDays = session.memberDays()
            )
            // 从服务端拉取最新资料（用户名/昵称/头像），覆盖本地缓存
            when (val r = authRepo.profile()) {
                is com.xinwallet.app.data.remote.ApiResult.Success -> {
                    val u = r.data?.user
                    _state.value = _state.value.copy(
                        username = u?.username?.takeIf { it.isNotBlank() } ?: _state.value.username,
                        nickname = u?.nickname ?: _state.value.nickname,
                        avatar = u?.avatar
                    )
                }
                else -> Unit
            }
        }
    }

    fun setTheme(mode: String) {
        viewModelScope.launch {
            session.saveTheme(mode)
            _state.value = _state.value.copy(themeMode = mode)
        }
    }

    fun saveServer(url: String) {
        viewModelScope.launch {
            val fixed = AppContainer.normalizeBaseUrl(url)
            if (fixed.isBlank()) {
                _state.value = _state.value.copy(message = "服务器地址不能为空")
                return@launch
            }
            session.saveBaseUrl(fixed)
            AppContainer.setBaseUrl(fixed)
            _state.value = _state.value.copy(baseUrl = fixed, message = "服务器地址已保存")
        }
    }

    fun clearMessage() {
        _state.value = _state.value.copy(message = null)
    }

    /** 提交资料修改（头像 / 用户名 / 昵称 / 改密）。 */
    fun submitProfile(avatar: String?, username: String?, nickname: String?, oldPwd: String?, newPwd: String?) {
        viewModelScope.launch {
            _state.value = _state.value.copy(editing = true, message = null)
            val req = UpdateProfileRequest(
                avatar = avatar?.takeIf { it.isNotBlank() },
                username = username?.takeIf { it.isNotBlank() },
                nickname = nickname?.takeIf { it.isNotBlank() },
                oldPassword = oldPwd?.takeIf { it.isNotBlank() },
                newPassword = newPwd?.takeIf { it.isNotBlank() }
            )
            when (val r = authRepo.updateProfile(req)) {
                is com.xinwallet.app.data.remote.ApiResult.Success -> {
                    val u = r.data?.user
                    _state.value = _state.value.copy(
                        editing = false,
                        username = u?.username ?: _state.value.username,
                        nickname = u?.nickname ?: _state.value.nickname,
                        avatar = u?.avatar ?: _state.value.avatar,
                        message = if (oldPwd.isNullOrBlank() && newPwd.isNullOrBlank()) "资料已更新" else "密码已更新"
                    )
                }
                is com.xinwallet.app.data.remote.ApiResult.Error -> {
                    _state.value = _state.value.copy(editing = false, message = r.message)
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch { authRepo.logout() }
    }

    // ---------- 应用内升级 ----------

    fun checkUpdate(currentVersion: String) {
        val s = _updateState.value
        if (s.checking || s.downloading) return
        viewModelScope.launch {
            _updateState.value = s.copy(checking = true, error = null, currentVersion = currentVersion)
            try {
                val rel = updateRepo.latestAndroidRelease()
                val newer = isVersionNewer(rel.version, currentVersion)
                _updateState.value = _updateState.value.copy(
                    checking = false,
                    latestVersion = rel.version,
                    apkUrl = rel.apkUrl,
                    hasUpdate = newer
                )
            } catch (e: Exception) {
                _updateState.value = _updateState.value.copy(checking = false, error = e.message ?: "检查更新失败")
            }
        }
    }

    fun downloadUpdate(context: Context) {
        val s = _updateState.value
        val url = s.apkUrl
        if (url.isBlank() || s.downloading) return
        viewModelScope.launch {
            val dir = context.applicationContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                ?: run {
                    _updateState.value = s.copy(error = "无法访问本机存储")
                    return@launch
                }
            val dest = File(dir, "xinwallet_update.apk")
            _updateState.value = s.copy(downloading = true, progress = 0, error = null, localApkPath = null)
            // 主域名（github.com 302 到 release-assets.githubusercontent.com）不通时，回退到公共镜像加速器
            val candidates = buildList {
                add(url)
                if (!url.contains("ghproxy", ignoreCase = true)) {
                    add("https://ghproxy.net/$url")
                    add("https://mirror.ghproxy.com/$url")
                }
            }
            var lastErr: String? = null
            var ok = false
            for (cand in candidates) {
                try {
                    updateRepo.downloadApk(cand, dest) { p ->
                        _updateState.value = _updateState.value.copy(progress = p)
                    }
                    ok = true
                    break
                } catch (e: Exception) {
                    lastErr = e.message ?: "下载失败"
                }
            }
            if (ok) {
                _updateState.value = _updateState.value.copy(downloading = false, localApkPath = dest.absolutePath, error = null)
            } else {
                _updateState.value = _updateState.value.copy(
                    downloading = false,
                    localApkPath = null,
                    error = "下载失败：$lastErr\n可能是手机网络访问 GitHub 下载服务器不稳定。可点下方“复制链接”在手机浏览器中打开下载，或开启网络代理后重试。"
                )
            }
        }
    }

    fun consumeUpdateError() {
        _updateState.value = _updateState.value.copy(error = null)
    }

    /** 语义化版本比较：latest 是否比 current 新（X.Y.Z 数值逐段比较） */
    private fun isVersionNewer(latest: String, current: String): Boolean {
        val parse: (String) -> List<Int> = { v -> v.split('.').map { it.toIntOrNull() ?: 0 } }
        val l = parse(latest)
        val c = parse(current)
        val n = maxOf(l.size, c.size)
        for (i in 0 until n) {
            val a = l.getOrElse(i) { 0 }
            val b = c.getOrElse(i) { 0 }
            if (a != b) return a > b
        }
        return false
    }
}
