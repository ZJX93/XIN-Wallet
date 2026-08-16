/**
 * 统计（对齐安卓 ReportsScreen.kt）：支出/收入/结余分段 + 周期 + KPI + 趋势 + 环形图 + 分类排行 + 明细排行。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { DonutChart, DonutPiece, TrendChart } from '../common/components/Charts';
import { SectionTitle, LoadingBox, EmptyState } from '../common/components/Components';

function ym(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

@Component
export struct ReportsPage {
  @State type: string = 'expense';
  @State month: string = ym(new Date());
  @State data: any = null;
  @State loading: boolean = false;
  @State selectedIdx: number = -1;

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const r = await Api.getReport(this.type, this.month);
      if (r.success) this.data = r.data;
    } catch (e) { console.error('Report load:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  changeMonth(delta: number): void {
    const [y, m] = this.month.split('-').map(Number);
    let ny = y, nm = m + delta;
    if (nm < 1) { nm = 12; ny--; } else if (nm > 12) { nm = 1; ny++; }
    this.month = `${ny}-${String(nm).padStart(2, '0')}`;
    this.load();
  }

  pieces(): DonutPiece[] {
    const cats = (this.data?.byCategory || []) as any[];
    return cats.map((c: any) => ({
      name: c.name,
      value: c.total ?? c.value ?? 0,
      color: c.color || COLORS.brand
    }));
  }

  trendPoints(): number[] {
    const t = (this.data?.trend || []) as any[];
    return t.map((x: any) => typeof x === 'number' ? x : (x.value ?? 0));
  }

  total(): number {
    return (this.data?.total ?? 0) || this.pieces().reduce((s, p) => s + p.value, 0);
  }

  @Builder Seg() {
    Row() {
      Row() {
        Text('支出').fontColor(this.type === 'expense' ? COLORS.brand : COLORS.textSecondary)
          .padding({ left: 14, right: 14, top: 6, bottom: 6 })
          .backgroundColor(this.type === 'expense' ? COLORS.brandBgLight : '#00000000')
          .borderRadius(14).onClick(() => { this.type = 'expense'; this.load(); })
        Text('收入').fontColor(this.type === 'income' ? COLORS.brand : COLORS.textSecondary)
          .padding({ left: 14, right: 14, top: 6, bottom: 6 }).margin({ left: 8 })
          .backgroundColor(this.type === 'income' ? COLORS.brandBgLight : '#00000000')
          .borderRadius(14).onClick(() => { this.type = 'income'; this.load(); })
        Text('结余').fontColor(this.type === 'balance' ? COLORS.brand : COLORS.textSecondary)
          .padding({ left: 14, right: 14, top: 6, bottom: 6 }).margin({ left: 8 })
          .backgroundColor(this.type === 'balance' ? COLORS.brandBgLight : '#00000000')
          .borderRadius(14).onClick(() => { this.type = 'balance'; this.load(); })
      }
      Blank()
      Text('‹').fontSize(20).onClick(() => this.changeMonth(-1))
      Text(this.month).fontSize(14).margin({ left: 8, right: 8 })
      Text('›').fontSize(20).onClick(() => this.changeMonth(1))
    }.width('100%').padding({ left: 16, right: 16, top: 8, bottom: 8 })
  }

  @Builder Kpi() {
    let total = this.total();
    let avg = this.data?.avgDaily ?? (total / 30);
    let count = this.data?.count ?? 0;
    Row({ space: 10 }) {
      this.KpiCell('金额', fmtMoney(total), this.type === 'income' ? COLORS.income : COLORS.expense)
      this.KpiCell('日均', fmtMoney(avg), COLORS.brand)
      this.KpiCell('笔数', `${count}`, COLORS.textPrimary)
    }.width('100%').padding({ left: 12, right: 12 })
  }

  @Builder KpiCell(title: string, value: string, color: string) {
    Column({ space: 4 }) {
      Text(title).fontSize(12).fontColor(COLORS.textSecondary)
      Text(value).fontSize(18).fontWeight(FontWeight.Bold).fontColor(color)
    }.layoutWeight(1).padding(12).backgroundColor(COLORS.card).borderRadius(12)
  }

  @Builder DonutBlock() {
    Column({ space: 8 }) {
      SectionTitle({ text: this.type === 'income' ? '收入分类占比' : (this.type === 'balance' ? '结余构成' : '支出分类占比') })
      if (this.pieces().length === 0) {
        EmptyState({ text: '暂无数据' })
      } else {
        DonutChart({
          data: this.pieces(),
          selectedIndex: this.selectedIdx,
          centerTitle: this.type === 'income' ? '总收入' : '总支出',
          centerValue: fmtMoney(this.total())
        })
        // 分类条形排行
        Column({ space: 8 }) {
          ForEach(this.pieces(), (p: DonutPiece, i: number) => {
            Column({ space: 4 }) {
              Row() {
                Text(p.name).fontSize(14).layoutWeight(1)
                Text(fmtMoney(p.value)).fontSize(14).fontColor(COLORS.textPrimary)
              }
              Row() {
                Row().width(`${this.total() > 0 ? (p.value / this.total() * 100) : 0}%`)
                  .height(6).backgroundColor(p.color).borderRadius(3)
              }.width('100%').backgroundColor(COLORS.divider).borderRadius(3)
            }.onClick(() => this.selectedIdx = i)
          }, (p: DonutPiece) => p.name)
        }.padding(12)
      }
    }.padding(12).backgroundColor(COLORS.card).borderRadius(14).margin(12)
  }

  @Builder TrendBlock() {
    Column({ space: 8 }) {
      SectionTitle({ text: '趋势' })
      if (this.trendPoints().length === 0) {
        EmptyState({ text: '暂无趋势数据' })
      } else {
        TrendChart({ points: this.trendPoints() })
      }
    }.padding(12).backgroundColor(COLORS.card).borderRadius(14).margin({ left: 12, right: 12 })
  }

  build() {
    Column() {
      this.Seg()
      if (this.loading) { LoadingBox() }
      else {
        Scroll() {
          Column({ space: 12 }) {
            this.Kpi()
            this.TrendBlock()
            this.DonutBlock()
            Blank().height(16)
          }
        }.layoutWeight(1)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

@Entry
@Component
struct Reports {
  @State page: ReportsPage = new ReportsPage();
  build() {
    Column() {
      TopBar({ title: '统计', showBack: false })
      this.page
    }.width('100%').height('100%')
  }
}
