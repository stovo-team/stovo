package com.stakhovivan.stovo

import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(NtfyPlugin::class.java)
        registerPlugin(CallPlugin::class.java)
        registerPlugin(AudioPlaybackPlugin::class.java)
        registerPlugin(ShareReceiverPlugin::class.java)
        registerPlugin(AppLockPlugin::class.java)
        super.onCreate(savedInstanceState)
        ShareReceiverPlugin.captureIntent(this, intent)

        setupSystemBars()
    }

    private fun setupSystemBars() {
        val window = window
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }

        val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
        windowInsetsController.isAppearanceLightStatusBars = false
        windowInsetsController.isAppearanceLightNavigationBars = false
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        ShareReceiverPlugin.captureIntent(this, intent)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        CallPlugin.handleUserLeaveHint(this)
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        CallPlugin.handlePictureInPictureModeChanged(isInPictureInPictureMode)
    }
}

