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
    const val MESSAGES_CHANNEL_ID = "stovo_messages"
    const val SILENT_MESSAGES_CHANNEL_ID = "stovo_messages_silent"
    const val CALLS_CHANNEL_ID = "stovo_calls"
    const val SILENT_CALLS_CHANNEL_ID = "stovo_calls_silent"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = NotificationManagerCompat.from(context)

            // Remove superseded service channels so users don't see stale entries.
            nm.deleteNotificationChannel("stovo_service")
            nm.deleteNotificationChannel("stovo_service_v2")
            nm.deleteNotificationChannel("stovo_service_v3")

            val messagesChannel = NotificationChannel(
                MESSAGES_CHANNEL_ID,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH
            )

            val callsChannel = NotificationChannel(
                CALLS_CHANNEL_ID,
                "Calls",
                NotificationManager.IMPORTANCE_HIGH
            )
            callsChannel.lockscreenVisibility = Notification.VISIBILITY_PUBLIC

            val silentMessagesChannel = NotificationChannel(
                SILENT_MESSAGES_CHANNEL_ID,
                "Messages (silent)",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                setSound(null, null)
                enableVibration(false)
            }

            val silentCallsChannel = NotificationChannel(
                SILENT_CALLS_CHANNEL_ID,
                "Calls (silent)",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                setSound(null, null)
                enableVibration(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }

            nm.createNotificationChannels(
                listOf(messagesChannel, callsChannel, silentMessagesChannel, silentCallsChannel)
            )
        }
    }
}
