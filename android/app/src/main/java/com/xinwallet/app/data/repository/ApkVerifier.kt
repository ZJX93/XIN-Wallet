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
 * 注意：EXPECTED_CERT_SHA256 当前等于仓库内 debug.keystore 的证书（与已发布的 v0.0.0 APK 一致），
 * 因此现有安装包可通过校验。这仅「形式正确」——debug 密钥密码公开，任何人可用同一把钥匙签名。
 * ★ 正式发布前必须把下方常量替换为你「私有发布密钥」的 SHA-256（见 android/generate_release_key.sh），
 *   否则证书固定无法真正防伪造。
 */
object ApkVerifier {
    // 当前为仓库 debug.keystore 证书指纹（hex，无冒号）。发布前务必替换为私有发布密钥指纹！
    private const val EXPECTED_CERT_SHA256 =
        "7bc67f537413cc601e5903d2939704c56536e03a51048cc1777fc414da8949f0"

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
