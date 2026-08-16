/**
 * 主题常量：对齐安卓端暖棕主题（accent-500 / Brown500）。
 * 收入红 / 支出绿与 Web 端 Design Token 一致。
 */
export const COLORS = {
  brand: '#995F2C',        // Brown500 主品牌色（暖棕）
  brandLight: '#D39562',   // Brown300
  brandLighter: '#EBB890', // Brown200
  brandBg: '#F8D7BE',      // Brown100
  brandBgLight: '#FCEFE5', // Brown50
  income: '#C11435',       // 收入红（亮色）
  expense: '#009558',      // 支出绿（亮色）
  teal: '#4DD0C4',         // 筛选/强调（薄荷青）
  fabBg: '#111827',        // 大圆 FAB 底色（近黑）
  textPrimary: '#1A1A1A',
  textSecondary: '#8A8A8A',
  card: '#FFFFFF',
  pageBg: '#F5F6F8',
  divider: '#EEEEEE',
  danger: '#E54D42',
  placeholder: '#BDBDBD'
};

/** 读取当前主题模式：'light' | 'dark' | 'system' */
export function themeMode(): string {
  return (AppStorage.Get('themeMode') as string) || 'system';
}

/** 是否深色模式（system 时跟随系统，此处用 AppStorage.isSystemDark 标记，由 EntryAbility 写入） */
export function isDarkMode(): boolean {
  const m = themeMode();
  if (m === 'dark') return true;
  if (m === 'light') return false;
  return (AppStorage.Get('isSystemDark') as boolean) || false;
}

/** 收入为正、支出为负时的金额颜色 */
export function amountColor(type: string): string {
  if (type === 'income') return COLORS.income;
  if (type === 'expense') return COLORS.expense;
  return COLORS.textPrimary;
}

/** ¥ 金额格式化，保留两位 */
export function fmtMoney(n: number): string {
  const v = Number(n) || 0;
  const neg = v < 0;
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-¥' : '¥') + s;
}
