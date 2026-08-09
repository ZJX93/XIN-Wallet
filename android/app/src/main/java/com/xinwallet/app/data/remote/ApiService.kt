package com.xinwallet.app.data.remote

import com.xinwallet.app.data.model.*
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

    @GET("auth/profile")
    suspend fun profile(): Response<ApiResponse<UserWrapper>>

    /* 账户 */
    @GET("accounts")
    suspend fun getAccounts(): Response<ApiResponse<AccountsResponse>>

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

    /* 理财 */
    @GET("investment-types")
    suspend fun getInvestmentTypes(): Response<ApiResponse<List<InvestmentType>>>

    @GET("investments/investments")
    suspend fun getInvestments(): Response<ApiResponse<InvestmentsResponse>>

    @POST("investments/investments")
    suspend fun createInvestment(@Body req: CreateInvestmentRequest): Response<ApiResponse<IdResponse>>

    @PUT("investments/investments/{id}")
    suspend fun updateInvestment(@Path("id") id: Int, @Body req: UpdateInvestmentRequest): Response<ApiResponse<Unit>>

    @DELETE("investments/investments/{id}")
    suspend fun deleteInvestment(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 仪表盘 */
    @GET("stats/dashboard")
    suspend fun getDashboard(): Response<ApiResponse<Dashboard>>

    /* AI 智能记账 */
    /** 上传账单图片做 OCR + 交易项提取，multipart 字段名必须是 image（后端 multer 约定） */
    @Multipart
    @POST("ai/ocr")
    suspend fun ocr(@Part image: MultipartBody.Part): Response<ApiResponse<OcrResponse>>

    /** 查询腾讯云 OCR 密钥配置状态，用于提前提示用户去 Web 端配置 */
    @GET("ai/ocr-config")
    suspend fun getOcrConfig(): Response<ApiResponse<OcrConfig>>
}
