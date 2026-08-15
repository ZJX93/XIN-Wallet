package com.xinwallet.app.util

import java.security.MessageDigest

/** SHA-256 哈希工具：把 PIN 转 hex 字符串（不存明文） */
object HashUtil {
    fun sha256(input: String): String {
        val bytes = MessageDigest.getInstance("SHA-256").digest(input.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }
}