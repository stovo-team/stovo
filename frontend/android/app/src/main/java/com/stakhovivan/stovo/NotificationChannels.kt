package com.stakhovivan.stovo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationManagerCompat

object NotificationChannels {

    // v3: IMPORTANCE_LOW is the correct minimum for foreground services.
    // IMPORTANCE_MIN triggers an extra system notification on Android 8+.
    const val SERVICE_CHANNEL_ID = "stovo_service_v3"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = NotificationManagerCompat.from(context)

            // Remove superseded service channels so users don't see stale entries.
            nm.deleteNotificationChannel("stovo_service")
            nm.deleteNotificationChannel("stovo_service_v2")

            val messagesChannel = NotificationChannel(
                "stovo_messages",
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            )

            val callsChannel = NotificationChannel(
                "stovo_calls",
                "Calls",
                NotificationManager.IMPORTANCE_HIGH
            )
            callsChannel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC

            // IMPORTANCE_LOW: silent, no peek — lowest level Android allows for
            // foreground services without adding a second system warning notification.
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Background connection",
                NotificationManager.IMPORTANCE_LOW
            )
            serviceChannel.setShowBadge(false)
            serviceChannel.enableLights(false)
            serviceChannel.enableVibration(false)
            serviceChannel.setSound(null, null)

            nm.createNotificationChannels(listOf(messagesChannel, callsChannel, serviceChannel))
        }
    }
}
