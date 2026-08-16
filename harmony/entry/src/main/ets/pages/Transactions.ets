/**
 * 账单（对齐安卓 TransactionsScreen.kt）：流水/日历双视图。
 * 作为 Tab 内嵌组件（TransactionsPage）+ 独立入口页（Transactions，读取 router 参数）。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { TransactionItem, TxSummary } from '../common/models';
import { TransactionRow } from '../common/components/Components';

function ym(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function dayNum(s: string): string { return s ? s.slice(8, 10) : ''; }
function weekdayOf(s: string): number {
  const d = new Date(s.replace(/-/g, '/'));
  let w = d.getDay() - 1; if (w < 0) w = 6; return w;
}

@Component
export struct TransactionsPage {
  @State month: string = ym(new Date());
  @State viewMode: string = 'list'; // list | calendar
  @State items: TransactionItem[] = [];
  @State summary: TxSummary | null = null;
  @State loading: boolean = false;
  @State showMonthDlg: boolean = false;
  @State showRowDlg: TransactionItem | null = null;
  @State calDays: any[] = [];

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const [t, s, c] = await Promise.all([
        Api.getTransactions({ month: this.month, limit: 500 }),
        Api.getTransactionSummary(this.month),
        Api.getStatsCalendar(Number(this.month.split('-')[0]), Number(this.month.split('-')[1]))
      ]);
      if (t.success) this.items = t.data || [];
      if (s.success) this.summary = s.data;
      if (c.success) this.calDays = (c.data as any)?.days || [];
    } catch (e) { console.error('Tx load:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  changeMonth(delta: number): void {
    const [y, m] = this.month.split('-').map(Number);
    let ny = y, nm = m + delta;
    if (nm < 1) { nm = 12; ny--; } else if (nm > 12) { nm = 1; ny++; }
    this.month = `${ny}-${String(nm).padStart(2, '0')}`;
    this.load();
  }

  groups(): { date: string; rows: TransactionItem[] }[] {
    const map = new Map<string, TransactionItem[]>();
    this.items.forEach(it => {
      const k = (it.date || '').slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] < b[0] ? 1 : -1)
      .map(([date, rows]) => ({ date, rows }));
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
      Scroll() {
        Column({ space: 8 }) {
          ForEach(this.groups(), (g: any) => {
            Column({ space: 0 }) {
              Row() {
                Text(g.date).fontSize(13).fontColor(COLORS.textSecondary).layoutWeight(1)
                Text(`收 ${fmtMoney(this.dayIncome(g.rows))}  支 ${fmtMoney(this.dayExpense(g.rows))}`)
                  .fontSize(12).fontColor(COLORS.textSecondary)
              }.padding({ left: 4, right: 4, top: 4, bottom: 4 })
              ForEach(g.rows, (it: TransactionItem) => {
                TransactionRow({ item: it, onClick: () => this.showRowDlg = it })
              }, (it: TransactionItem) => it.id.toString())
            }.backgroundColor(COLORS.card).borderRadius(12).padding(8)
          }, (g: any) => g.date)
          Blank().height(16)
        }.padding(12)
      }.layoutWeight(1)
    }.width('100%').height('100%')
  }

  @Builder CalendarView() {
    Column({ space: 8 }) {
      Row() {
        Text(`${this.month} 日历`).fontSize(15).fontWeight(FontWeight.Medium).layoutWeight(1)
      }
      Row() {
        ForEach(['一', '二', '三', '四', '五', '六', '日'], (w: string) => {
          Text(w).fontSize(12).fontColor(COLORS.textSecondary).textAlign(TextAlign.Center).layoutWeight(1)
        })
      }
      let first = this.calDays.length ? weekdayOf(this.calDays[0].date) : 0;
      let cells: any[] = [];
      for (let i = 0; i < first; i++) cells.push(null);
      for (const d of this.calDays) cells.push(d);
      Grid() {
        ForEach(cells, (cell: any, idx: number) => {
          GridItem() {
            if (cell) {
              Column({ space: 2 }) {
                Text(dayNum(cell.date)).fontSize(13).fontColor(cell.hasRecord ? COLORS.brand : COLORS.textPrimary)
                if (cell.hasRecord) {
                  Text(fmtMoney((cell.income ?? 0) - (cell.expense ?? 0)).replace('¥', ''))
                    .fontSize(9).fontColor(COLORS.textSecondary).maxLines(1)
                    .textOverflow({ overflow: TextOverflow.Ellipsis })
                }
              }.width('100%').height(46)
                .backgroundColor(cell.hasRecord ? COLORS.brandBgLight : '#00000000').borderRadius(8)
            } else { Column() {}.width('100%').height(46) }
          }
        }, (cell: any, idx: number) => idx.toString())
      }.columnsTemplate('1fr 1fr 1fr 1fr 1fr 1fr 1fr').rowsGap(4).columnsGap(4)
      Scroll() {
        Column({ space: 8 }) {
          ForEach(this.items, (it: TransactionItem) => {
            TransactionRow({ item: it, onClick: () => this.showRowDlg = it })
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

    if (this.showRowDlg) {
      AlertDialog({
        title: '交易操作',
        message: `${this.showRowDlg.category?.name ?? ''} ${fmtMoney(this.showRowDlg.amount)}`,
        primaryButton: { value: '编辑', action: () => { const id = this.showRowDlg!.id; this.showRowDlg = null; router.pushUrl({ url: 'pages/AddTransaction', params: { editId: id, month: this.month } }); } },
        secondaryButton: { value: '删除', action: () => { const id = this.showRowDlg!.id; this.showRowDlg = null; Api.deleteTransaction(id).then(() => this.load()); } }
      })
    }
  }
}

@Entry
@Component
struct Transactions {
  @State page: TransactionsPage = new TransactionsPage();
  aboutToAppear(): void {
    const p: any = (router.getParams() as any) || {};
    if (p.month) { this.page.month = p.month; }
  }
  build() {
    Column() {
      TopBar({ title: '账单', showBack: false })
      this.page
    }.width('100%').height('100%')
  }
}
