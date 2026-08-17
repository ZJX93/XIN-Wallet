/**
 * 数据契约：镜像安卓端 ApiService.kt / Models.kt 的接口与数据结构。
 * 字段命名与后端 JSON 保持一致（后端用 snake_case，序列化后安卓用 @SerializedName 映射；
 * 鸿蒙端直接按后端原始字段名定义，便于 JSON.parse）。
 */

/** 统一响应包装：{ success, data, message } */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/* ----------------------------- 鉴权 ----------------------------- */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface DemoRequest {
  demo?: boolean;
}

export interface User {
  id?: number;
  username?: string;
  nickname?: string;
  email?: string;
  avatar?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user?: User;
}

export interface UserWrapper {
  user?: User;
}

export interface IdResponse {
  id: number;
}

export interface UpdateProfileRequest {
  username?: string;
  nickname?: string;
  avatar?: string;
  oldPassword?: string;
  newPassword?: string;
}

/* ----------------------------- 账户 ----------------------------- */

export interface Account {
  id: number;
  code?: string;
  name: string;
  type: string;
  icon?: string;
  balance: number;
  opening_balance?: number;
  credit_limit?: number;
  is_default?: boolean;
  status?: string;
  sort_order?: number;
}

export interface AccountsResponse {
  accounts: Account[];
  totalAssets?: number;
}

export interface CreateAccountRequest {
  name: string;
  type: string;
  icon?: string;
  opening_balance?: number;
  credit_limit?: number;
}

export interface UpdateAccountRequest {
  name: string;
  type: string;
  icon?: string;
  opening_balance?: number;
  credit_limit?: number;
}

/* ----------------------------- 分类 ----------------------------- */

export interface Category {
  id: number;
  code?: string;
  parent_id?: number;
  user_id?: number;
  name: string;
  type: string;
  icon?: string;
  color?: string;
  is_system?: boolean;
  sort_order?: number;
}

/* ----------------------------- 交易 ----------------------------- */

export interface TxRef {
  id: number;
  name: string;
  icon?: string;
}

export interface TxCounterparty {
  dir?: string;
  name: string;
  icon?: string;
}

export interface TxTag {
  id: number;
  name: string;
  color?: string;
  icon?: string;
}

export interface TransactionItem {
  id: number;
  type: string;
  amount: number;
  note?: string;
  date: string;
  location?: string;
  link_type?: string;
  link_id?: number;
  category?: TxRef;
  account?: TxRef;
  source?: TxRef;
  destination?: TxRef;
  counterparty?: TxCounterparty;
  transfer_id?: number;
  tags?: TxTag[];
}

export interface Transaction {
  id: number;
  user_id?: number;
  account_id?: number;
  category_id?: number;
  type: string;
  amount: number;
  note?: string;
  date: string;
  cat_name?: string;
  cat_icon?: string;
  acc_name?: string;
  acc_icon?: string;
}

export interface CreateTransactionRequest {
  account_id: number;
  category_id: number;
  type: string;
  amount: number;
  note?: string;
  date: string;
  location?: string;
  link_type?: string;
  link_id?: number;
}

export interface UpdateTransactionRequest {
  account_id: number;
  category_id: number;
  type: string;
  amount: number;
  note?: string;
  date: string;
  location?: string;
  link_type?: string;
  link_id?: number;
}

/* ----------------------------- 汇总/报表 ----------------------------- */

export interface CategoryTotal {
  id: number;
  name: string;
  icon?: string;
  parent_id?: number;
  total: number;
}

export interface TxSummary {
  income: number;
  expense: number;
  balance: number;
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
}

export interface Dashboard {
  monthIncome?: number;
  monthExpense?: number;
  balance?: number;
  recentTransactions?: Transaction[];
  budgetUsage?: object;
  [key: string]: Object;
}

export interface CalendarDay {
  date: string;
  income: number;
  expense: number;
  hasRecord: boolean;
}

export interface CalendarSummary {
  year: number;
  month: number;
  monthDays: CalendarDay[];
  monthSummary?: object;
}

/* ----------------------------- 多账本 ----------------------------- */

export interface Book {
  id: number;
  name: string;
  icon?: string;
  type?: string;
  currency?: string;
  is_default?: boolean;
  created_at?: string;
}

export interface BooksResponse {
  books: Book[];
  currentBookId: number;
}

export interface BookIdResponse {
  id: number;
}

export interface CreateBookRequest {
  name: string;
  icon?: string;
}

export interface SwitchBookResponse {
  bookId: number;
}

/* ----------------------------- AI ----------------------------- */

export interface ChatMessage {
  role: string;
  content: string;
  type?: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  imageBase64?: string;
}

export interface ChatResponse {
  reply: string;
  transactions?: TransactionItem[];
  [key: string]: Object;
}

export interface OcrResponse {
  transactions?: TransactionItem[];
  items?: object[];
  [key: string]: Object;
}

export interface OcrConfig {
  configured?: boolean;
  [key: string]: Object;
}

export interface TranscribeRequest {
  audio: string; // base64
  format?: string;
}

export interface TranscribeResponse {
  text: string;
}

/* ----------------------------- 通用列表包装 ----------------------------- */

export interface ListResponse<T> {
  list?: T[];
  items?: T[];
  [key: string]: Object;
}

/* ----------------------------- 写入请求（页面本地构造） ----------------------------- */

export interface TagRequest {
  name: string;
  icon?: string;
  color?: string;
}

export interface BudgetRequest {
  name: string;
  amount: number;
  period: string;
}

export interface DebtRequest {
  name: string;
  type: string;
  principal: number;
  monthlyPayment: number;
}

export interface SavingsGoalRequest {
  name: string;
  icon?: string;
  target: number;
  accountId?: number;
}
