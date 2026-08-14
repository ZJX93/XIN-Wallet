package com.xinwallet.app.data.repository

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.xinwallet.app.BuildConfig
import java.io.File
import java.security.MessageDigest

/**
 * 应用内升级的 APK 完整性校验（在调起系统安装器之前执行）。
 *
 * 两道防线：
 * 1. 证书固定（Certificate Pinning）—— 比对下载 APK 的签名证书 SHA-256 是否等于我们发布用的证书。
 *    只有用「同一把私钥」签名的 APK 才能通过；任何被替换 / 中间人篡改的包都伪造不出同证书，会被拒绝。
 * 2. 版本只升不降 —— 拒绝比当前已装版本更低或相等的「降级安装」，规避降级攻击。
 *
 * 注意：EXPECTED_CERT_SHA256 当前等于仓库内固定 debug.keystore 的证书（自提交 0b1cc86 起稳定，
 * v0.0.1 起重发版及之后所有 CI 构建的 APK 均用同一把钥匙签名，可跨版本覆盖安装）。
 * 该 keystore 密码公开，仅作「可侧载升级」之证书固定占位——形式正确即可防「中途替换的包」，
 * 但无法防「持有同一把公开钥匙签的伪造包」。
 * ★ 正式发布前应换私有发布密钥并同步替换此常量；更换时必须与 android-build.yml
 *   「签名指纹钉死」校验的期望值保持一致，否则 CI 会拦截构建、且已装用户 App 内升级会被本校验拒绝。
 */
object ApkVerifier {
    // 当前为仓库内固定 debug.keystore 的证书指纹（hex，无冒号），与 CI 发布的所有版本
    // （v0.0.1 起重发版及之后）同源。该 keystore 自提交 0b1cc86 起固定不变，CI 默认回退使用
    // （未配置 KEYSTORE_PATH secret）。若未来更换签名密钥，必须同步更新此常量，否则已装用户
    // App 内升级时会被本校验拒绝；同时需与 android-build.yml「签名指纹钉死」校验保持一致。
    private const val EXPECTED_CERT_SHA256 =
        "5f717babca23523dd831228aa5f155cf6315bd6f5b5c7c049ec47d9786504f1d"

    data class ApkVerifyResult(val ok: Boolean, val reason: String?)

    fun verifyApk(context: Context, file: File): ApkVerifyResult {
        if (!file.exists() || !file.canRead()) {
            return ApkVerifyResult(false, "安装包文件不存在或不可读")
        }
        val pm = context.packageManager
        @Suppress("DEPRECATION")
        val flags = PackageManager.GET_SIGNING_CERTIFICATES or
                PackageManager.GET_SIGNATURES or PackageManager.GET_ACTIVITIES
        val info = pm.getPackageArchiveInfo(file.absolutePath, flags)
            ?: return ApkVerifyResult(false, "无法解析 APK（可能已损坏）")

        // 1) 证书校验
        val sig = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.signingInfo?.apkContentsSigners?.firstOrNull()
        } else {
            @Suppress("DEPRECATION") info.signatures?.firstOrNull()
        } ?: return ApkVerifyResult(false, "APK 无签名信息")

        val digest = MessageDigest.getInstance("SHA-256").digest(sig.toByteArray())
        val hex = digest.joinToString("") { "%02x".format(it) }
        if (!hex.equals(EXPECTED_CERT_SHA256, ignoreCase = true)) {
            return ApkVerifyResult(false, "签名证书不匹配，疑似安装包被篡改，已拒绝安装")
        }

        // 2) 版本只升不降
        val apkVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode
        } else {
            @Suppress("DEPRECATION") info.versionCode.toLong()
        }
        if (apkVersionCode <= BuildConfig.VERSION_CODE) {
            return ApkVerifyResult(false, "拒绝降级安装：新包版本不高于当前版本")
        }

        return ApkVerifyResult(true, null)
    }
}
