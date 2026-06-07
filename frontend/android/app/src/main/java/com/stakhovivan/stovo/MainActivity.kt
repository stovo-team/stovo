package com.stakhovivan.stovo

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(NtfyPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
