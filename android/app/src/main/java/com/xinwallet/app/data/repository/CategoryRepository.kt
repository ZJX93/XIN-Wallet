package com.xinwallet.app.data.repository

import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class CategoryRepository(private val apiProvider: () -> ApiService) {
    suspend fun getCategories() = safeApiCall { apiProvider().getCategories() }
}
