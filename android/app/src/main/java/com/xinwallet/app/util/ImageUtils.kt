package com.xinwallet.app.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.graphics.Matrix
import android.net.Uri
import java.io.ByteArrayOutputStream

/**
 * 账单图片预处理结果：压缩后的 JPEG 字节（直接上传）+ 预览用位图。
 */
data class PreparedImage(
    val bytes: ByteArray,
    val preview: Bitmap
) {
    override fun equals(other: Any?) = this === other
    override fun hashCode() = System.identityHashCode(this)
}

/**
 * 把相册/相机拿到的图片压到适合上传的尺寸。
 *
 * 后端 multer 限制 5MB，而 OCR 对超大图并无收益，所以统一：
 * 1. 用 inSampleSize 二次采样，长边不超过 maxDim（默认 1920，保留小票文字细节）
 * 2. 按 EXIF 旋转摆正，否则横拍的小票识别率明显下降
 * 3. JPEG 质量递减压缩，直到小于 4MB
 */
fun prepareImage(context: Context, uri: Uri, maxDim: Int = 1920): PreparedImage? {
    return try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val longest = maxOf(bounds.outWidth, bounds.outHeight)
        if (longest <= 0) return null

        var sample = 1
        while (longest / sample > maxDim) sample *= 2

        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        var bitmap = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, opts)
        } ?: return null

        bitmap = applyExifRotation(context, uri, bitmap)

        var quality = 90
        var bytes: ByteArray
        while (true) {
            val out = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)
            bytes = out.toByteArray()
            if (bytes.size <= 4 * 1024 * 1024 || quality <= 50) break
            quality -= 15
        }
        PreparedImage(bytes, bitmap)
    } catch (_: Exception) {
        null
    } catch (_: OutOfMemoryError) {
        null
    }
}

private fun applyExifRotation(context: Context, uri: Uri, bitmap: Bitmap): Bitmap {
    return try {
        val degrees = context.contentResolver.openInputStream(uri)?.use { input ->
            when (ExifInterface(input).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } ?: 0f
        if (degrees == 0f) bitmap
        else Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, Matrix().apply { postRotate(degrees) }, true)
    } catch (_: Exception) {
        bitmap
    }
}
