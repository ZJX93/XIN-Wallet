package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateTagRequest
import com.xinwallet.app.data.model.UpdateTagRequest
import com.xinwallet.app.data.remote.ApiResult
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class TagRepository(private val apiProvider: () -> ApiService) {
    suspend fun getTags() = safeApiCall { apiProvider().getTags() }
    suspend fun create(req: CreateTagRequest) = safeApiCall { apiProvider().createTag(req) }
    suspend fun update(id: Int, req: UpdateTagRequest) = safeApiCall { apiProvider().updateTag(id, req) }
    suspend fun delete(id: Int) = safeUnitCall { apiProvider().deleteTag(id) }
}
