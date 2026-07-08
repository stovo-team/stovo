package com.stakhovivan.stovo

import android.content.res.Configuration
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(NtfyPlugin::class.java)
        registerPlugin(CallPlugin::class.java)
        super.onCreate(savedInstanceState)
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
