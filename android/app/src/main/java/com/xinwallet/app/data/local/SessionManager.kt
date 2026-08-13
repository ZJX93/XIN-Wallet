package com.xinwallet.app.data.local

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "xin_wallet_session")

/**
 * 用 DataStore 持久化：访问令牌、刷新令牌、NAS API 基地址、主题模式、用户名。
 */
class SessionManager(private val context: Context) {

    companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val BASE_URL = stringPreferencesKey("base_url")
        val THEME_MODE = stringPreferencesKey("theme_mode") // system / light / dark
        val USERNAME = stringPreferencesKey("username")
        // 首次启动时间戳（毫秒）。为空时会在首次访问时回写今天 0 点，从而稳定计算「陪伴天数」。
        val FIRST_LAUNCH_AT = longPreferencesKey("first_launch_at")
    }

    suspend fun saveTokens(access: String, refresh: String) {
        // 后端 refresh 可能不返回新 refreshToken；空串时不要覆盖本地已有的，避免会话失效
        context.dataStore.edit {
            it[ACCESS_TOKEN] = access
            if (refresh.isNotBlank()) it[REFRESH_TOKEN] = refresh
        }
    }

    suspend fun saveBaseUrl(url: String) {
        context.dataStore.edit { it[BASE_URL] = url }
    }

    suspend fun saveTheme(mode: String) {
        context.dataStore.edit { it[THEME_MODE] = mode }
    }

    suspend fun saveUsername(name: String) {
        context.dataStore.edit { it[USERNAME] = name }
    }

    suspend fun clearSession() {
        context.dataStore.edit {
            it.remove(ACCESS_TOKEN)
            it.remove(REFRESH_TOKEN)
            it.remove(USERNAME)
        }
    }

    suspend fun accessToken(): String = context.dataStore.data.first()[ACCESS_TOKEN] ?: ""
    suspend fun refreshToken(): String? = context.dataStore.data.first()[REFRESH_TOKEN]
    suspend fun baseUrl(): String = context.dataStore.data.first()[BASE_URL] ?: ""
    suspend fun themeMode(): String = context.dataStore.data.first()[THEME_MODE] ?: "system"
    suspend fun username(): String = context.dataStore.data.first()[USERNAME] ?: ""

    fun themeModeFlow(): Flow<String> = context.dataStore.data.map { it[THEME_MODE] ?: "system" }
    fun baseUrlFlow(): Flow<String> = context.dataStore.data.map { it[BASE_URL] ?: "" }

    /**
     * 获取「陪伴天数」：自首次启动起算到今天的天数（含今天）。
     * 首次访问时若无记录，则写入今天 0 点的时间戳，保证后续调用得到稳定值。
     */
    suspend fun memberDays(): Int {
        val prefs = context.dataStore.data.first()
        val firstAt = prefs[FIRST_LAUNCH_AT] ?: run {
            val today0 = startOfTodayMillis()
            context.dataStore.edit { it[FIRST_LAUNCH_AT] = today0 }
            return 1
        }
        val now = System.currentTimeMillis()
        val diffMs = (now - firstAt).coerceAtLeast(0)
        val days = TimeUnit.MILLISECONDS.toDays(diffMs).toInt() + 1
        return days.coerceAtLeast(1)
    }

    private fun startOfTodayMillis(): Long {
        val fmt = SimpleDateFormat("yyyy-MM-dd", Locale.CHINA)
        return runCatching { fmt.parse(fmt.format(Date()))?.time }.getOrNull() ?: System.currentTimeMillis()
    }
}
