package com.stakhovivan.stovo

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "NtfyPlugin",
    permissions = [
        Permission(
            strings = [android.Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications"
        )
    ]
)
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

    @PluginMethod
    fun checkFullScreenIntent(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // API 34+ — canUseFullScreenIntent() added in Android 14
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (!nm.canUseFullScreenIntent()) {
                // Open Special App Access settings for USE_FULL_SCREEN_INTENT
                val intent = Intent(
                    Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    android.net.Uri.parse("package:${context.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
            }
        }
        // Below API 34 or already granted: resolve immediately with no action
        call.resolve()
    }

    /**
     * Request POST_NOTIFICATIONS permission (Android 13+ / API 33+).
     * On older APIs the permission does not exist and is considered granted.
     * Returns { granted: boolean }.
     */
    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // POST_NOTIFICATIONS does not exist below API 33 — always granted
            call.resolve(JSObject().put("granted", true))
            return
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("notifications", call, "handleNotificationPermissionResult")
    }

    @PermissionCallback
    private fun handleNotificationPermissionResult(call: PluginCall) {
        val granted = getPermissionState("notifications") == PermissionState.GRANTED
        call.resolve(JSObject().put("granted", granted))
    }
}
