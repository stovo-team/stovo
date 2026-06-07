package com.stakhovivan.stovo

import android.content.Intent
import androidx.core.content.ContextCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "NtfyPlugin")
class NtfyPlugin : Plugin() {

    @PluginMethod
    fun startService(call: PluginCall) {
        val topic = call.getString("topic") ?: run {
            call.reject("topic required")
            return
        }
        val ntfyBaseUrl = call.getString("ntfyBaseUrl") ?: run {
            call.reject("ntfyBaseUrl required")
            return
        }
        val intent = Intent(context, NtfyService::class.java).apply {
            action = NtfyService.ACTION_START
            putExtra(NtfyService.EXTRA_TOPIC, topic)
            putExtra(NtfyService.EXTRA_NTFY_BASE_URL, ntfyBaseUrl)
        }
        ContextCompat.startForegroundService(context, intent)
        call.resolve()
    }

    @PluginMethod
    fun stopService(call: PluginCall) {
        val intent = Intent(context, NtfyService::class.java).apply {
            action = NtfyService.ACTION_STOP
        }
        context.startService(intent)
        call.resolve()
    }
}
