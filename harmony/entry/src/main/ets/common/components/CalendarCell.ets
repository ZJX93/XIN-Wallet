/**
 * 共享日历格（对齐安卓端 CalendarCell.kt 的 SharedCalendarCell + CalendarCellData）。
 * 提供：
 *  - CalCell 数据接口（含 kind: 当前/上月/下月/空白，上下月带月名）
 *  - buildMonthCells 计算完整 6×7 网格（含上下月月名占位，对齐安卓周一起头）
 *  - SharedCalendarCell 单格组件：固定 44dp + 三行(日期/支出绿/收入红)固定位置
 *      选中=暖棕满底白字；有记录=暖棕淡底；空白=淡灰；上下月=更淡灰+月名
 *
 * 依赖 formatCompact（见 theme.ts），金额用紧凑缩写(万/亿)避免窄格溢出，对齐安卓。
 */
import { COLORS, formatCompact } from '../theme';

export interface CalCell {
  kind: 'EMPTY' | 'PREV' | 'NEXT' | 'CURRENT';
  day?: number;
  dayLabel?: string; // 上下月月名，如 "8月"
  date?: string;
  expense?: number;
  income?: number;
  hasRecord?: boolean;
}

function dayNum(s: string): string {
  if (!s) return '';
  const parts = s.split(/[- T:]/);
  return parts.length >= 3 ? parts[2] : '';
}

function daysInMonth(y: number, m: number): number {
  // m 为 1-based；用 Date(y, m, 0) 取上月最后一天即当月天数
  return new Date(y, m, 0).getDate();
}

/**
 * 生成完整日历网格（固定 42 格 = 6 行 × 7 列，周一起头）。
 * @param year 当前显示年(4位)
 * @param month 当前显示月(1-based)
 * @param days 当月有数据的日历天（CalendarDay[]，按日期升序）
 * @param selectedDate 选中日期(yyyy-MM-dd)，用于高亮
 * @param todayDate 今天(yyyy-MM-dd)，用于加粗
 */
export function buildMonthCells(
  year: number,
  month: number,
  days: ESObject[],
  selectedDate?: string,
  todayDate?: string
): CalCell[] {
  const cells: CalCell[] = [];
  let firstW = 0;
  if (days.length) {
    const d = new Date(String(days[0].date).replace(/-/g, '/'));
    let w = d.getDay() - 1;
    if (w < 0) w = 6;
    firstW = w;
  }
  // 上月占位（带月名）
  const prevMonth = month - 1 > 0 ? month - 1 : 12;
  const prevYear = month - 1 > 0 ? year : year - 1;
  const prevDays = daysInMonth(prevYear, prevMonth);
  for (let i = 0; i < firstW; i++) {
    cells.push({ kind: 'PREV', day: prevDays - firstW + 1 + i, dayLabel: `${prevMonth}月` });
  }
  // 当月
  days.forEach((d: ESObject) => {
    cells.push({
      kind: 'CURRENT',
      day: Number(dayNum(String(d.date))),
      date: String(d.date),
      expense: Number(d.expense) || 0,
      income: Number(d.income) || 0,
      hasRecord: !!d.hasRecord
    });
  });
  // 下月占位（带月名），补齐到 42 格
  const nextMonth = month + 1 <= 12 ? month + 1 : 1;
  const need = 42 - cells.length;
  for (let i = 0; i < need; i++) {
    cells.push({ kind: 'NEXT', day: i + 1, dayLabel: `${nextMonth}月` });
  }
  return cells;
}

@Component
export struct SharedCalendarCell {
  cell: CalCell = { kind: 'EMPTY' };
  isSelected: boolean = false;
  isToday: boolean = false;
  onTap?: () => void;

  build() {
    Column({ space: 0 }) {
      // 第一行：日期 / 上下月月名
      Text(this.cell.kind !== 'CURRENT' && this.cell.dayLabel ? this.cell.dayLabel : (this.cell.day?.toString() ?? ''))
        .fontSize(11)
        .fontColor(this.isSelected ? '#FFFFFF' : (this.cell.kind !== 'CURRENT' ? '#B3BEC4' : COLORS.textPrimary))
        .fontWeight(this.isSelected || this.isToday ? FontWeight.Bold : FontWeight.Medium)
        .textAlign(TextAlign.Center)
        .width('100%')
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.cell.kind === 'CURRENT') {
        // 第二行：支出（绿）
        Text((this.cell.expense ?? 0) > 0 ? formatCompact(this.cell.expense ?? 0) : ' ')
          .fontSize(8)
          .fontColor(this.isSelected ? '#FFFFFF' : COLORS.expense)
          .textAlign(TextAlign.Center)
          .width('100%')
          .maxLines(1)
        // 第三行：收入（红）
        Text((this.cell.income ?? 0) > 0 ? formatCompact(this.cell.income ?? 0) : ' ')
          .fontSize(8)
          .fontColor(this.isSelected ? '#FFFFFF' : COLORS.income)
          .textAlign(TextAlign.Center)
          .width('100%')
          .maxLines(1)
      } else {
        // 上月/下月：保留两行透明占位维持三行位置
        Text(' ').fontSize(8).fontColor(Color.Transparent).width('100%')
        Text(' ').fontSize(8).fontColor(Color.Transparent).width('100%')
      }
    }
    .height(44)
    .padding(2)
    .backgroundColor(
      this.isSelected ? COLORS.brand
        : (this.cell.kind !== 'CURRENT' ? '#EDEFF1'
          : (this.cell.hasRecord ? COLORS.brandBgLight : '#F3F4F6'))
    )
    .borderRadius(8)
    .justifyContent(FlexAlign.Center)
    .onClick(() => {
      if (this.onTap && this.cell.kind === 'CURRENT' && this.cell.date) { this.onTap(); }
    })
  }
}
