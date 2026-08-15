package com.xinwallet.app.data.repository

import com.xinwallet.app.data.model.CreateBookRequest
import com.xinwallet.app.data.model.UpdateBookRequest
import com.xinwallet.app.data.remote.ApiService
import com.xinwallet.app.data.remote.safeApiCall
import com.xinwallet.app.data.remote.safeUnitCall

class BookRepository(private val apiProvider: () -> ApiService) {
    suspend fun getBooks() = safeApiCall { apiProvider().getBooks() }
    suspend fun create(req: CreateBookRequest) = safeApiCall { apiProvider().createBook(req) }
    suspend fun update(id: Int, req: UpdateBookRequest) = safeApiCall { apiProvider().updateBook(id, req) }
    suspend fun switch(id: Int) = safeApiCall { apiProvider().switchBook(id) }
    suspend fun delete(id: Int) = safeUnitCall { apiProvider().deleteBook(id) }
}
