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

/* ----------------------------- 仪表盘 ----------------------------- */

data class Dashboard(
    val today: AmountOnly? = null,
    val week: IncomeExpense? = null,
    val month: IncomeExpense? = null,
    val year: IncomeExpense? = null,
    val months: List<MonthTrend> = emptyList(),
    val accounts: List<Account> = emptyList(),
    val invSummary: InvSummary? = null,
    val budgetRows: List<BudgetRow> = emptyList(),
    val goalRows: List<SavingGoal> = emptyList(),
    val holdingRows: List<HoldingRow> = emptyList(),
    val recentTrans: List<Transaction> = emptyList(),
    val debtSum: DebtSummary? = null
)

data class AmountOnly(val expense: Double = 0.0)
data class IncomeExpense(val income: Double = 0.0, val expense: Double = 0.0)
data class MonthTrend(val month: String = "", val income: Double = 0.0, val expense: Double = 0.0)
data class InvSummary(
    @SerializedName("total_cost") val totalCost: Double = 0.0,
    @SerializedName("total_value") val totalValue: Double = 0.0
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
    val status: String = "active"
)
data class HoldingRow(
    val name: String = "",
    val code: String? = null,
    @SerializedName("total_cost") val totalCost: Double = 0.0,
    @SerializedName("current_value") val currentValue: Double = 0.0,
    val profit: Double = 0.0,
    @SerializedName("type_icon") val typeIcon: String? = null,
    @SerializedName("type_name") val typeName: String? = null
)
data class DebtSummary(
    val payable: Double = 0.0,
    val receivable: Double = 0.0
)
