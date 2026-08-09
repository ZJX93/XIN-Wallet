package com.xinwallet.app

import android.app.Application
import com.xinwallet.app.data.local.SessionManager

class XWalletApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppContainer.init(this, SessionManager(this))
    }
}
