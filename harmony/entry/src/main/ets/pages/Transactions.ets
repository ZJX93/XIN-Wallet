/**
 * 账单（对齐安卓 TransactionsScreen.kt）：流水/日历双视图。
 * 作为 Tab 内嵌组件（TransactionsPage）+ 独立入口页（Transactions，读取 router 参数）。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { TransactionItem, TxSummary } from '../common/models';
import { TransactionRow, TopBar, LoadingBox, PullRefreshBox, IconCircle } from '../common/components/Components';
import { SharedCalendarCell, buildMonthCells, CalCell } from '../common/components/CalendarCell';

interface Iface1 {
  date: string;
  rows: TransactionItem[];
}

function ym(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function dayNum(s: string): string {
  if (!s) return '';
  const parts = s.split(/[- T:]/);
  return parts.length >= 3 ? parts[2] : '';
}
function weekdayOf(s: string): number {
  const d = new Date(s.replace(/-/g, '/'));
  let w = d.getDay() - 1; if (w < 0) w = 6; return w;
}

@Component
export struct TransactionsPage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @Prop month: string = ym(new Date());
  @State viewMode: string = 'list'; // list | calendar
  @State items: TransactionItem[] = [];
  @State summary: TxSummary | null = null;
  @State loading: boolean = false;
  @State refreshing: boolean = false;
  @State showMonthDlg: boolean = false;
  @State calDays: ESObject[] = [];
  @State selectedDate: string = '';
  todayDate: string = `${ym(new Date())}-${String(new Date().getDate()).padStart(2, '0')}`;

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const _r = await Promise.all([
        Api.getTransactions({ month: this.month, limit: 500 }),
        Api.getTransactionSummary(this.month),
        Api.getStatsCalendar(Number(this.month.split('-')[0]), Number(this.month.split('-')[1]))
      ]);
      const t = _r[0];
      const s = _r[1];
      const c = _r[2];
      if (t.success) this.items = t.data || [];
      if (s.success) this.summary = s.data;
      if (c.success) { this.calDays = ((c.data as ESObject)?.monthDays as ESObject[]) ?? ([] as ESObject[]); }
    } catch (e) { console.error('Tx load:', (e as ApiError).message); }
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

  pickMonth(): void {
    const p = this.month.split('-').map(Number);
    const start = new Date(2000, 0, 1);
    const end = new Date(2035, 11, 31);
    const sel = new Date(p[0], p[1] - 1, 1);
    DatePickerDialog.show({
      start: start, end: end, selected: sel,
      onAccept: (v: ESObject) => {
        const y = v.year as number;
        const m = v.month as number;
        this.month = `${y}-${String(m).padStart(2, '0')}`;
        this.load();
      }
    });
  }

  groups(): Iface1[] {
    const map = new Map<string, TransactionItem[]>();
    this.items.forEach(it => {
      const k = (it.date || '').slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] < b[0] ? 1 : -1)
      .map((e: [string, TransactionItem[]]): Iface1 => ({ date: e[0], rows: e[1] }));
  }

  dayIncome(rows: TransactionItem[]): number {
    return rows.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
  }
  dayExpense(rows: TransactionItem[]): number {
    return rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  }

  @Builder ToolBar() {
    Row() {
      // 流水/日历 分段
      Row() {
        Text('流水').fontSize(14).fontColor(this.viewMode === 'list' ? COLORS.brand : COLORS.textSecondary)
          .padding({ left: 14, right: 14, top: 6, bottom: 6 })
          .backgroundColor(this.viewMode === 'list' ? COLORS.brandBgLight : '#00000000')
          .borderRadius(14).onClick(() => this.viewMode = 'list')
        Text('日历').fontSize(14).fontColor(this.viewMode === 'calendar' ? COLORS.brand : COLORS.textSecondary)
          .padding({ left: 14, right: 14, top: 6, bottom: 6 })
          .backgroundColor(this.viewMode === 'calendar' ? COLORS.brandBgLight : '#00000000')
          .borderRadius(14).margin({ left: 8 }).onClick(() => this.viewMode = 'calendar')
      }
      Blank()
      Text('‹').fontSize(20).onClick(() => this.changeMonth(-1))
      Text(this.month).fontSize(14).fontColor(COLORS.textPrimary).margin({ left: 10, right: 10 })
        .onClick(() => this.pickMonth())
      Text('›').fontSize(20).onClick(() => this.changeMonth(1))
    }.width('100%').padding({ left: 16, right: 16, top: 8, bottom: 8 })
  }

  @Builder SummaryStrip() {
    Row() {
      Column({ space: 2 }) { Text('结余').fontSize(12).fontColor(COLORS.textSecondary); Text(fmtMoney((this.summary?.balance) ?? 0)).fontSize(16).fontWeight(FontWeight.Bold) }.layoutWeight(1)
      Column({ space: 2 }) { Text('支出').fontSize(12).fontColor(COLORS.textSecondary); Text(fmtMoney(this.summary?.expense ?? 0)).fontSize(16).fontWeight(FontWeight.Bold).fontColor(COLORS.expense) }.layoutWeight(1)
      Column({ space: 2 }) { Text('收入').fontSize(12).fontColor(COLORS.textSecondary); Text(fmtMoney(this.summary?.income ?? 0)).fontSize(16).fontWeight(FontWeight.Bold).fontColor(COLORS.income) }.layoutWeight(1)
      Column({ space: 2 }) { Text('笔数').fontSize(12).fontColor(COLORS.textSecondary); Text(`${this.items.length}`).fontSize(16).fontWeight(FontWeight.Bold) }.layoutWeight(1)
    }.width('100%').padding(14).backgroundColor(COLORS.brand).borderRadius(14)
  }

  @Builder ListView() {
    Column({ space: 12 }) {
      this.SummaryStrip()
      PullRefreshBox({ refreshing: $refreshing, onRefresh: () => { this.load().then(() => { this.refreshing = false; }); } }) {
        Scroll() {
          Column({ space: 8 }) {
            ForEach(this.groups(), (g: ESObject) => {
              Column({ space: 0 }) {
                Row({ space: 6 }) {
                  IconCircle({ icon: '📆', boxSize: 22, iconSize: 12, bg: COLORS.brandBgLight })
                  Text(g.date).fontSize(13).fontColor(COLORS.textSecondary).layoutWeight(1)
                  Text(`收 ${fmtMoney(this.dayIncome(g.rows))}  支 ${fmtMoney(this.dayExpense(g.rows))}`)
                    .fontSize(12).fontColor(COLORS.textSecondary)
                }.padding({ left: 4, right: 4, top: 4, bottom: 4 }).alignItems(VerticalAlign.Center)
                ForEach(g.rows, (it: TransactionItem) => {
                  TransactionRow({ item: it, onItemClick: () => this.openRow(it) })
                }, (it: TransactionItem) => it.id.toString())
              }.backgroundColor(COLORS.card).borderRadius(12).padding(8)
            }, (g: ESObject) => g.date)
            Blank().height(16)
          }.padding(12)
        }.layoutWeight(1).width('100%')
      }
    }.width('100%').height('100%')
  }

  calCells(): CalCell[] {
    const parts = this.month.split('-');
    return buildMonthCells(Number(parts[0]), Number(parts[1]), this.calDays, this.selectedDate, this.todayDate);
  }

  openRow(it: TransactionItem): void {
    AlertDialog.show({
      title: '交易操作',
      message: `${it.category?.name ?? ''} ${fmtMoney(it.amount)}`,
      primaryButton: { value: '编辑', action: () => { router.pushUrl({ url: 'pages/AddTransaction', params: { editId: it.id, month: this.month } }); } },
      secondaryButton: { value: '删除', action: () => { Api.deleteTransaction(it.id).then(() => this.load()); } }
    });
  }

  @Builder CalendarView() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        IconCircle({ icon: '📅', boxSize: 28, iconSize: 15, bg: COLORS.brandBgLight })
        Text(`${this.month} 日历`).fontSize(15).fontWeight(FontWeight.Medium).layoutWeight(1)
      }.alignItems(VerticalAlign.Center)
      Row() {
        ForEach(['一', '二', '三', '四', '五', '六', '日'], (w: string) => {
          Text(w).fontSize(12).fontColor(COLORS.textSecondary).textAlign(TextAlign.Center).layoutWeight(1)
        })
      }
      Flex({ wrap: FlexWrap.Wrap }) {
        ForEach(this.calCells(), (c: CalCell) => {
          SharedCalendarCell({
            cell: c,
            isSelected: c.kind === 'CURRENT' && c.date === this.selectedDate,
            isToday: c.kind === 'CURRENT' && c.date === this.todayDate,
            onTap: () => { if (c.date) this.selectedDate = c.date; }
          }).width(`${100 / 7}%`)
        }, (c: CalCell) => c.kind + (c.date ?? c.dayLabel ?? c.day?.toString() ?? ''))
      }
      Scroll() {
        Column({ space: 8 }) {
          ForEach(this.items, (it: TransactionItem) => {
            TransactionRow({ item: it, onItemClick: () => this.openRow(it) })
          }, (it: TransactionItem) => it.id.toString())
          Blank().height(16)
        }.padding(12)
      }.layoutWeight(1)
    }.width('100%').height('100%')
  }

  build() {
    Column() {
      this.ToolBar()
      if (this.loading) { LoadingBox() }
      else if (this.viewMode === 'list') { this.ListView() }
      else { this.CalendarView() }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}

@Entry
@Component
struct Transactions {
  @State monthParam: string = ym(new Date());
  aboutToAppear(): void {
    const p: ESObject = (router.getParams() as ESObject) || {};
    if (p.month) { this.monthParam = p.month; }
  }
  build() {
    Column() {
      TopBar({ title: '账单', showBack: false })
      TransactionsPage({ month: this.monthParam })
    }.width('100%').height('100%')
  }
}
