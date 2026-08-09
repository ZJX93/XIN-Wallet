package com.xinwallet.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark

/** 近 N 月收支趋势折线图（Canvas 自绘，零依赖） */
@Composable
fun TrendLineChart(
    incomes: List<Double>,
    expenses: List<Double>,
    modifier: Modifier = Modifier
) {
    val dark = LocalIsDark.current
    val incomeColor = if (dark) IncomeColorDark else IncomeColor
    val expenseColor = if (dark) ExpenseColorDark else ExpenseColor
    val maxV = ((incomes + expenses).maxOrNull() ?: 1.0).let { if (it <= 0) 1.0 else it }

    Canvas(modifier.fillMaxWidth().height(170.dp)) {
        val w = size.width
        val h = size.height
        val n = maxOf(incomes.size, expenses.size, 1)
        val pad = 18.dp.toPx()
        val usableH = h - pad * 2
        val xAt: (Int) -> Float = { i -> if (n == 1) w / 2f else (i.toFloat() / (n - 1)) * w }
        val yAt: (Double) -> Float = { v -> h - pad - (v / maxV).toFloat() * usableH }

        fun drawSeries(values: List<Double>, color: Color) {
            if (values.isEmpty()) return
            val line = Path().apply {
                values.forEachIndexed { i, v -> if (i == 0) moveTo(xAt(i), yAt(v)) else lineTo(xAt(i), yAt(v)) }
            }
            val fill = Path().apply {
                moveTo(xAt(0), h - pad)
                values.forEachIndexed { i, v -> lineTo(xAt(i), yAt(v)) }
                lineTo(xAt(values.lastIndex), h - pad)
                close()
            }
            drawPath(fill, color.copy(alpha = 0.12f))
            drawPath(line, color, style = Stroke(width = 3.dp.toPx()))
            values.forEachIndexed { i, v -> drawCircle(color, 4.dp.toPx(), Offset(xAt(i), yAt(v))) }
        }

        drawSeries(expenses, expenseColor)
        drawSeries(incomes, incomeColor)
    }
}

/** 环形进度（预算/储蓄目标用） */
@Composable
fun DonutProgress(percent: Float, modifier: Modifier = Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    val track = MaterialTheme.colorScheme.surfaceVariant
    Canvas(modifier.size(64.dp)) {
        val stroke = 9.dp.toPx()
        val r = (size.minDimension - stroke) / 2f
        val c = Offset(size.width / 2, size.height / 2)
        drawCircle(track, style = Stroke(stroke), radius = r, center = c)
        val sweep = percent.coerceIn(0f, 1f) * 360f
        drawArc(
            color = color, startAngle = -90f, sweepAngle = sweep, useCenter = false,
            style = Stroke(stroke), topLeft = Offset(c.x - r, c.y - r), size = Size(r * 2, r * 2)
        )
    }
}
