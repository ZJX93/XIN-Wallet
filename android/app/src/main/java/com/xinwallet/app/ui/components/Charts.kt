package com.xinwallet.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.xinwallet.app.data.model.ReportCategorySlice
import com.xinwallet.app.ui.components.EmptyState
import com.xinwallet.app.ui.components.LinearProgress
import kotlin.math.roundToInt
import kotlin.math.atan2
import kotlin.math.sqrt
import com.xinwallet.app.ui.theme.Brown100
import com.xinwallet.app.ui.theme.Brown300
import com.xinwallet.app.ui.theme.Brown50
import com.xinwallet.app.util.formatMoney

/**
 * 单条趋势折线图（统计页按维度切换：支出线 / 收入线 / 结余累计线）。
 * 自动标出峰值点（series 中最大值）并高亮。
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
    peakIndex: Int? = null,
    onTapIndex: ((Int) -> Unit)? = null
) {
    val maxV = (values.maxOrNull() ?: 1.0).let { if (it <= 0) 1.0 else it }
    Canvas(
        modifier
            .fillMaxWidth()
            .height(170.dp)
            .pointerInput(values.size, onTapIndex) {
                if (onTapIndex != null) {
                    detectTapGestures { offset ->
                        val w = size.width.toFloat()
                        val n = values.size
                        if (n > 0 && w > 0f) {
                            val idx = if (n == 1) 0
                                      else ((offset.x / w) * (n - 1)).roundToInt().coerceIn(0, n - 1)
                            onTapIndex(idx)
                        }
                    }
                }
            }
    ) {
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

/** 分类占比配色：莫兰迪低饱和色系（灰调柔和，适合饼图/条形多分类并列） */
private val SLICE_PALETTE = listOf(
    Color(0xFFB5A89B),  // 暖灰棕
    Color(0xFFA3B0A2),  // 鼠尾草绿
    Color(0xFFC2B2C0),  // 雾紫
    Color(0xFF9FB1B8),  // 雾霾蓝
    Color(0xFFD2C3B3),  // 沙色
    Color(0xFFB6A6B0),  // 藕荷粉
    Color(0xFFA9BCC2),  // 灰蓝
    Color(0xFFC9B79C),  // 陶土
    Color(0xFFA7B7A0),  // 苔绿
    Color(0xFFC4A8A0)   // 灰粉
)

/**
 * 环形图（中央可叠加文本），用于"分类排行"卡片中的占比可视化。
 * 单系列数据，按数值从大到小上色，使用莫兰迪低饱和配色。
 *
 * @param data (标签, 数值) 列表，data 为空时不绘制并返回 EmptyState。
 * @param centerTitle 中心第一行文本（如"工资"）。
 * @param centerAmount 中心第二行金额（如"¥ 50.00"），为空则不显示金额行。
 * @param selectedLabel 当前选中分类名；非空时该色块向外"爆炸"放大，并从色块引一根直线到离它最近的画布角落，
 *  角落处固定显示名称与百分比（与色块同色），文字下方画一条同色横线。
 */
@Composable
fun DonutChart(
    data: List<Pair<String, Double>>,
    modifier: Modifier = Modifier,
    centerTitle: String? = null,
    centerAmount: String? = null,
    selectedLabel: String? = null,
    onSliceClick: ((String) -> Unit)? = null
) {
    // 稳定化：data 仅在周期切换时变化；用 remember 固定 identity，
    // 避免每次点击选中都重建 pointerInput 手势检测器，导致点击丢失/卡顿。
    val positive = remember(data) { data.filter { it.second > 0 }.sortedByDescending { it.second } }
    if (positive.isEmpty()) {
        EmptyState("该周期暂无数据")
        return
    }
    val total = positive.sumOf { it.second }.coerceAtLeast(0.0001)
    val track = MaterialTheme.colorScheme.surfaceVariant
    // 选中项在 positive 中的索引（选中色块放大 + 角落标签）
    val selIdx = if (selectedLabel != null) positive.indexOfFirst { it.first == selectedLabel }.let { if (it >= 0) it else null } else null

    // 预计算各色块角度（Composable 与 Canvas 共用）
    val sliceGeo = remember(positive) {
        val list = mutableListOf<Pair<Float, Float>>()
        var start = -90f
        positive.forEach { (_, v) ->
            val sweep = (v / total * 360.0).toFloat()
            list.add(start to sweep)
            start += sweep
        }
        list
    }

    // 选中色块的中心方向（用于选最近角落 + 引线）
    val selDir = selIdx?.let { i ->
        val (s, sweep) = sliceGeo[i]
        val mid = Math.toRadians((s + sweep / 2).toDouble())
        Offset(kotlin.math.cos(mid).toFloat(), kotlin.math.sin(mid).toFloat())
    }
    val selColor = selIdx?.let { SLICE_PALETTE[it % SLICE_PALETTE.size] }
    val selText = selIdx?.let { i ->
        val pct = positive[i].second / total * 100
        "${positive[i].first}  ${"%.1f".format(pct)}%"
    }
    // 标注固定在离色块最近的角落；cornerPos = 角落锚点(dp)，align = 文字对齐方向
    val corner = selDir?.let { nearestCorner(it) }

    Column(
        modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(CANVAS_SIZE.dp)) {
            Canvas(
                Modifier
                    .size(CANVAS_SIZE.dp)
                    .pointerInput(positive) {
                        if (onSliceClick != null) {
                            detectTapGestures { offset ->
                                val cx: Float = size.width / 2f
                                val cy: Float = size.height / 2f
                                val dx: Float = offset.x - cx
                                val dy: Float = offset.y - cy
                                val strokePx: Float = DONUT_STROKE.dp.toPx()
                                val donutPx: Float = DONUT_DIAMETER.dp.toPx()
                                val r: Float = (donutPx - strokePx) / 2f
                                val dist: Float = sqrt(dx * dx + dy * dy)
                                if (dist >= r - strokePx / 2f && dist <= r + strokePx / 2f) {
                                    var a = Math.toDegrees(atan2(dy.toDouble(), dx.toDouble())).toFloat()
                                    if (a < -90f) a += 360f
                                    var acc = -90f
                                    var hitIdx = -1
                                    for (idx in positive.indices) {
                                        val sweep = (positive[idx].second / total * 360.0).toFloat()
                                        if (a >= acc && a < acc + sweep) {
                                            hitIdx = idx
                                            break
                                        }
                                        acc += sweep
                                    }
                                    if (hitIdx >= 0) onSliceClick(positive[hitIdx].first)
                                }
                            }
                        }
                    }
            ) {
                val stroke = DONUT_STROKE.dp.toPx()
                val donut = DONUT_DIAMETER.dp.toPx()
                val r = (donut - stroke) / 2f
                val c = Offset(size.width / 2, size.height / 2)
                val tl = Offset(c.x - r, c.y - r)
                drawCircle(track, style = Stroke(stroke), radius = r, center = c)

                val explode = 10.dp.toPx()
                positive.forEachIndexed { idx, (_, v) ->
                    val (s, sweep) = sliceGeo[idx]
                    val color = SLICE_PALETTE[idx % SLICE_PALETTE.size]
                    val mid = Math.toRadians((s + sweep / 2).toDouble())
                    val dir = Offset(kotlin.math.cos(mid).toFloat(), kotlin.math.sin(mid).toFloat())
                    val t = tl + dir * (if (selIdx == idx) explode else 0f)
                    drawArc(color, s, sweep, useCenter = false, style = Stroke(stroke), topLeft = t, size = Size(r * 2, r * 2))
                }

                // 引线：色块外端点 → 最近角落（向文字方向回缩 36dp，确保不穿过文字）
                if (selIdx != null && selDir != null && corner != null && selColor != null) {
                    val pBlock = c + selDir * (r + stroke / 2f + explode)
                    val f = size.width / CANVAS_SIZE
                    val rawAnchor = Offset(corner.anchorX * f, corner.anchorY * f)
                    // 从锚点向圆心方向回缩 36dp，让线停在文字前方
                    val toCenter = (c - rawAnchor).let { v ->
                        val len = sqrt(v.x * v.x + v.y * v.y).coerceAtLeast(1f)
                        Offset(v.x / len, v.y / len)
                    }
                    val lineEnd = rawAnchor + toCenter * 36.dp.toPx()
                    drawLine(selColor, pBlock, lineEnd, strokeWidth = 1.5f.dp.toPx())
                    drawCircle(selColor, radius = 3.dp.toPx(), center = pBlock)
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
            // 固定角落标签（名称 + 百分比，与色块同色），仅保留连接线，不再画下划线
            Box(Modifier.fillMaxSize()) {
                if (selText != null && corner != null && selColor != null) {
                    Box(
                        Modifier.fillMaxSize().padding(CALLOUT_MARGIN.dp),
                        contentAlignment = corner.align
                    ) {
                        Text(
                            selText, color = selColor, fontWeight = FontWeight.Bold,
                            fontSize = 14.sp, maxLines = 1,
                            overflow = TextOverflow.Visible,
                            modifier = Modifier.wrapContentSize(unbounded = true)
                        )
                    }
                }
            }
        }
    }
}

// ──── 固定角落标注几何 ────

/** 容器尺寸(dp)，给四角标签留足空间 */
private const val CANVAS_SIZE = 280
/** 标注边距(dp) */
private const val CALLOUT_MARGIN = 12f

private data class CornerLabel(
    /** 标签块在容器中的对齐角 */
    val align: Alignment,
    /** 标签内部水平对齐（左/右） */
    val hAlign: Alignment.Horizontal,
    /** 引线终点 / 横线靠角落外端(dp) */
    val anchorX: Float,
    val anchorY: Float
)

/**
 * 根据色块方向向量选出同一象限的最近画布角落（标签放在色块所在的那一侧，引线直接向外，不斜穿整图）。
 * anchor 取该角横线的外端，作为引线终点。
 */
private fun nearestCorner(dir: Offset): CornerLabel {
    val S = CANVAS_SIZE
    val M = CALLOUT_MARGIN
    return when {
        dir.x >= 0f && dir.y >= 0f -> // 右下块 → 右下角
            CornerLabel(
                align = Alignment.BottomEnd, hAlign = Alignment.End,
                anchorX = S - M, anchorY = S - M
            )
        dir.x >= 0f && dir.y < 0f ->  // 右上块 → 右上角
            CornerLabel(
                align = Alignment.TopEnd, hAlign = Alignment.End,
                anchorX = S - M, anchorY = M
            )
        dir.x < 0f && dir.y >= 0f ->   // 左下块 → 左下角
            CornerLabel(
                align = Alignment.BottomStart, hAlign = Alignment.Start,
                anchorX = M, anchorY = S - M
            )
        else ->                        // 左上块 → 左上角
            CornerLabel(
                align = Alignment.TopStart, hAlign = Alignment.Start,
                anchorX = M, anchorY = M
            )
    }
}

/** 环形图参数：直径与描边（描边为原 18dp 的两倍 = 36dp，环更粗） */
private const val DONUT_DIAMETER = 160
private const val DONUT_STROKE = 36

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
