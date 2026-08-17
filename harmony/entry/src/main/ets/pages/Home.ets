/**
 * 首页 Home（对齐安卓 HomeScreen.kt）
 * 账本切换头 + 暖棕渐变月支出卡 + 今日账单 + 账单日历 + 编辑首页卡片。
 */
import router from '@ohos.router';
import * as Api from '../common/api/Api';
import { ApiError } from '../common/http/Http';
import { COLORS, fmtMoney } from '../common/theme';
import { TransactionItem, Dashboard, CalendarSummary, CalendarDay, Book, BooksResponse } from '../common/models';
import { TransactionRow, HeroGradientCard, BookHeader, BookSwitcherSheet, IconCircle } from '../common/components/Components';
import { SharedCalendarCell, buildMonthCells, CalCell } from '../common/components/CalendarCell';

function ym(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function todayStr(): string { const d = new Date(); return `${ym(d)}-${String(d.getDate()).padStart(2, '0')}`; }
function dayNum(s: string): string {
  if (!s) return '';
  const parts = s.split(/[- T:]/);
  return parts.length >= 3 ? parts[2] : '';
}
function weekdayOf(s: string): number {
  const d = new Date(s.replace(/-/g, '/'));
  let w = d.getDay() - 1; if (w < 0) w = 6; return w;
}

interface DashMonth { income?: number; expense?: number; balance?: number; }
interface DashData { month?: DashMonth; income?: number; expense?: number; balance?: number; }

@Component

export struct HomePage {
  @StorageProp('themeMode') themeMode: string = 'system';
  @State month: string = ym(new Date());
  @State dash: Dashboard | null = null;
  @State today: TransactionItem[] = [];
  @State cal: CalendarSummary | null = null;
  @State loading: boolean = false;
  @State books: Book[] = [];
  @State currentBookId: number = 0;
  @State bookName: string = '默认账本';
  @State showBookSheet: boolean = false;
  @State showEditSheet: boolean = false;
  @State showTodayCard: boolean = true;
  @State showCalendarCard: boolean = true;
  @State monthExpenseVal: number = 0;
  @State monthIncomeVal: number = 0;
  @State selectedDate: string = '';
  todayDate: string = todayStr();

  aboutToAppear(): void { this.load(); }

  async load(): Promise<void> {
    this.loading = true;
    try {
      await this.loadBooks();
      const _r = await Promise.all([
        Api.getDashboard(),
        Api.getStatsCalendar(new Date().getFullYear(), new Date().getMonth() + 1),
        Api.getTransactions({ month: this.month, limit: 300 })
      ]);
      const d = _r[0];
      const c = _r[1];
      const t = _r[2];
      if (d.success) {
        this.dash = d.data;
        const dd = d.data as DashData;
        this.monthExpenseVal = (dd.month?.expense ?? dd.expense ?? 0) as number;
        this.monthIncomeVal = (dd.month?.income ?? dd.income ?? 0) as number;
      }
      if (c.success) this.cal = c.data;
      if (t.success) {
        const td = todayStr();
        this.today = (t.data || []).filter(x => (x.date || '').startsWith(td));
      }
    } catch (e) { console.error('Home load:', (e as ApiError).message); }
    finally { this.loading = false; }
  }

  async loadBooks(): Promise<void> {
    try {
      const r = await Api.getBooks();
      if (r.success && r.data) {
        const data = r.data as BooksResponse;
        this.books = data.books || [];
        this.currentBookId = data.currentBookId || 0;
        const b = this.books.find(x => x.id === this.currentBookId);
        this.bookName = b ? b.name : '默认账本';
      }
    } catch (e) { /* ignore */ }
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

  @Builder EditSheetContent() {
    Column({ space: 12 }) {
      Text('编辑首页卡片').fontSize(16).fontWeight(FontWeight.Bold)
      Row({ space: 16 }) {
        Toggle({ type: ToggleType.Switch, isOn: this.showTodayCard })
          .onChange((v: boolean) => this.showTodayCard = v)
        Text('今日账单').fontSize(15)
      }
      Row({ space: 16 }) {
        Toggle({ type: ToggleType.Switch, isOn: this.showCalendarCard })
          .onChange((v: boolean) => this.showCalendarCard = v)
        Text('账单日历').fontSize(15)
      }
      Button('完成').width('100%').onClick(() => this.showEditSheet = false)
    }
  }

  monthExpense(): number {
    return this.monthExpenseVal;
  }
  monthIncome(): number {
    return this.monthIncomeVal;
  }

  @Builder MonthSummaryCard() {
    HeroGradientCard({
      topLeft: '本月支出',
      amount: fmtMoney(this.monthExpenseVal),
      topRight: this.month,
      bottomLeft: '本月收入 ' + fmtMoney(this.monthIncomeVal),
      bottomRight: '日均 ' + fmtMoney(this.monthExpenseVal / 30)
    })
  }

  @Builder TodayBillsCard() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        IconCircle({ icon: '🧾', boxSize: 28, iconSize: 15, bg: COLORS.brandBgLight })
        Text('今日账单').fontSize(15).fontWeight(FontWeight.Medium).layoutWeight(1)
      }.alignItems(VerticalAlign.Center)
      if (this.today.length === 0) {
        Text('今日还没有记账，点点底部 + 记一笔吧～').fontSize(13).fontColor(COLORS.textSecondary).padding(12)
      } else {
        ForEach(this.today, (it: TransactionItem) => {
          TransactionRow({ item: it, onItemClick: () => router.pushUrl({ url: 'pages/AddTransaction', params: { editId: it.id } }) })
        }, (it: TransactionItem) => it.id.toString())
      }
    }.padding(14).backgroundColor(COLORS.card).borderRadius(14)
  }

  @Builder CalendarCard() {
    Column({ space: 8 }) {
      Row({ space: 8 }) {
        IconCircle({ icon: '📅', boxSize: 28, iconSize: 15, bg: COLORS.brandBgLight })
        Text(`${this.cal?.year ?? new Date().getFullYear()}年${(this.cal?.month ?? (new Date().getMonth() + 1))}月`)
          .fontSize(15).fontWeight(FontWeight.Medium).layoutWeight(1)
        Text('‹').fontSize(20).fontColor(COLORS.textSecondary).onClick(() => this.changeMonth(-1))
        Text('›').fontSize(20).fontColor(COLORS.textSecondary).margin({ left: 16 }).onClick(() => this.changeMonth(1))
      }.alignItems(VerticalAlign.Center)
      Row() {
        ForEach(['一', '二', '三', '四', '五', '六', '日'], (w: string) => {
          Text(w).fontSize(12).fontColor(COLORS.textSecondary)
            .textAlign(TextAlign.Center).layoutWeight(1)
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
      Row({ space: 24 }) {
        Text(`收 ${fmtMoney(this.sumCal('income'))}`).fontSize(12).fontColor(COLORS.income)
        Text(`支 ${fmtMoney(this.sumCal('expense'))}`).fontSize(12).fontColor(COLORS.expense)
      }
    }.padding(14).backgroundColor(COLORS.card).borderRadius(14)
  }

  sumCal(t: string): number {
    let s = 0;
    (this.cal?.monthDays || []).forEach((d: CalendarDay) => { s += t === 'income' ? (d.income ?? 0) : (d.expense ?? 0); });
    return s;
  }

  calCells(): CalCell[] {
    const days: ESObject[] = (this.cal && this.cal.monthDays) ? this.cal.monthDays as ESObject[] : [];
    const parts = this.month.split('-');
    return buildMonthCells(Number(parts[0]), Number(parts[1]), days, this.selectedDate, this.todayDate);
  }

  build() {
    Stack() {
      Column() {
        // 账本头（组件化，对齐安卓 BookHeader）
        BookHeader({
          bookName: this.bookName,
          onSwapBook: () => { this.showBookSheet = true; },
          onSearch: () => router.pushUrl({ url: 'pages/Search' })
        })

        Scroll() {
          Column({ space: 12 }) {
            this.MonthSummaryCard()
            if (this.showTodayCard) this.TodayBillsCard()
            if (this.showCalendarCard) this.CalendarCard()
            Button('编辑首页卡片')
              .width('60%').alignSelf(ItemAlign.Center)
              .backgroundColor(COLORS.brandBgLight).fontColor(COLORS.brand)
              .onClick(() => this.showEditSheet = true)
            Blank().height(20)
          }.padding(12)
        }.layoutWeight(1)
      }.width('100%').height('100%')

      BookSwitcherSheet({
        show: this.showBookSheet,
        books: this.books,
        currentId: this.currentBookId,
        onDismiss: () => { this.showBookSheet = false; },
        onSelect: (id: number) => {
          Api.switchBook(id).then(() => {
            const b = this.books.find(x => x.id === id);
            this.currentBookId = id;
            this.bookName = b ? b.name : this.bookName;
            this.showBookSheet = false;
            this.load();
          });
        },
        onCreate: (name: string) => {
          Api.createBook({ name }).then(() => { this.loadBooks(); });
        }
      })
      if (this.showEditSheet) {
        Column() {
          Column().layoutWeight(1).backgroundColor('#00000066').onClick(() => this.showEditSheet = false)
          Column() { this.EditSheetContent() }
            .width('100%').backgroundColor(COLORS.card)
            .borderRadius({ topLeft: 16, topRight: 16 })
            .padding(20).constraintSize({ maxHeight: '60%' })
        }.width('100%').height('100%').position({ x: 0, y: 0 }).zIndex(20)
      }
    }.width('100%').height('100%').backgroundColor(COLORS.pageBg)
  }
}
