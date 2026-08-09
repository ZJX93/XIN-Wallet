package com.xinwallet.app.data.remote

import com.xinwallet.app.data.model.*
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
        @Query("limit") limit: Int = 50
    ): Response<ApiResponse<List<TransactionItem>>>

    @POST("transactions")
    suspend fun createTransaction(@Body req: CreateTransactionRequest): Response<ApiResponse<IdResponse>>

    @DELETE("transactions/{id}")
    suspend fun deleteTransaction(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 转账 */
    @GET("transfers")
    suspend fun getTransfers(@Query("month") month: String? = null): Response<ApiResponse<List<Transfer>>>

    @POST("transfers")
    suspend fun createTransfer(@Body req: CreateTransferRequest): Response<ApiResponse<IdResponse>>

    /* 分类 */
    @GET("categories")
    suspend fun getCategories(): Response<ApiResponse<List<Category>>>

    /* 理财 */
    @GET("investment-types")
    suspend fun getInvestmentTypes(): Response<ApiResponse<List<InvestmentType>>>

    @GET("investments")
    suspend fun getInvestments(): Response<ApiResponse<InvestmentsResponse>>

    @POST("investments")
    suspend fun createInvestment(@Body req: CreateInvestmentRequest): Response<ApiResponse<IdResponse>>

    @DELETE("investments/{id}")
    suspend fun deleteInvestment(@Path("id") id: Int): Response<ApiResponse<Unit>>

    /* 仪表盘 */
    @GET("stats/dashboard")
    suspend fun getDashboard(): Response<ApiResponse<Dashboard>>
}
