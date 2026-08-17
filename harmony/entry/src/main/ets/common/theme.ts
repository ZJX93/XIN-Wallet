/**
 * 主题常量：对齐安卓端暖棕主题（accent-500 / Brown500）。
 * 收入红 / 支出绿与 Web 端 Design Token 一致。
 */
/**
 * 颜色 token（对齐安卓 Color.kt 亮/暗双主题）。
 * 采用「可变 activeColors + applyTheme() 同步」方案：COLORS 始终是同一引用对象，
 * 切换主题时只更新其字段，配合页面 @StorageProp('themeMode') 重绘即可生效，
 * 无需改动任何页面的 COLORS.xxx 取色代码。
 */
export interface ColorTokens {
  brand: string;
  brandLight: string;
  brandLighter: string;
  brandBg: string;
  brandBgLight: string;
  income: string;
  expense: string;
  teal: string;
  fabBg: string;
  textPrimary: string;
  textSecondary: string;
  card: string;
  pageBg: string;
  divider: string;
  danger: string;
  placeholder: string;
}

/** 亮色（对齐安卓 md_theme_light_* / Brown*） */
export const LIGHT: ColorTokens = {
  brand: '#995F2C',        // Brown500 主品牌色（暖棕）
  brandLight: '#D39562',   // Brown300
  brandLighter: '#EBB890', // Brown200
  brandBg: '#F8D7BE',      // Brown100 浅填充
  brandBgLight: '#FCEFE5', // Brown50 更浅填充
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

/** 暗色（对齐安卓 md_theme_dark_*：深暖炭灰，非纯黑） */
export const DARK: ColorTokens = {
  brand: '#B6753B',        // Brown400 暗色交互主色
  brandLight: '#D39562',
  brandLighter: '#61370D', // accent-700 暗底
  brandBg: '#342C26',      // dark primaryContainer
  brandBgLight: '#3F342B', // 暗浅填充（偏暖 surfaceVariant）
  income: '#ED324B',       // IncomeColorDark
  expense: '#00B870',      // ExpenseColorDark
  teal: '#4DD0C4',
  fabBg: '#111827',
  textPrimary: '#EAE3DE',  // onBackground dark
  textSecondary: '#AAA39D',// onSurfaceVariant dark
  card: '#29231D',         // dark surface
  pageBg: '#18130E',       // dark background
  divider: '#39312B',      // dark surfaceVariant
  danger: '#ED324B',
  placeholder: '#8A817A'
};

const _active: ColorTokens = { ...LIGHT };
/** 当前生效色板（同一引用，页面直接 import 使用） */
export const COLORS: ColorTokens = _active;

function syncTokens(t: ColorTokens): void {
  _active.brand = t.brand;
  _active.brandLight = t.brandLight;
  _active.brandLighter = t.brandLighter;
  _active.brandBg = t.brandBg;
  _active.brandBgLight = t.brandBgLight;
  _active.income = t.income;
  _active.expense = t.expense;
  _active.teal = t.teal;
  _active.fabBg = t.fabBg;
  _active.textPrimary = t.textPrimary;
  _active.textSecondary = t.textSecondary;
  _active.card = t.card;
  _active.pageBg = t.pageBg;
  _active.divider = t.divider;
  _active.danger = t.danger;
  _active.placeholder = t.placeholder;
}

/** 根据 themeMode / 系统暗色，把 COLORS 同步为对应色板 */
export function applyTheme(): void {
  syncTokens(isDarkMode() ? DARK : LIGHT);
}

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

/** 金额紧凑缩写（对齐安卓 CalendarCell.formatCompact）：<1万原样，≥1万 X.XX万，≥1亿 X.XX亿 */
export function formatCompact(v: number): string {
  const n = Number(v) || 0;
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(2);
}

// 模块加载时按当前主题模式初始化一次色板（页面首帧前完成）
applyTheme();
