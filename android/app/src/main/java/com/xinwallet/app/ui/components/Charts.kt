package com.xinwallet.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
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

/**
 * 分类占比饼图：左侧 Canvas 自绘扇形，右侧图例（色块 + 图标名称 + 百分比 + 金额）。
 *
 * 分类多时只画前 6 个，剩下的合并成「其他」，否则扇区太碎、图例也放不下。
 */
@Composable
fun CategoryPie(items: List<ReportCategorySlice>, modifier: Modifier = Modifier) {
    val slices = remember(items) { toPieSlices(items) }
    if (slices.isEmpty()) {
        EmptyState("该周期暂无数据")
        return
    }
    val total = slices.sumOf { it.total }.coerceAtLeast(0.0001)
    // 扇区之间用卡片底色描一条细线，避免相邻色块糊在一起
    val gapColor = MaterialTheme.colorScheme.surface

    Row(
        modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Canvas(Modifier.size(132.dp)) {
            val d = size.minDimension
            val topLeft = Offset((size.width - d) / 2f, (size.height - d) / 2f)
            val arcSize = Size(d, d)

            var start = -90f
            slices.forEachIndexed { idx, slice ->
                val sweep = (slice.total / total * 360.0).toFloat()
                drawArc(SLICE_PALETTE[idx % SLICE_PALETTE.size], start, sweep, true, topLeft, arcSize)
                start += sweep
            }
            start = -90f
            slices.forEach { slice ->
                val sweep = (slice.total / total * 360.0).toFloat()
                drawArc(gapColor, start, sweep, true, topLeft, arcSize, style = Stroke(width = 2.dp.toPx()))
                start += sweep
            }
        }

        Spacer(Modifier.width(12.dp))

        Column(Modifier.weight(1f)) {
            slices.forEachIndexed { idx, slice ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        Modifier.size(10.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(SLICE_PALETTE[idx % SLICE_PALETTE.size])
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "${slice.icon} ${slice.name}",
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(Modifier.width(6.dp))
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            pctLabel(slice.total / total),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        Text(
                            formatMoney(slice.total),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

private data class PieSlice(val icon: String, val name: String, val total: Double)

private fun toPieSlices(items: List<ReportCategorySlice>, maxSlices: Int = 7): List<PieSlice> {
    val positive = items.filter { it.total > 0 }.sortedByDescending { it.total }
    if (positive.size <= maxSlices) {
        return positive.map { PieSlice(it.icon ?: "📌", it.name, it.total) }
    }
    val head = positive.take(maxSlices - 1).map { PieSlice(it.icon ?: "📌", it.name, it.total) }
    val rest = positive.drop(maxSlices - 1).sumOf { it.total }
    return head + PieSlice("🗂", "其他", rest)
}

/** 占比文案：≥10% 取整，小占比保留一位小数，避免一堆 0% */
private fun pctLabel(ratio: Double): String {
    val pct = ratio * 100
    return if (pct >= 10) "${pct.toInt()}%" else String.format(java.util.Locale.CHINA, "%.1f%%", pct)
}

/** 分类占比：横向条形 + 颜色 + 金额/百分比。保留给需要精细对比的场景。 */
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
