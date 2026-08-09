package com.xinwallet.app.di

import android.content.Context
import com.google.gson.GsonBuilder
import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.AuthInterceptor
import com.xinwallet.app.data.repository.AccountRepository
import com.xinwallet.app.data.repository.AuthRepository
import com.xinwallet.app.data.repository.DashboardRepository
import com.xinwallet.app.data.repository.InvestmentRepository
import com.xinwallet.app.data.repository.TransactionRepository
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * 轻量手动依赖容器：在 Application.onCreate 初始化，避免引入额外 DI 框架。
 * 支持运行时切换 NAS 基地址（setBaseUrl 重建 Retrofit）。
 */
object AppContainer {

    lateinit var sessionManager: SessionManager
        private set
    lateinit var api: ApiService
        private set

    lateinit var authRepository: AuthRepository
        private set
    lateinit var accountRepository: AccountRepository
        private set
    lateinit var transactionRepository: TransactionRepository
        private set
    lateinit var investmentRepository: InvestmentRepository
        private set
    lateinit var categoryRepository: CategoryRepository
        private set
    lateinit var dashboardRepository: DashboardRepository
        private set

    private lateinit var retrofit: Retrofit
    private lateinit var okHttpClient: OkHttpClient

    fun init(context: Context, session: SessionManager) {
        sessionManager = session

        val gson = GsonBuilder().setLenient().create()
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val interceptor = AuthInterceptor(session) { if (::api.isInitialized) api else null }
        okHttpClient = OkHttpClient.Builder()
            .addInterceptor(interceptor)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()

        val baseUrl = runBlocking { session.baseUrl() }.ifBlank { "http://127.0.0.1:18888/api/" }
        retrofit = buildRetrofit(baseUrl, gson)
        api = retrofit.create(ApiService::class.java)

        authRepository = AuthRepository(session, api)
        accountRepository = AccountRepository(api)
        transactionRepository = TransactionRepository(api)
        investmentRepository = InvestmentRepository(api)
        dashboardRepository = DashboardRepository(api)
        categoryRepository = CategoryRepository(api)
    }

    private fun buildRetrofit(baseUrl: String, gson: com.google.gson.Gson): Retrofit {
        val safe = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"
        return Retrofit.Builder()
            .baseUrl(safe)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    /** 用户配置 NAS 地址后重建 Retrofit 实例 */
    fun setBaseUrl(baseUrl: String) {
        retrofit = buildRetrofit(baseUrl, GsonBuilder().setLenient().create())
        api = retrofit.create(ApiService::class.java)
    }
}
