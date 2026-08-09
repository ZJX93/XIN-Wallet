package com.xinwallet.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xinwallet.app.data.model.ReportCategorySlice
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.LinearProgress
import com.xinwallet.app.ui.theme.ExpenseColor
import com.xinwallet.app.ui.theme.ExpenseColorDark
import com.xinwallet.app.ui.theme.IncomeColor
import com.xinwallet.app.ui.theme.IncomeColorDark
import com.xinwallet.app.ui.theme.LocalIsDark
import com.xinwallet.app.util.formatMoney

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

/** 分类占比：横向条形 + 颜色 + 金额/百分比。用于报表页的支出/收入构成。 */
@Composable
fun CategoryBars(items: List<ReportCategorySlice>, modifier: Modifier = Modifier) {
    if (items.isEmpty()) {
        EmptyState("该周期暂无数据")
        return
    }
    val total = items.sumOf { it.total }.coerceAtLeast(0.0001)
    Column(modifier.fillMaxWidth()) {
        items.forEachIndexed { idx, it ->
            val pct = (it.total / total * 100)
            val color = SLICE_PALETTE[idx % SLICE_PALETTE.size]
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 7.dp)
            ) {
                Text(
                    it.icon ?: "📌",
                    fontSize = 18.sp,
                    modifier = Modifier.width(30.dp)
                )
                Column(Modifier.weight(1f).padding(start = 4.dp)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(it.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                        Text(
                            "${formatMoney(it.total)} · ${pct.toInt()}%",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Box(Modifier.padding(top = 5.dp)) {
                        LinearProgress(
                            (pct / 100f).toFloat(),
                            color,
                            Modifier.fillMaxWidth().height(8.dp)
                                .clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                        )
                    }
                }
            }
        }
    }
}

/** 分类占比配色（暖色系，契合 App 主题） */
private val SLICE_PALETTE = listOf(
    Color(0xFFC0794E), Color(0xFF7FA37F), Color(0xFF6B8CAE), Color(0xFFB08968),
    Color(0xFF9C7BA6), Color(0xFFC9A14A), Color(0xFF5FA08A), Color(0xFFBE7B7B),
    Color(0xFF7E8BB0), Color(0xFFA8A15C)
)

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
