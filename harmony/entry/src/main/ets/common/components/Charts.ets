/**
 * Canvas 图表组件（对齐安卓端 Charts.kt 的 DonutChart / TrendLineChartSingle）。
 * DonutChart：环形图 + 中心选中分类金额。
 * TrendChart：单系列折线 + 浅色填充。
 */
import { COLORS } from '../theme';

export interface DonutPiece {
  name: string;
  value: number;
  color?: string;
}

/** 环形图（对齐 DonutChart） */
export struct DonutChart {
  @State @Watch('redraw') data: DonutPiece[] = [];
  @State selectedIndex: number = -1;
  @State centerTitle: string = '';
  @State centerValue: string = '';
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D();
  private ready: boolean = false;

  redraw(): void {
    if (this.ready) this.draw();
  }

  draw(): void {
    const ctx = this.context;
    const w = 280, h = 280;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const rOut = 110, rIn = 70;
    const total = this.data.reduce((s, d) => s + (d.value || 0), 0);
    if (total <= 0) return;
    let start = -Math.PI / 2;
    this.data.forEach((d, i) => {
      const ang = (d.value / total) * Math.PI * 2;
      const r = i === this.selectedIndex ? rOut + 8 : rOut;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + ang);
      ctx.closePath();
      ctx.fillStyle = d.color ?? COLORS.brand;
      ctx.fill();
      start += ang;
    });
    // 中心挖空
    ctx.beginPath();
    ctx.arc(cx, cy, rIn, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.card;
    ctx.fill();
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Canvas(this.context)
        .width(280).height(280)
        .onReady(() => { this.ready = true; this.draw(); })
      Column({ space: 2 }) {
        if (this.centerTitle) {
          Text(this.centerTitle).fontSize(13).fontColor(COLORS.textSecondary)
        }
        if (this.centerValue) {
          Text(this.centerValue).fontSize(20).fontWeight(FontWeight.Bold).fontColor(COLORS.textPrimary)
        }
      }
    }
  }
}

/** 折线趋势图（对齐 TrendLineChartSingle） */
export struct TrendChart {
  @State @Watch('redraw') points: number[] = [];
  @State @Watch('redraw') labels: string[] = [];
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D();
  private ready: boolean = false;

  redraw(): void {
    if (this.ready) this.draw();
  }

  draw(): void {
    const ctx = this.context;
    const w = 340, h = 160;
    ctx.clearRect(0, 0, w, h);
    if (this.points.length === 0) return;
    const max = Math.max(...this.points, 0.0001);
    const min = Math.min(...this.points, 0);
    const pad = 18;
    const cw = w - pad * 2;
    const ch = h - pad * 2;
    const step = this.points.length > 1 ? cw / (this.points.length - 1) : 0;
    const yOf = (p: number) => h - pad - ((p - min) / (max - min || 1)) * ch;

    // 基线
    ctx.strokeStyle = COLORS.divider;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();

    // 折线
    ctx.beginPath();
    this.points.forEach((p, i) => {
      const x = pad + step * i;
      const y = yOf(p);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = COLORS.brand;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 填充
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(pad, h - pad);
    ctx.closePath();
    ctx.fillStyle = COLORS.brandBgLight;
    ctx.globalAlpha = 0.5;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  build() {
    Canvas(this.context)
      .width(340).height(160)
      .onReady(() => { this.ready = true; this.draw(); })
  }
}
