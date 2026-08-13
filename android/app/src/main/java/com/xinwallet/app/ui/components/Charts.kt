package com.xinwallet.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown500
import com.xinwallet.app.ui.theme.Brown50
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
 * 单条趋势折线图（统计页按维度切换：支出线 / 收入线 / 结余累计线）。
 * 自动标出峰值点（series 中最大值）并高亮，其余与 [TrendLineChart] 视觉一致。
 *
 * @param values 单系列数值（按日顺序）。
 * @param color  线条颜色（支出=绿、收入=红、结余=品牌棕）。
 * @param peakIndex 需要高亮的点下标（如峰值日）；为 null 时不额外高亮。
 */
@Composable
fun TrendLineChartSingle(
    values: List<Double>,
    color: Color,
    modifier: Modifier = Modifier,
    peakIndex: Int? = null
) {
    val maxV = (values.maxOrNull() ?: 1.0).let { if (it <= 0) 1.0 else it }
    Canvas(modifier.fillMaxWidth().height(170.dp)) {
        val w = size.width
        val h = size.height
        val n = maxOf(values.size, 1)
        val pad = 18.dp.toPx()
        val usableH = h - pad * 2
        val xAt: (Int) -> Float = { i -> if (n == 1) w / 2f else (i.toFloat() / (n - 1)) * w }
        val yAt: (Double) -> Float = { v -> h - pad - (v / maxV).toFloat() * usableH }

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
        values.forEachIndexed { i, v ->
            val isPeak = i == peakIndex
            drawCircle(color, if (isPeak) 6.dp.toPx() else 4.dp.toPx(), Offset(xAt(i), yAt(v)))
        }
    }
}

/**
 * 分类占比饼图：左侧 Canvas 自绘扇形，右侧图例（色块 + 图标名称 + 百分比 + 金额）。
 *
 * 分类多时只画前 6 个，剩下的合并成「其他」，否则扇区太碎、图例也放不下。
 *
 * @param onSliceClick 点击图例/扇区回调；ReportsScreen 用它实现「点击一级分类进入二级明细」。
 */
@Composable
fun CategoryPie(
    items: List<ReportCategorySlice>,
    modifier: Modifier = Modifier,
    onSliceClick: ((ReportCategorySlice) -> Unit)? = null
) {
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
                    Modifier.fillMaxWidth()
                        .padding(vertical = 3.dp)
                        .clickable(enabled = onSliceClick != null) { onSliceClick?.invoke(slice.source) },
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

private data class PieSlice(
    val icon: String,
    val name: String,
    val total: Double,
    val source: ReportCategorySlice
)

private fun toPieSlices(items: List<ReportCategorySlice>, maxSlices: Int = 7): List<PieSlice> {
    val positive = items.filter { it.total > 0 }.sortedByDescending { it.total }
    if (positive.size <= maxSlices) {
        return positive.map { PieSlice(it.icon ?: "📌", it.name, it.total, it) }
    }
    val head = positive.take(maxSlices - 1).map { PieSlice(it.icon ?: "📌", it.name, it.total, it) }
    val rest = positive.drop(maxSlices - 1).sumOf { it.total }
    return head + PieSlice("🗂", "其他", rest, ReportCategorySlice(name = "其他", icon = "🗂"))
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

/** 分类占比配色（暖棕品牌族，与 Web tokens 一致；红=收入、绿=支出、琥珀=告警、蓝=信息） */
private val SLICE_PALETTE = listOf(
    Color(0xFF995F2C),  // accent-500 主品牌（暖棕）
    Color(0xFFD39562),  // accent-300
    Color(0xFFB58300),  // warning-500 琥珀
    Color(0xFFC11435),  // error-500 红（收入语义）
    Color(0xFF009558),  // success-500 绿（支出语义）
    Color(0xFF61370D),  // accent-700 深棕
    Color(0xFF6A9BC7),  // info-500 蓝（来自 Web chart.js）
    Color(0xFF8C6A4A),  // 中性棕
    Color(0xFFED324B),  // error-400 亮红
    Color(0xFF00B870)   // success-400 亮绿
)

/**
 * 环形图（中央可叠加文本），用于"分类排行"卡片中的占比可视化。
 * 单系列数据，按数值从大到小上色：主色始终给最大项，其余用调色板降序分配。
 *
 * @param data (标签, 数值) 列表，data 为空时不绘制并返回 EmptyState。
 * @param centerTitle 中心第一行文本（如"工资"）。
 * @param centerAmount 中心第二行金额（如"¥ 50.00"），为空则不显示金额行。
 */
@Composable
fun DonutChart(
    data: List<Pair<String, Double>>,
    modifier: Modifier = Modifier,
    centerTitle: String? = null,
    centerAmount: String? = null
) {
    val positive = data.filter { it.second > 0 }.sortedByDescending { it.second }
    if (positive.isEmpty()) {
        EmptyState("该周期暂无数据")
        return
    }
    val total = positive.sumOf { it.second }.coerceAtLeast(0.0001)
    val track = MaterialTheme.colorScheme.surfaceVariant
    val ring = Brown500

    Column(
        modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(160.dp)) {
            Canvas(Modifier.size(160.dp)) {
                val stroke = 18.dp.toPx()
                val r = (size.minDimension - stroke) / 2f
                val c = Offset(size.width / 2, size.height / 2)
                drawCircle(track, style = Stroke(stroke), radius = r, center = c)
                var start = -90f
                positive.forEachIndexed { idx, (_, v) ->
                    val sweep = (v / total * 360.0).toFloat()
                    val color = when (idx) {
                        0 -> ring
                        else -> SLICE_PALETTE[idx % SLICE_PALETTE.size]
                    }
                    drawArc(
                        color = color,
                        startAngle = start, sweepAngle = sweep, useCenter = false,
                        style = Stroke(stroke),
                        topLeft = Offset(c.x - r, c.y - r),
                        size = Size(r * 2, r * 2)
                    )
                    start += sweep
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                centerTitle?.let {
                    Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(2.dp))
                }
                centerAmount?.let {
                    Text(it, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
            }
        }
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
