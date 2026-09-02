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
        registerPlugin(VoiceRecordingPlugin::class.java)
        registerPlugin(ShareReceiverPlugin::class.java)
        registerPlugin(AppLockPlugin::class.java)
        registerPlugin(LocalReplicaPlugin::class.java)
        registerPlugin(BackgroundUploadPlugin::class.java)
        registerPlugin(MediaLibraryPlugin::class.java)
        registerPlugin(NativeSharePlugin::class.java)
        registerPlugin(ScreenCapturePlugin::class.java)
        super.onCreate(savedInstanceState)
        ShareReceiverPlugin.captureIntent(this, intent)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        setupSystemBars()
    }

    private fun setupSystemBars() {
        val window = window

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.BLACK
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.BLACK

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                @Suppress("DEPRECATION")
                window.isStatusBarContrastEnforced = false
                @Suppress("DEPRECATION")
                window.isNavigationBarContrastEnforced = false
            }
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
