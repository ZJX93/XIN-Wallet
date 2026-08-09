package com.xinwallet.app.util

import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

fun formatMoney(value: Double): String {
    val df = DecimalFormat("#,##0.00")
    return "¥" + df.format(value)
}

fun formatMoneySigned(value: Double): String {
    val sign = if (value >= 0) "+" else "-"
    return sign + formatMoney(kotlin.math.abs(value))
}

fun currentMonth(): String {
    val c = Calendar.getInstance()
    return String.format("%04d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)
}

fun todayDateTime(): String {
    return SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.CHINA).format(Date())
}

fun todayDate(): String {
    return SimpleDateFormat("yyyy-MM-dd", Locale.CHINA).format(Date())
}
