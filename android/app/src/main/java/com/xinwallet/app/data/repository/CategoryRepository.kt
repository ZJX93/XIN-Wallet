package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateCategoryRequest
import com.xinwallet.app.data.model.UpdateCategoryRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall

class CategoryRepository(private val apiProvider: () -> ApiService) {
    suspend fun getCategories() = safeApiCall { apiProvider().getCategories() }
    suspend fun create(req: CreateCategoryRequest) = safeApiCall { apiProvider().createCategory(req) }
    suspend fun update(id: Int, req: UpdateCategoryRequest) = safeApiCall { apiProvider().updateCategory(id, req) }
    suspend fun delete(id: Int) = safeApiCall { apiProvider().deleteCategory(id) }
}
