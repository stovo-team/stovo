package com.stakhovivan.stovo

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.firebase.messaging.FirebaseMessaging

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

    companion object {
        @Volatile
        private var activeInstance: NtfyPlugin? = null

        fun broadcastTokenUpdate(token: String) {
            activeInstance?.notifyListeners("tokenRefresh", JSObject().put("token", token))
        }
    }

    override fun load() {
        super.load()
        activeInstance = this
    }

    override fun handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null
        }
        super.handleOnDestroy()
    }

    /**
     * Legacy startService retained for backward compatibility with JS callers.
     * With FCM, no persistent foreground service is required.
     */
    @PluginMethod
    fun startService(call: PluginCall) {
        StovoFirebaseMessagingService.updateNotificationSchedule(
            context,
            call.getBoolean("quietHoursEnabled") ?: false,
            call.getString("quietHoursStart") ?: "22:00",
            call.getString("quietHoursEnd") ?: "07:00"
        )
        call.resolve()
    }

    /**
     * Legacy stopService retained for backward compatibility with JS callers.
     * No background foreground service is running.
     */
    @PluginMethod
    fun stopService(call: PluginCall) {
        call.resolve()
    }

    /**
     * Fetches the device FCM registration token.
     */
    @PluginMethod
    fun getPushToken(call: PluginCall) {
        val cached = StovoFirebaseMessagingService.getCachedToken(context)
        if (!cached.isNullOrEmpty()) {
            call.resolve(JSObject().put("token", cached))
            return
        }

        try {
            FirebaseMessaging.getInstance().token
                .addOnCompleteListener { task ->
                    if (task.isSuccessful && task.result != null) {
                        val token = task.result
                        context.getSharedPreferences(
                            StovoFirebaseMessagingService.PREFS_NAME,
                            Context.MODE_PRIVATE
                        ).edit()
                            .putString(StovoFirebaseMessagingService.PREF_FCM_TOKEN, token)
                            .apply()
                        call.resolve(JSObject().put("token", token))
                    } else {
                        android.util.Log.w("NtfyPlugin", "FCM get token failed", task.exception)
                        call.resolve(JSObject().put("token", null))
                    }
                }
        } catch (e: Exception) {
            android.util.Log.w("NtfyPlugin", "Firebase messaging not available: ${e.message}")
            call.resolve(JSObject().put("token", null))
        }
    }

    /** Update delivery behavior immediately; the service reads this before every push. */
    @PluginMethod
    fun updateNotificationSchedule(call: PluginCall) {
        StovoFirebaseMessagingService.updateNotificationSchedule(
            context,
            call.getBoolean("quietHoursEnabled") ?: false,
            call.getString("quietHoursStart") ?: "22:00",
            call.getString("quietHoursEnd") ?: "07:00"
        )
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

    /**
     * Dismiss the active incoming-call notification (if any).
     * Called from JS when the user accepts, declines, or the call ends/times out,
     * so the ringing notification is cleared regardless of how the call resolves.
     */
    @PluginMethod
    fun dismissCallNotification(call: PluginCall) {
        val id = StovoFirebaseMessagingService.activeCallNotificationId
        if (id != null) {
            NotificationManagerCompat.from(context).cancel(id)
            StovoFirebaseMessagingService.activeCallNotificationId = null
        }
        call.resolve()
    }

    /** Dismiss all chat-specific notifications after the user opens its chat. */
    @PluginMethod
    fun dismissChatNotifications(call: PluginCall) {
        val chatId = call.getString("chatId")?.trim()
        if (!chatId.isNullOrEmpty()) {
            MessageNotificationStack.clear(chatId)
            NotificationManagerCompat.from(context).apply {
                cancel(messageNotificationId(chatId))
                cancel(missedCallNotificationId(chatId))
            }
        }
        call.resolve()
    }

    /** Return and remove the pending notification action so it cannot be replayed. */
    @PluginMethod
    fun consumePendingNotificationAction(call: PluginCall) {
        val action = NotificationActionReceiver.readAndClearPendingAction(context)
        val response = JSObject()
        if (action != null) {
            val actionJson = JSObject()
                .put("type", action.type)
                .put("chatId", action.chatId)
            action.text?.let { actionJson.put("text", it) }
            response.put("action", actionJson)
        }
        call.resolve(response)
    }
}
