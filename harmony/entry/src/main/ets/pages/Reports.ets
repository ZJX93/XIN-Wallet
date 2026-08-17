/**
 * 统计（对齐安卓 ReportsScreen.kt）：支出/收入/结余分段 + 周期 + KPI + 趋势 + 环形图 + 分类排行 + 明细排行。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { DonutChart, DonutPiece, TrendChart } from '../common/components/Charts';
import { SectionTitle, LoadingBox, EmptyState, TopBar, StatKpiCard, CategoryBars } from '../common/components/Components';

function ym(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

interface RSummary { income?: number; expense?: number; balance?: number; savingsRate?: number; transactionCount?: number; avgDailyExpense?: number; }
interface RSlice { id?: number; name?: string; icon?: string; parentId?: number; total?: number; color?: string; }
interface RTrend { date?: string; income?: number; expense?: number; }
interface RData { type?: string; period?: string; label?: string; summary?: RSummary; dailyTrend?: RTrend[]; expenseByCategory?: RSlice[]; incomeByCategory?: RSlice[]; topExpenses?: object[]; budgetExecution?: object[]; compare?: object; }

@Component
export struct ReportsPage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State type: string = 'expense';
  @State month: string = ym(new Date());
  @State data: ESObject = null;
  @State loading: boolean = false;
  @State selectedIdx: number = -1;

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      // 后端 /reports 的 type 是粒度(monthly/yearly/custom)，不是支出/收入维度
      const r = await Api.getReport('monthly', this.month);
      if (r.success && r.data) {
        this.data = r.data as ESObject;
      }
    } catch (e) { console.error('Report load:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  changeMonth(delta: number): void {
    const _parts = this.month.split('-').map(Number);
    const y = _parts[0];
    const m = _parts[1];
    let ny = y, nm = m + delta;
    if (nm < 1) { nm = 12; ny--; } else if (nm > 12) { nm = 1; ny++; }
    this.month = `${ny}-${String(nm).padStart(2, '0')}`;
    this.load();
  }

  pieces(): DonutPiece[] {
    if (!this.data) return [];
    const d: RData = this.data as RData;
    const cats: RSlice[] = this.type === 'income'
      ? (d.incomeByCategory || [])
      : (d.expenseByCategory || []);
    return cats.map((c: RSlice): DonutPiece => ({
      name: c.name || '',
      value: c.total ?? 0,
      color: c.color || COLORS.brand,
      icon: c.icon || '📌'
    }));
  }

  trendPoints(): number[] {
    if (!this.data) return [];
    const d: RData = this.data as RData;
    const t: RTrend[] = d.dailyTrend || [];
    return t.map((x: RTrend): number => {
      if (this.type === 'income') return x.income ?? 0;
      if (this.type === 'balance') return (x.income ?? 0) - (x.expense ?? 0);
      return x.expense ?? 0;
    });
  }

  total(): number {
    if (!this.data) return 0;
    const d: RData = this.data as RData;
    const s: RSummary = d.summary || {};
    if (this.type === 'income') return s.income ?? 0;
    if (this.type === 'balance') return s.balance ?? 0;
    return s.expense ?? 0;
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

  reportSummary(): RSummary {
    if (!this.data) return {};
    const d: RData = this.data as RData;
    return d.summary || {};
  }

  @Builder Kpi() {
    Grid() {
      GridItem() { StatKpiCard({ title: '金额', amount: this.total(), icon: this.type === 'income' ? '📈' : '📉' }) }
      GridItem() { StatKpiCard({ title: '日均', amount: this.reportSummary().avgDailyExpense ?? (this.total() / 30), icon: '📅' }) }
      GridItem() { StatKpiCard({ title: '笔均', amount: (this.reportSummary().transactionCount ?? 0) > 0 ? this.total() / (this.reportSummary().transactionCount as number) : 0, icon: '⚖️' }) }
      GridItem() { StatKpiCard({ title: '结余', amount: this.reportSummary().balance ?? 0, icon: '🪙' }) }
    }
    .columnsTemplate('1fr 1fr').rowsTemplate('1fr 1fr').rowsGap(10).columnsGap(10)
    .width('100%').padding({ left: 12, right: 12 })
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
          centerValue: fmtMoney(this.total()),
          onSliceClick: (i: number) => { this.selectedIdx = i; }
        })
        // 分类条形排行
        CategoryBars({ items: this.pieces(), onItemClick: (i: number) => { this.selectedIdx = i; } })
          .padding(12)
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
  build() {
    Column() {
      TopBar({ title: '统计', showBack: false })
      ReportsPage()
    }.width('100%').height('100%')
  }
}
