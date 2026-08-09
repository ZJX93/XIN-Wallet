package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CsvImportResult
import com.xinwallet.app.data.model.ImportCsvRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import okhttp3.ResponseBody

/**
 * 数据导入导出仓库。
 * 导出接口后端直接返回纯文本（CSV / JSON），不走 {success,data,message} 包装，
 * 因此单独处理 ResponseBody；导入接口仍是标准包装体。
 */
class CsvRepository(private val apiProvider: () -> ApiService) {

    private suspend fun bodyToString(resp: retrofit2.Response<ResponseBody>): ApiResult<String> = try {
        if (resp.isSuccessful) ApiResult.Success(resp.body()?.string().orEmpty())
        else ApiResult.Error("导出失败（HTTP ${resp.code()}）")
    } catch (e: Exception) {
        ApiResult.Error(e.message ?: "网络异常")
    }

    suspend fun exportCsv(type: String): ApiResult<String> = bodyToString(apiProvider().exportCsv(type))

    suspend fun exportFull(): ApiResult<String> = bodyToString(apiProvider().exportFull())

    suspend fun importCsv(type: String, csv: String): ApiResult<CsvImportResult> =
        safeApiCall { apiProvider().importCsv(ImportCsvRequest(type, csv)) }
}
