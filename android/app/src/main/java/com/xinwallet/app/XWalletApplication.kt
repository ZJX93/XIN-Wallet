package com.xinwallet.app

import android.app.Application
import com.xinwallet.app.data.local.SessionManager
import com.xinwallet.app.di.AppContainer

class XWalletApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppContainer.init(this, SessionManager(this))
    }
}
