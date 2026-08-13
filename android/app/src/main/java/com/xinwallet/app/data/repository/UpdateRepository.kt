package com.xinwallet.app.data.repository

import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

/**
 * 应用内升级：
 * 1. 查询 GitHub 最新的安卓 Release（tag 形如 android-vX.Y.Z 或 vX.Y.Z，附带 .apk 资产）。
 * 2. 按字节流式下载 APK 并回传进度（0..100）。
 *
 * 注意：GitHub 公开 API 未鉴权限速 60 次/小时/IP，对个人使用足够；调用方（ViewModel）
 * 应控制检查频率（进页自动查一次 + 手动刷新）。
 */
data class ReleaseInfo(
    val tag: String,
    val version: String,
    val apkUrl: String
)

class UpdateRepository(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .build()
) {

    /** 扫描最近的 Release，返回第一个 tag 为 android-vX.Y.Z 或 vX.Y.Z 且含 .apk 资产的版本 */
    suspend fun latestAndroidRelease(): ReleaseInfo = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url("https://api.github.com/repos/ZJX93/XinWallet/releases?per_page=30")
            .header("Accept", "application/vnd.github+json")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw Exception("GitHub API 返回 ${resp.code}")
            val arr = JsonParser.parseString(resp.body?.string().orEmpty()).asJsonArray
            for (el in arr) {
                val obj = el.asJsonObject
                val tag = obj.get("tag_name")?.asString ?: continue
                val version = when {
                    tag.startsWith("android-v") -> tag.removePrefix("android-v")
                    tag.startsWith("v") -> tag.removePrefix("v")
                    else -> continue
                }
                if (!version.matches(Regex("""\d+(\.\d+)*"""))) continue
                val assets = obj.getAsJsonArray("assets")
                val apk = assets.firstOrNull { a ->
                    a.asJsonObject.get("name")?.asString?.endsWith(".apk") == true
                } ?: continue
                val url = apk.asJsonObject.get("browser_download_url")?.asString ?: continue
                return@withContext ReleaseInfo(tag, version, url)
            }
            throw Exception("未找到安卓 Release")
        }
    }

    /** 仅允许从信任的来源以 HTTPS 下载更新包，防止下载链接被篡改 / 指向恶意站点 */
    private val TRUSTED_APK_HOSTS = setOf("github.com", "mirror.ghproxy.com", "ghproxy.net")
    private fun assertTrustedApkUrl(url: String) {
        val u = java.net.URI(url)
        if (u.scheme != "https") throw SecurityException("仅允许 HTTPS 下载更新包")
        if (u.host == null || u.host !in TRUSTED_APK_HOSTS) {
            throw SecurityException("更新包来源不在信任列表：${u.host}")
        }
        if (!u.path.contains("ZJX93/XinWallet")) {
            throw SecurityException("更新包路径不在本仓库目录下")
        }
    }

    /** 下载 APK 到 dest，回调进度 0..100 */
    suspend fun downloadApk(url: String, dest: File, onProgress: (Int) -> Unit) = withContext(Dispatchers.IO) {
        assertTrustedApkUrl(url)
        val req = Request.Builder().url(url)
            .header("User-Agent", "XinWallet-Android")
            .build()
        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) throw Exception("下载失败 ${resp.code}")
            val total = resp.body?.contentLength() ?: -1L
            val input = resp.body?.byteStream() ?: throw Exception("空响应")
            dest.parentFile?.mkdirs()
            FileOutputStream(dest).use { out ->
                val buf = ByteArray(8192)
                var downloaded = 0L
                var read: Int
                while (input.read(buf).also { read = it } != -1) {
                    out.write(buf, 0, read)
                    downloaded += read
                    if (total > 0) onProgress(((downloaded * 100) / total).toInt())
                }
                out.flush()
            }
            onProgress(100)
        }
    }
}
