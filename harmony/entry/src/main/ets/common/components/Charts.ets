/**
 * Canvas 图表组件（1:1 对齐安卓端 Charts.kt 的 DonutChart / TrendLineChartSingle / CategoryBars）。
 * - DonutChart：粗描边环形 + 选中色块向外"爆炸" + 最近角落引线标注 + 扇区点击命中。
 * - TrendChart：单系列折线 + 浅色填充 + 峰值点高亮 + 点击取点联动。
 * - SLICE_PALETTE：莫兰迪 10 色低饱和配色，供环图/趋势/条形共用。
 */
import { COLORS } from '../theme';

/** 分类占比配色：莫兰迪低饱和色系（对齐安卓 Charts.kt:SLICE_PALETTE） */
export const SLICE_PALETTE: string[] = [
  '#B5A89B', // 暖灰棕
  '#A3B0A2', // 鼠尾草绿
  '#C2B2C0', // 雾紫
  '#9FB1B8', // 雾霾蓝
  '#D2C3B3', // 沙色
  '#B6A6B0', // 藕荷粉
  '#A9BCC2', // 灰蓝
  '#C9B79C', // 陶土
  '#A7B7A0', // 苔绿
  '#C4A8A0'  // 灰粉
];

export interface DonutPiece {
  name: string;
  value: number;
  color?: string;
  icon?: string;
}

interface SelInfo {
  idx: number;
  color?: string;
  text?: string;
}

interface SliceGeo {
  s: number;
  sweep: number;
  mid: number;
}

/** 环形图（对齐安卓 DonutChart：描边环 + 选中爆炸 + 角落引线 + 扇区点击） */
@Component
export struct DonutChart {
  @Prop @Watch('redraw') data: DonutPiece[] = [];
  @Prop @Watch('redraw') selectedIndex: number = -1;
  @Prop centerTitle: string = '';
  @Prop centerValue: string = '';
  onSliceClick?: (index: number) => void;
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D();
  private ready: boolean = false;
  private readonly SIZE: number = 280;
  private readonly DIAMETER: number = 160;
  private readonly STROKE: number = 36;

  /** 仅取正数并按值降序（与安卓一致） */
  private positive(): DonutPiece[] {
    return this.data.filter((d) => (d.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0));
  }

  private total(): number {
    let s = 0;
    this.positive().forEach((d) => { s += (d.value || 0); });
    return s || 0.0001;
  }

  /** 选中信息（build 标注 + draw 引线共用） */
  private selInfo(): SelInfo {
    const pos = this.positive();
    if (pos.length === 0 || this.selectedIndex < 0 || this.selectedIndex >= pos.length) {
      return { idx: -1 };
    }
    const idx = this.selectedIndex;
    const tot = this.total();
    const color = pos[idx].color || SLICE_PALETTE[idx % SLICE_PALETTE.length];
    const pct = (pos[idx].value / tot) * 100;
    const text = `${pos[idx].name}  ${pct.toFixed(1)}%`;
    return { idx, color, text };
  }

  redraw(): void {
    if (this.ready) this.draw();
  }

  private handleTouch(e: TouchEvent): void {
    if (!this.onSliceClick) return;
    const ev: TouchObject | undefined = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!ev) return;
    const cx = this.SIZE / 2, cy = this.SIZE / 2;
    const dx = ev.x - cx, dy = ev.y - cy;
    const r = (this.DIAMETER - this.STROKE) / 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < r - this.STROKE / 2 || dist > r + this.STROKE / 2) return;
    let a = Math.atan2(dy, dx) * 180 / Math.PI;
    if (a < -90) a += 360;
    const pos = this.positive();
    const tot = this.total();
    let acc = -90;
    for (let i = 0; i < pos.length; i++) {
      const sweep = (pos[i].value / tot) * 360;
      if (a >= acc && a < acc + sweep) { this.onSliceClick!(i); return; }
      acc += sweep;
    }
  }

  draw(): void {
    const ctx = this.context;
    const S = this.SIZE;
    ctx.clearRect(0, 0, S, S);
    const pos = this.positive();
    if (pos.length === 0) return;
    const tot = this.total();
    const cx = S / 2, cy = S / 2;
    const r = (this.DIAMETER - this.STROKE) / 2;
    const c: SelInfo = this.selInfo();

    // 轨道整圆
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = this.STROKE;
    ctx.strokeStyle = COLORS.divider;
    ctx.stroke();

    const explode = 10;
    const geos: SliceGeo[] = [];
    let start = -Math.PI / 2;
    pos.forEach((d, i) => {
      const sweep = (d.value / tot) * Math.PI * 2;
      const mid = start + sweep / 2;
      geos.push({ s: start, sweep, mid });
      const isSel = i === c.idx;
      const ox = isSel ? Math.cos(mid) * explode : 0;
      const oy = isSel ? Math.sin(mid) * explode : 0;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, start, start + sweep);
      ctx.lineWidth = this.STROKE;
      ctx.strokeStyle = d.color || SLICE_PALETTE[i % SLICE_PALETTE.length];
      ctx.stroke();
      start += sweep;
    });

    // 细分隔线（卡片色描边，避免相邻色块糊在一起，对齐安卓 gapColor）
    start = -Math.PI / 2;
    pos.forEach((d, i) => {
      const sweep = (d.value / tot) * Math.PI * 2;
      const isSel = i === c.idx;
      const mid = start + sweep / 2;
      const ox = isSel ? Math.cos(mid) * explode : 0;
      const oy = isSel ? Math.sin(mid) * explode : 0;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, r, start, start + sweep);
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.card;
      ctx.stroke();
      start += sweep;
    });

    // 选中：引线 + 端点圆（对齐安卓 corner 引线）
    if (c.idx >= 0 && c.color) {
      const g = geos[c.idx];
      const dirx = Math.cos(g.mid), diry = Math.sin(g.mid);
      const pBlockX = cx + dirx * (r + this.STROKE / 2 + explode);
      const pBlockY = cy + diry * (r + this.STROKE / 2 + explode);
      const M = 12;
      const anchorX = dirx >= 0 ? S - M : M;
      const anchorY = diry >= 0 ? S - M : M;
      const toCx = cx - anchorX, toCy = cy - anchorY;
      const len = Math.sqrt(toCx * toCx + toCy * toCy) || 1;
      const lineEndX = anchorX + (toCx / len) * 36;
      const lineEndY = anchorY + (toCy / len) * 36;
      ctx.beginPath();
      ctx.moveTo(pBlockX, pBlockY);
      ctx.lineTo(lineEndX, lineEndY);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = c.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(pBlockX, pBlockY, 3, 0, Math.PI * 2);
      ctx.fillStyle = c.color;
      ctx.fill();
    }
  }

  private cornerAlign(): Alignment {
    const c = this.selInfo();
    if (c.idx < 0) return Alignment.Center;
    const pos = this.positive();
    const tot = this.total();
    let acc = -90;
    let mid = 0;
    for (let i = 0; i <= c.idx; i++) {
      const sweep = (pos[i].value / tot) * 360;
      mid = acc + sweep / 2;
      acc += sweep;
    }
    const rad = mid * Math.PI / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    if (dx >= 0 && dy >= 0) return Alignment.BottomEnd;
    if (dx >= 0 && dy < 0) return Alignment.TopEnd;
    if (dx < 0 && dy >= 0) return Alignment.BottomStart;
    return Alignment.TopStart;
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Stack() {
        Canvas(this.context)
          .width(this.SIZE).height(this.SIZE)
          .onReady(() => { this.ready = true; this.draw(); })
      }.width(this.SIZE).height(this.SIZE).onTouch((e: TouchEvent) => this.handleTouch(e))

      Column({ space: 2 }) {
        if (this.centerTitle) {
          Text(this.centerTitle).fontSize(13).fontColor(COLORS.textSecondary)
        }
        if (this.centerValue) {
          Text(this.centerValue).fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
        }
      }
      if (this.selInfo().idx >= 0 && this.selInfo().text) {
        Stack({ alignContent: this.cornerAlign() }) {
          Text(this.selInfo().text)
            .fontColor(this.selInfo().color)
            .fontWeight(FontWeight.Bold).fontSize(14).maxLines(1)
            .padding(12)
        }.width(this.SIZE).height(this.SIZE)
      }
    }.width(this.SIZE).height(this.SIZE)
  }
}

/** 折线趋势图（对齐安卓 TrendLineChartSingle：峰值高亮 + 点击取点） */
@Component
export struct TrendChart {
  @Prop @Watch('redraw') points: number[] = [];
  @Prop @Watch('redraw') labels: string[] = [];
  peakIndex: number = -1;
  onTapIndex?: (index: number) => void;
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D();
  private ready: boolean = false;
  private readonly W: number = 340;
  private readonly H: number = 170;

  redraw(): void {
    if (this.ready) this.draw();
  }

  private handleTouch(e: TouchEvent): void {
    if (!this.onTapIndex || this.points.length === 0) return;
    const ev: TouchObject | undefined = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!ev) return;
    const n = this.points.length;
    const idx = n === 1 ? 0 : Math.round((ev.x / this.W) * (n - 1));
    this.onTapIndex(Math.max(0, Math.min(n - 1, idx)));
  }

  draw(): void {
    const ctx = this.context;
    const w = this.W, h = this.H;
    ctx.clearRect(0, 0, w, h);
    const pts = this.points;
    if (pts.length === 0) return;
    const maxV = Math.max(...pts, 0.0001);
    const pad = 18;
    const usableH = h - pad * 2;
    const n = pts.length;
    const xAt = (i: number): number => (n === 1 ? w / 2 : (i / (n - 1)) * w);
    const yAt = (v: number): number => h - pad - (v / maxV) * usableH;

    // 基线
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.divider;
    ctx.stroke();

    // 填充（0.12 透明）
    ctx.beginPath();
    ctx.moveTo(xAt(0), h - pad);
    pts.forEach((p, i) => ctx.lineTo(xAt(i), yAt(p)));
    ctx.lineTo(xAt(n - 1), h - pad);
    ctx.closePath();
    ctx.fillStyle = COLORS.brand;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;

    // 折线
    ctx.beginPath();
    pts.forEach((p, i) => { const x = xAt(i), y = yAt(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.brand;
    ctx.stroke();

    // 数据点：峰值 6px，其余 4px
    let max = pts[0];
    pts.forEach((p) => { if (p > max) max = p; });
    const peak = this.peakIndex >= 0 ? this.peakIndex : pts.indexOf(max);
    pts.forEach((p, i) => {
      const isPeak = i === peak;
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(p), isPeak ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.brand;
      ctx.fill();
    });
  }

  build() {
    Stack() {
      Canvas(this.context)
        .width(this.W).height(this.H)
        .onReady(() => { this.ready = true; this.draw(); })
        .onTouch((e: TouchEvent) => this.handleTouch(e))
    }.width(this.W).height(this.H)
  }
}
