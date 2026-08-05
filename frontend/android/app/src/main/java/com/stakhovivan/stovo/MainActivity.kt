package com.stakhovivan.stovo

import android.content.res.Configuration
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(NtfyPlugin::class.java)
        registerPlugin(CallPlugin::class.java)
        registerPlugin(AudioPlaybackPlugin::class.java)
        registerPlugin(ShareReceiverPlugin::class.java)
        registerPlugin(AppLockPlugin::class.java)
        super.onCreate(savedInstanceState)
        ShareReceiverPlugin.captureIntent(this, intent)
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
