package com.xinwallet.app.di

import android.content.Context
import com.google.gson.GsonBuilder
import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.AuthInterceptor
import com.xinwallet.app.data.repository.AccountRepository
import com.xinwallet.app.data.repository.AiRepository
import com.xinwallet.app.data.repository.CategoryRepository
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
    lateinit var aiRepository: AiRepository
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
            // OCR 走「腾讯云识别 + 大模型抽取」，端到端可能十几秒，读写超时放宽到 60s
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()

        // 首次未配置地址时使用占位符，避免 Retrofit baseUrl 为空崩溃；UI 会强制用户填写真实地址。
        val saved = normalizeBaseUrl(runBlocking { session.baseUrl() })
        val baseUrl = saved.ifBlank { "http://localhost/api/" }
        retrofit = buildRetrofit(baseUrl, gson)
        api = retrofit.create(ApiService::class.java)

        // Repository 通过 provider 获取当前 api，运行时 setBaseUrl 重建 api 后立即生效。
        authRepository = AuthRepository(session) { api }
        accountRepository = AccountRepository { api }
        transactionRepository = TransactionRepository { api }
        investmentRepository = InvestmentRepository { api }
        dashboardRepository = DashboardRepository { api }
        categoryRepository = CategoryRepository { api }
        aiRepository = AiRepository { api }
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

    /**
     * 标准化 NAS 基地址：trim、去末尾斜杠、自动补全 `/api/` 后缀。
     * 用户可能输入 `https://nas.com:18888` 或 `https://nas.com:18888/`，
     * 统一输出 `https://nas.com:18888/api/`；空字符串则返回空。
     */
    fun normalizeBaseUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.isBlank()) return ""
        val withoutTrailingSlash = trimmed.trimEnd('/')
        val withApi = if (withoutTrailingSlash.endsWith("/api")) withoutTrailingSlash else "$withoutTrailingSlash/api"
        return "$withApi/"
    }
}
