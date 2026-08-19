package com.xinwallet.app.data.remote

import com.xinwallet.app.data.model.*
import com.xinwallet.app.data.model.Tag
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    /* 鉴权 */
    @POST("auth/login")
    suspend fun login(@Body req: LoginRequest): Response<ApiResponse<AuthResponse>>

    @POST("auth/refresh")
    suspend fun refresh(@Body req: RefreshRequest): Response<ApiResponse<AuthResponse>>

    @POST("auth/demo")
    suspend fun demoLogin(): Response<ApiResponse<AuthResponse>>

    @GET("auth/config")
    suspend fun authConfig(): Response<ApiResponse<AuthConfigResponse>>

    @GET("auth/profile")
    suspend fun profile(): Response<ApiResponse<UserWrapper>>

    @PUT("auth/profile")
    suspend fun updateProfile(@Body req: UpdateProfileRequest): Response<ApiResponse<UserWrapper>>

    /* 账户 */
    @GET("accounts")
    suspend fun getAccounts(@Query("all") all: Boolean? = null): Response<ApiResponse<AccountsResponse>>

    @POST("accounts")
    suspend fun createAccount(@Body req: CreateAccountRequest): Response<ApiResponse<IdResponse>>

    @PUT("accounts/{id}")
    suspend fun updateAccount(@Path("id") id: Int, @Body req: UpdateAccountRequest): Response<ApiResponse<Unit>>

    @POST("accounts/{id}/close")
    suspend fun closeAccount(@Path("id") id: Int): Response<ApiResponse<Unit>>

    @DELETE("accounts/{id}")
    suspend fun deleteAccount(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 交易 */
    @GET("transactions")
    suspend fun getTransactions(
        @Query("month") month: String? = null,
        @Query("type") type: String? = null,
        @Query("account_id") accountId: Int? = null,
        @Query("search") search: String? = null,
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null,
        @Query("min_amount") minAmount: Double? = null,
        @Query("max_amount") maxAmount: Double? = null,
        @Query("types") types: String? = null,
        @Query("limit") limit: Int = 50
    ): Response<ApiResponse<List<TransactionItem>>>

    @POST("transactions")
    suspend fun createTransaction(@Body req: CreateTransactionRequest): Response<ApiResponse<IdResponse>>

    @PUT("transactions/{id}")
    suspend fun updateTransaction(@Path("id") id: Int, @Body req: UpdateTransactionRequest): Response<ApiResponse<Unit>>

    @DELETE("transactions/{id}")
    suspend fun deleteTransaction(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /** 有交易记录的月份列表（倒序 YYYY-MM） */
    @GET("transactions/months")
    suspend fun getTransactionMonths(): Response<ApiResponse<List<String>>>

    /** 指定月份的收支汇总与分类占比 */
    @GET("transactions/summary")
    suspend fun getTransactionSummary(@Query("month") month: String): Response<ApiResponse<TxSummary>>

    /* 转账 */
    @GET("transfers")
    suspend fun getTransfers(@Query("month") month: String? = null): Response<ApiResponse<List<Transfer>>>

    @POST("transfers")
    suspend fun createTransfer(@Body req: CreateTransferRequest): Response<ApiResponse<IdResponse>>

    @DELETE("transfers/{id}")
    suspend fun deleteTransfer(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 分类 */
    @GET("categories?flat=1")
    suspend fun getCategories(): Response<ApiResponse<List<Category>>>

    @POST("categories")
    suspend fun createCategory(@Body req: CreateCategoryRequest): Response<ApiResponse<IdResponse>>

    @PUT("categories/{id}")
    suspend fun updateCategory(@Path("id") id: Int, @Body req: UpdateCategoryRequest): Response<ApiResponse<Unit>>

    @DELETE("categories/{id}")
    suspend fun deleteCategory(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 理财 */
    @GET("investment-types")
    suspend fun getInvestmentTypes(): Response<ApiResponse<List<InvestmentType>>>

    @GET("investments/investments")
    suspend fun getInvestments(@Query("includeSold") includeSold: Boolean = false): Response<ApiResponse<InvestmentsResponse>>

    @POST("investments/investments")
    suspend fun createInvestment(@Body req: CreateInvestmentRequest): Response<ApiResponse<IdResponse>>

    @PUT("investments/investments/{id}")
    suspend fun updateInvestment(@Path("id") id: Int, @Body req: UpdateInvestmentRequest): Response<ApiResponse<Unit>>

    @DELETE("investments/investments/{id}")
    suspend fun deleteInvestment(@Path("id") id: Int): Response<ApiResponse<Unit>>

    @GET("investments/investments/{id}/transactions")
    suspend fun getInvestmentTransactions(@Path("id") id: Int): Response<ApiResponse<List<InvestmentTransaction>>>

    @DELETE("investments/investments/{investmentId}/transactions/{txnId}")
    suspend fun deleteInvestmentTransaction(
        @Path("investmentId") investmentId: Int,
        @Path("txnId") txnId: Int
    ): Response<ApiResponse<Unit>>

    /* 仪表盘 */
    @GET("stats/dashboard")
    suspend fun getDashboard(): Response<ApiResponse<Dashboard>>

    /** 首页日历视图：返回某月每日 {date, income, expense, hasRecord} + monthSummary */
    @GET("stats/calendar")
    suspend fun getStatsCalendar(
        @Query("year") year: Int,
        @Query("month") month: Int
    ): Response<ApiResponse<CalendarSummary>>

    /* AI 智能记账 */
    /** 上传账单图片做 OCR + 交易项提取，multipart 字段名必须是 image（后端 multer 约定） */
    @Multipart
    @POST("ai/ocr")
    suspend fun ocr(@Part image: MultipartBody.Part): Response<ApiResponse<OcrResponse>>

    /** 查询腾讯云 OCR 密钥配置状态，用于提前提示用户去 Web 端配置 */
    @GET("ai/ocr-config")
    suspend fun getOcrConfig(): Response<ApiResponse<OcrConfig>>

    /** AI 对话记账：文字 / 截图多模态，后端用 function calling 真正建账 */
    @POST("ai/chat")
    suspend fun chat(@Body req: ChatRequest): Response<ApiResponse<ChatResponse>>

    /** 语音转文字（云端回退）：audio 为 base64 */
    @POST("ai/transcribe")
    suspend fun transcribe(@Body req: TranscribeRequest): Response<ApiResponse<TranscribeResponse>>

    /* 预算 */
    @GET("budgets")
    suspend fun getBudgets(): Response<ApiResponse<List<Budget>>>

    @POST("budgets")
    suspend fun createBudget(@Body req: CreateBudgetRequest): Response<ApiResponse<IdResponse>>

    @PUT("budgets/{id}")
    suspend fun updateBudget(@Path("id") id: Int, @Body req: UpdateBudgetRequest): Response<ApiResponse<Unit>>

    @DELETE("budgets/{id}")
    suspend fun deleteBudget(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 储蓄目标 */
    @GET("savings-goals")
    suspend fun getSavingsGoals(): Response<ApiResponse<List<SavingGoal>>>

    @POST("savings-goals")
    suspend fun createSavingsGoal(@Body req: CreateSavingGoalRequest): Response<ApiResponse<IdResponse>>

    @PUT("savings-goals/{id}")
    suspend fun updateSavingsGoal(@Path("id") id: Int, @Body req: UpdateSavingGoalRequest): Response<ApiResponse<Unit>>

    @DELETE("savings-goals/{id}")
    suspend fun deleteSavingsGoal(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /** 存入：从来源账户转账到目标关联的储蓄账户 */
    @POST("savings-goals/{id}/allocate")
    suspend fun allocateSavings(@Path("id") id: Int, @Body req: SavingsAllocateRequest): Response<ApiResponse<Unit>>

    /** 取回：从目标关联的储蓄账户转账到目标账户 */
    @POST("savings-goals/{id}/withdraw")
    suspend fun withdrawSavings(@Path("id") id: Int, @Body req: SavingsWithdrawRequest): Response<ApiResponse<Unit>>

    @GET("savings-goals/{id}/transactions")
    suspend fun getSavingsTxns(@Path("id") id: Int): Response<ApiResponse<SavingsTxnResponse>>

    /* 债务 */
    @GET("debts")
    suspend fun getDebts(): Response<ApiResponse<DebtListResponse>>

    @POST("debts")
    suspend fun createDebt(@Body req: CreateDebtRequest): Response<ApiResponse<IdResponse>>

    @PUT("debts/{id}")
    suspend fun updateDebt(@Path("id") id: Int, @Body req: UpdateDebtRequest): Response<ApiResponse<Unit>>

    @DELETE("debts/{id}")
    suspend fun deleteDebt(@Path("id") id: Int): Response<ApiResponse<Unit>>

    @GET("debts/{id}")
    suspend fun getDebt(@Path("id") id: Int): Response<ApiResponse<DebtDetailResponse>>

    /** 添加还款/收款记录（按 direction 分叉） */
    @POST("debts/{id}/repayments")
    suspend fun createRepayment(@Path("id") id: Int, @Body req: CreateRepaymentRequest): Response<ApiResponse<Unit>>

    @DELETE("debts/{id}/repayments/{rid}")
    suspend fun deleteRepayment(@Path("id") id: Int, @Path("rid") rid: Int): Response<ApiResponse<Unit>>

    /* 报表 */
    @GET("reports")
    suspend fun getReport(
        @Query("type") type: String,
        @Query("period") period: String
    ): Response<ApiResponse<FinanceReport>>

    @GET("reports/top-transactions")
    suspend fun getTopTransactions(
        @Query("type") type: String,
        @Query("period") period: String
    ): Response<ApiResponse<TopTransactionsResponse>>

    /* 标签 */
    @GET("tags")
    suspend fun getTags(): Response<ApiResponse<List<Tag>>>

    @POST("tags")
    suspend fun createTag(@Body req: CreateTagRequest): Response<ApiResponse<IdResponse>>

    @PUT("tags/{id}")
    suspend fun updateTag(@Path("id") id: Int, @Body req: UpdateTagRequest): Response<ApiResponse<Unit>>

    @DELETE("tags/{id}")
    suspend fun deleteTag(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 多账本（账套） */
    @GET("books")
    suspend fun getBooks(): Response<ApiResponse<BooksResponse>>

    @POST("books")
    suspend fun createBook(@Body req: CreateBookRequest): Response<ApiResponse<BookIdResponse>>

    @PUT("books/{id}")
    suspend fun updateBook(@Path("id") id: Int, @Body req: UpdateBookRequest): Response<ApiResponse<Unit>>

    @POST("books/{id}/switch")
    suspend fun switchBook(@Path("id") id: Int): Response<ApiResponse<SwitchBookResponse>>

    @DELETE("books/{id}")
    suspend fun deleteBook(@Path("id") id: Int): Response<ApiResponse<Unit>>

}
