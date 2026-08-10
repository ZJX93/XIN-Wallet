package com.xinwallet.app.data.model

import com.google.gson.annotations.SerializedName

/** 统一响应包装：{ success, data, message } */
data class ApiResponse<T>(
    val success: Boolean = false,
    val data: T? = null,
    val message: String? = null
)

/* ----------------------------- 鉴权 ----------------------------- */

data class User(
    val id: Int = 0,
    val username: String = "",
    val nickname: String? = null,
    val avatar: String? = null
)

data class AuthResponse(
    val token: String = "",
    @SerializedName("refreshToken") val refreshToken: String = "",
    val user: User? = null
)

data class UserWrapper(val user: User? = null)

data class IdResponse(val id: Int = 0)

data class LoginRequest(val username: String, val password: String)
data class RefreshRequest(@SerializedName("refreshToken") val refreshToken: String)
data class DemoRequest(val demo: Boolean = true)

/* ----------------------------- 账户 ----------------------------- */

data class Account(
    val id: Int = 0,
    val code: String? = null,
    val name: String = "",
    val type: String = "cash",
    val icon: String? = "💰",
    val balance: Double = 0.0,
    @SerializedName("opening_balance") val openingBalance: Double = 0.0,
    @SerializedName("credit_limit") val creditLimit: Double = 0.0,
    @SerializedName("is_default") val isDefault: Boolean = false,
    val status: String = "active",
    @SerializedName("sort_order") val sortOrder: Int = 0
)

data class AccountsResponse(
    val accounts: List<Account> = emptyList(),
    @SerializedName("totalAssets") val totalAssets: Double = 0.0
)

data class CreateAccountRequest(
    val name: String,
    val type: String,
    val icon: String? = "💰",
    @SerializedName("opening_balance") val openingBalance: Double = 0.0,
    @SerializedName("credit_limit") val creditLimit: Double = 0.0
)

data class UpdateAccountRequest(
    val name: String,
    val type: String,
    val icon: String? = "💰",
    @SerializedName("opening_balance") val openingBalance: Double = 0.0,
    @SerializedName("credit_limit") val creditLimit: Double = 0.0
)

/* ----------------------------- 分类 ----------------------------- */

data class Category(
    val id: Int = 0,
    val code: String? = null,
    @SerializedName("parent_id") val parentId: Int? = null,
    @SerializedName("user_id") val userId: Int? = null,
    val name: String = "",
    val type: String = "expense",
    val icon: String? = "📌",
    val color: String? = "#6366f1",
    @SerializedName("is_system") val isSystem: Boolean = true,
    @SerializedName("sort_order") val sortOrder: Int = 0
)

/* ----------------------------- 交易（列表：嵌套格式） ----------------------------- */

data class TransactionItem(
    val id: Int = 0,
    val type: String = "expense",
    val amount: Double = 0.0,
    val note: String? = null,
    val date: String = "",
    val category: TxRef? = null,
    val account: TxRef? = null,
    val source: TxRef? = null,
    val destination: TxRef? = null,
    val counterparty: TxCounterparty? = null,
    @SerializedName("transfer_id") val transferId: Int? = null,
    val tags: List<TxTag> = emptyList()
)

data class TxRef(val id: Int = 0, val name: String = "", val icon: String? = null)
data class TxCounterparty(val dir: String? = null, val name: String = "", val icon: String? = null)
data class TxTag(val id: Int = 0, val name: String = "", val color: String? = null, val icon: String? = null)

/* ----------------------------- 交易（扁平格式：仪表盘最近交易） ----------------------------- */

data class Transaction(
    val id: Int = 0,
    @SerializedName("user_id") val userId: Int = 0,
    @SerializedName("account_id") val accountId: Int = 0,
    @SerializedName("category_id") val categoryId: Int = 0,
    val type: String = "expense",
    val amount: Double = 0.0,
    val note: String? = null,
    val date: String = "",
    @SerializedName("cat_name") val catName: String? = null,
    @SerializedName("cat_icon") val catIcon: String? = null,
    @SerializedName("acc_name") val accName: String? = null,
    @SerializedName("acc_icon") val accIcon: String? = null
)

data class CreateTransactionRequest(
    @SerializedName("account_id") val accountId: Int,
    @SerializedName("category_id") val categoryId: Int,
    val type: String,
    val amount: Double,
    val note: String? = null,
    val date: String
)

/** 编辑交易：字段与新增一致，后端会按账本重算受影响账户余额 */
data class UpdateTransactionRequest(
    @SerializedName("account_id") val accountId: Int,
    @SerializedName("category_id") val categoryId: Int,
    val type: String,
    val amount: Double,
    val note: String? = null,
    val date: String
)

/** GET /transactions/summary?month=YYYY-MM */
data class TxSummary(
    val income: Double = 0.0,
    val expense: Double = 0.0,
    val balance: Double = 0.0,
    val expenseByCategory: List<CategoryTotal> = emptyList(),
    val incomeByCategory: List<CategoryTotal> = emptyList()
)

data class CategoryTotal(
    val id: Int = 0,
    val name: String = "",
    val icon: String? = null,
    @SerializedName("parent_id") val parentId: Int? = null,
    val total: Double = 0.0
)

/* ----------------------------- 转账 ----------------------------- */

data class Transfer(
    val id: Int = 0,
    @SerializedName("from_account_id") val fromAccountId: Int = 0,
    @SerializedName("to_account_id") val toAccountId: Int = 0,
    val amount: Double = 0.0,
    val note: String? = null,
    val date: String = "",
    val status: String = "completed",
    @SerializedName("from_name") val fromName: String? = null,
    @SerializedName("from_icon") val fromIcon: String? = null,
    @SerializedName("to_name") val toName: String? = null,
    @SerializedName("to_icon") val toIcon: String? = null
)

data class CreateTransferRequest(
    @SerializedName("from_account_id") val fromAccountId: Int,
    @SerializedName("to_account_id") val toAccountId: Int,
    val amount: Double,
    val note: String? = null,
    val date: String
)

/* ----------------------------- 理财 ----------------------------- */

data class InvestmentType(
    val id: Int = 0,
    val code: String? = null,
    val name: String = "",
    val icon: String? = "📈",
    @SerializedName("risk_level") val riskLevel: String = "medium",
    val category: String = "fund",
    val description: String? = null,
    @SerializedName("sort_order") val sortOrder: Int = 0,
    @SerializedName("is_system") val isSystem: Boolean = false
)

data class Investment(
    val id: Int = 0,
    @SerializedName("user_id") val userId: Int = 0,
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("investment_type_id") val investmentTypeId: Int = 0,
    val name: String = "",
    val code: String = "",
    @SerializedName("buy_price") val buyPrice: Double = 0.0,
    @SerializedName("current_price") val currentPrice: Double = 0.0,
    val quantity: Double = 0.0,
    @SerializedName("total_cost") val totalCost: Double = 0.0,
    @SerializedName("current_value") val currentValue: Double = 0.0,
    val fee: Double = 0.0,
    @SerializedName("buy_date") val buyDate: String = "",
    @SerializedName("expected_rate") val expectedRate: Double = 0.0,
    @SerializedName("actual_rate") val actualRate: Double = 0.0,
    @SerializedName("nav_date") val navDate: String? = null,
    val status: String = "holding",
    val note: String? = null,
    @SerializedName("risk_level") val riskLevel: String? = null,
    @SerializedName("type_name") val typeName: String? = null,
    @SerializedName("type_icon") val typeIcon: String? = null,
    @SerializedName("acc_name") val accName: String? = null,
    val profit: Double = 0.0,
    @SerializedName("profit_rate") val profitRate: Double = 0.0,
    val annualizedRate: Double = 0.0
)

data class InvestmentsResponse(
    val investments: List<Investment> = emptyList(),
    val summary: PortfolioSummary? = null,
    val byType: Map<String, TypeGroup>? = null
)

data class PortfolioSummary(
    val totalCost: Double = 0.0,
    val totalValue: Double = 0.0,
    val totalProfit: Double = 0.0,
    val totalProfitRate: Double = 0.0
)

data class TypeGroup(
    val type_name: String = "",
    val icon: String? = null,
    val risk_level: String? = null,
    val total_cost: Double = 0.0,
    val total_value: Double = 0.0,
    val items: List<Investment> = emptyList()
)

data class CreateInvestmentRequest(
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("investment_type_id") val investmentTypeId: Int,
    val name: String,
    val code: String = "",
    @SerializedName("buy_price") val buyPrice: Double = 0.0,
    @SerializedName("current_price") val currentPrice: Double = 0.0,
    val quantity: Double = 0.0,
    @SerializedName("total_cost") val totalCost: Double = 0.0,
    @SerializedName("current_value") val currentValue: Double = 0.0,
    val fee: Double = 0.0,
    @SerializedName("buy_date") val buyDate: String = "",
    @SerializedName("expected_rate") val expectedRate: Double = 0.0,
    @SerializedName("risk_level") val riskLevel: String? = null,
    val note: String? = null
)

/** 编辑理财持仓 */
data class UpdateInvestmentRequest(
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("investment_type_id") val investmentTypeId: Int,
    val name: String,
    val code: String = "",
    @SerializedName("buy_price") val buyPrice: Double = 0.0,
    @SerializedName("current_price") val currentPrice: Double = 0.0,
    val quantity: Double = 0.0,
    @SerializedName("total_cost") val totalCost: Double = 0.0,
    @SerializedName("current_value") val currentValue: Double = 0.0,
    val fee: Double = 0.0,
    @SerializedName("buy_date") val buyDate: String = "",
    @SerializedName("expected_rate") val expectedRate: Double = 0.0,
    @SerializedName("risk_level") val riskLevel: String? = null,
    val note: String? = null
)

/* ----------------------------- AI 智能记账 ----------------------------- */

/** POST /ai/ocr 返回体 */
data class OcrResponse(
    val text: String = "",
    val items: List<OcrItem> = emptyList(),
    val reason: String? = null
)

/**
 * OCR 识别出的单条交易候选。
 * `category` 是后端给出的分类「名称」（如「午餐」），客户端需按名称匹配到本地分类 id。
 * `date` 形如 `2026-07-17 17:23:49`，也可能只有日期。
 */
data class OcrItem(
    val name: String = "",
    val amount: Double = 0.0,
    val type: String = "expense",
    val date: String? = null,
    val note: String? = null,
    val category: String? = null
)

/** GET /ai/ocr-config：判断是否已配置腾讯云 OCR 密钥 */
data class OcrConfig(
    val provider: String? = null,
    @SerializedName("secret_id") val secretId: String? = null,
    val region: String? = null,
    val credentialsValid: Boolean? = null,
    val credentialsError: String? = null
) {
    /** secret_id 为空表示尚未配置 */
    val configured: Boolean get() = !secretId.isNullOrBlank()
}

/* ----------------------------- 预算 ----------------------------- */

data class Budget(
    val id: Int = 0,
    val name: String = "",
    @SerializedName("period_type") val periodType: String = "month",
    @SerializedName("start_date") val startDate: String = "",
    @SerializedName("end_date") val endDate: String = "",
    val amount: Double = 0.0,
    val actual: Double = 0.0
)

data class CreateBudgetRequest(
    val name: String,
    val amount: Double,
    @SerializedName("period_type") val periodType: String = "month",
    @SerializedName("base_date") val baseDate: String? = null
)

data class UpdateBudgetRequest(
    val name: String,
    val amount: Double,
    @SerializedName("period_type") val periodType: String = "month",
    @SerializedName("base_date") val baseDate: String? = null
)

/* ----------------------------- 储蓄目标（存入/取回） ----------------------------- */

data class CreateSavingGoalRequest(
    val name: String,
    @SerializedName("target_amount") val targetAmount: Double,
    @SerializedName("account_id") val accountId: Int,
    @SerializedName("source_account_id") val sourceAccountId: Int,
    val icon: String? = "🎯",
    val note: String? = null
)

data class UpdateSavingGoalRequest(
    val name: String,
    @SerializedName("target_amount") val targetAmount: Double,
    @SerializedName("account_id") val accountId: Int,
    @SerializedName("source_account_id") val sourceAccountId: Int,
    val icon: String? = "🎯",
    val note: String? = null
)

data class SavingsAllocateRequest(
    val amount: Double,
    @SerializedName("account_id") val accountId: Int
)

data class SavingsWithdrawRequest(
    val amount: Double,
    @SerializedName("account_id") val accountId: Int
)

data class SavingsTxn(
    val type: String = "",
    val amount: Double = 0.0,
    val date: String = "",
    val note: String? = null,
    @SerializedName("account_name") val accountName: String? = null
)

data class SavingsTxnSummary(
    val deposit: Double = 0.0,
    val withdraw: Double = 0.0,
    val net: Double = 0.0
)

data class SavingsTxnResponse(
    val transactions: List<SavingsTxn> = emptyList(),
    val summary: SavingsTxnSummary? = null
)

/* ----------------------------- 债务（含还款） ----------------------------- */

data class DebtSubSummary(
    val remaining: Double = 0.0,
    val monthly: Double = 0.0,
    val count: Int = 0,
    val activeCount: Int = 0,
    val dueThisMonth: Double = 0.0,
    val dueAmount: Double = 0.0,
    val overdue: Int = 0,
    val overdueAmount: Double = 0.0
)

data class DebtListSummary(
    val totalRemaining: Double = 0.0,
    val totalMonthly: Double = 0.0,
    val dueThisMonth: Double = 0.0,
    val dueAmount: Double = 0.0,
    val overdue: Int = 0,
    val overdueAmount: Double = 0.0,
    val count: Int = 0,
    val activeCount: Int = 0,
    val netDebt: Double = 0.0,
    val payable: DebtSubSummary? = null,
    val receivable: DebtSubSummary? = null
)

data class DebtListResponse(
    val debts: List<Debt> = emptyList(),
    val summary: DebtListSummary? = null
)

data class Debt(
    val id: Int = 0,
    val name: String = "",
    val type: String = "loan",
    val direction: String = "payable",
    val creditor: String? = null,
    val principal: Double = 0.0,
    val remaining: Double = 0.0,
    @SerializedName("interest_rate") val interestRate: Double = 0.0,
    @SerializedName("term_months") val termMonths: Int = 0,
    val method: String = "equal_installment",
    @SerializedName("monthly_payment") val monthlyPayment: Double = 0.0,
    @SerializedName("min_payment") val minPayment: Double = 0.0,
    @SerializedName("start_date") val startDate: String = "",
    @SerializedName("due_date") val dueDate: String = "",
    @SerializedName("billing_day") val billingDay: Int? = null,
    @SerializedName("payment_day") val paymentDay: Int? = null,
    val note: String? = null,
    val status: String = "active",
    @SerializedName("paid_total") val paidTotal: Double = 0.0,
    @SerializedName("account_id") val accountId: Int? = null
)

data class DebtRepayment(
    val id: Int = 0,
    val amount: Double = 0.0,
    @SerializedName("principal_part") val principalPart: Double = 0.0,
    @SerializedName("interest_part") val interestPart: Double = 0.0,
    @SerializedName("paid_at") val paidAt: String = "",
    val note: String? = null,
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("account_name") val accountName: String? = null
)

data class DebtScheduleItem(
    val period: Int = 0,
    val payment: Double = 0.0,
    val principal: Double = 0.0,
    val interest: Double = 0.0,
    val remainAfter: Double = 0.0
)

data class DebtDetailResponse(
    val debt: Debt = Debt(),
    val repayments: List<DebtRepayment> = emptyList(),
    val schedule: List<DebtScheduleItem> = emptyList()
)

data class CreateDebtRequest(
    val name: String,
    val principal: Double,
    val direction: String = "payable",
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("interest_rate") val interestRate: Double = 0.0,
    @SerializedName("term_months") val termMonths: Int = 0,
    val method: String = "equal_installment",
    @SerializedName("monthly_payment") val monthlyPayment: Double = 0.0,
    @SerializedName("due_date") val dueDate: String? = null,
    val note: String? = null,
    val type: String = "loan",
    val creditor: String? = null
)

data class UpdateDebtRequest(
    val name: String,
    val principal: Double,
    val direction: String = "payable",
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("interest_rate") val interestRate: Double = 0.0,
    @SerializedName("term_months") val termMonths: Int = 0,
    val method: String = "equal_installment",
    @SerializedName("monthly_payment") val monthlyPayment: Double = 0.0,
    @SerializedName("due_date") val dueDate: String? = null,
    val note: String? = null,
    val type: String = "loan",
    val creditor: String? = null
)

data class CreateRepaymentRequest(
    val amount: Double,
    @SerializedName("paid_at") val paidAt: String? = null,
    val note: String? = null,
    @SerializedName("account_id") val accountId: Int,
    @SerializedName("principal_part") val principalPart: Double? = null,
    @SerializedName("interest_part") val interestPart: Double? = null
)

/* ----------------------------- 仪表盘 ----------------------------- */

data class Dashboard(
    val today: AmountOnly? = null,
    val week: IncomeExpense? = null,
    val month: IncomeExpense? = null,
    val year: IncomeExpense? = null,
    val months: List<MonthTrend> = emptyList(),
    val accounts: List<Account> = emptyList(),
    @SerializedName("investments") val inv: InvData? = null,
    @SerializedName("budgets") val budgetRows: List<BudgetRow> = emptyList(),
    @SerializedName("savingsGoals") val goalRows: List<SavingGoal> = emptyList(),
    @SerializedName("recentTransactions") val recentTrans: List<TransactionItem> = emptyList(),
    @SerializedName("debts") val debt: DebtSummary? = null,
    @SerializedName("netWorth") val netWorth: Double = 0.0,
    @SerializedName("totalAssets") val totalAssets: Double = 0.0,
    @SerializedName("totalSavings") val totalSavings: Double = 0.0,
    @SerializedName("savingsRate") val savingsRate: Double = 0.0
)

data class AmountOnly(val expense: Double = 0.0)
data class IncomeExpense(val income: Double = 0.0, val expense: Double = 0.0)
data class MonthTrend(val month: String = "", val income: Double = 0.0, val expense: Double = 0.0)
data class InvData(
    @SerializedName("totalCost") val totalCost: Double = 0.0,
    @SerializedName("totalValue") val totalValue: Double = 0.0,
    @SerializedName("totalProfit") val totalProfit: Double = 0.0,
    val holdings: List<HoldingRow> = emptyList()
)
data class BudgetRow(
    val id: Int = 0,
    val name: String = "",
    @SerializedName("start_date") val startDate: String = "",
    @SerializedName("end_date") val endDate: String = "",
    val amount: Double = 0.0,
    val actual: Double = 0.0
)
data class SavingGoal(
    val id: Int = 0,
    val name: String = "",
    val icon: String? = "🎯",
    @SerializedName("target_amount") val targetAmount: Double = 0.0,
    @SerializedName("current_amount") val currentAmount: Double = 0.0,
    val status: String = "active",
    @SerializedName("account_id") val accountId: Int? = null,
    @SerializedName("acc_name") val accName: String? = null,
    @SerializedName("source_account_id") val sourceAccountId: Int? = null,
    @SerializedName("source_acc_name") val sourceAccName: String? = null,
    val note: String? = null
)
data class HoldingRow(
    val name: String = "",
    val code: String? = null,
    @SerializedName("total_cost") val totalCost: Double = 0.0,
    @SerializedName("current_value") val currentValue: Double = 0.0,
    val profit: Double = 0.0,
    @SerializedName("profit_rate") val profitRate: Double = 0.0,
    @SerializedName("type_icon") val typeIcon: String? = null,
    @SerializedName("type_name") val typeName: String? = null
)
data class DebtSummary(
    @SerializedName("totalRemaining") val totalRemaining: Double = 0.0,
    @SerializedName("totalMonthly") val totalMonthly: Double = 0.0,
    @SerializedName("dueThisMonth") val dueThisMonth: Int = 0,
    @SerializedName("dueAmount") val dueAmount: Double = 0.0,
    val overdue: Int = 0,
    @SerializedName("overdueAmount") val overdueAmount: Double = 0.0,
    val count: Int = 0,
    val activeCount: Int = 0
)

/* ----------------------------- 报表 ----------------------------- */

/** GET /reports?type=&period= 的完整返回（仅声明用到字段，Gson 忽略其余） */
data class FinanceReport(
    val type: String = "",
    val period: String = "",
    val label: String = "",
    val summary: ReportSummary = ReportSummary(),
    @SerializedName("dailyTrend") val dailyTrend: List<DailyTrendPoint> = emptyList(),
    @SerializedName("expenseByCategory") val expenseByCategory: List<ReportCategorySlice> = emptyList(),
    @SerializedName("incomeByCategory") val incomeByCategory: List<ReportCategorySlice> = emptyList(),
    @SerializedName("topExpenses") val topExpenses: List<TopExpense> = emptyList(),
    val compare: ReportCompare? = null
)

data class ReportSummary(
    val income: Double = 0.0,
    val expense: Double = 0.0,
    val balance: Double = 0.0,
    @SerializedName("savingsRate") val savingsRate: Double = 0.0,
    @SerializedName("transactionCount") val transactionCount: Int = 0,
    @SerializedName("avgDailyExpense") val avgDailyExpense: Double = 0.0
)

/** 分类占比切片（支出/收入共用）。total 即该分类在周期内的发生额。 */
data class ReportCategorySlice(
    val id: Int = 0,
    val name: String = "",
    val icon: String? = null,
    @SerializedName("parent_id") val parentId: Int? = null,
    val total: Double = 0.0
)

data class DailyTrendPoint(
    val date: String = "",
    val income: Double = 0.0,
    val expense: Double = 0.0
)

data class TopExpense(
    val id: Int = 0,
    val date: String = "",
    val amount: Double = 0.0,
    val note: String? = null,
    @SerializedName("category_name") val categoryName: String? = null,
    @SerializedName("category_icon") val categoryIcon: String? = null
)

/** 环比：与上个周期对比 */
data class ReportCompare(
    val period: String = "",
    val label: String = "",
    val income: Double = 0.0,
    val expense: Double = 0.0,
    val balance: Double = 0.0
)

/* ----------------------------- 标签 ----------------------------- */

data class Tag(
    val id: Int = 0,
    val name: String = "",
    val color: String = "#3b82f6",
    val icon: String = "🏷️"
)

data class CreateTagRequest(val name: String, val color: String, val icon: String)
data class UpdateTagRequest(val name: String, val color: String, val icon: String)

/* ----------------------------- 数据导入导出 ----------------------------- */

data class ImportCsvRequest(val type: String, val csv: String)

data class CsvImportResult(
    val imported: Int = 0,
    val errors: List<String> = emptyList()
)
