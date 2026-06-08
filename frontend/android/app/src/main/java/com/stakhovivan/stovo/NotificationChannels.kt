package com.stakhovivan.stovo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationManagerCompat

object NotificationChannels {

    // Use v2 suffix so the channel is recreated with IMPORTANCE_MIN on existing installs
    const val SERVICE_CHANNEL_ID = "stovo_service_v2"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = NotificationManagerCompat.from(context)

            // Delete the old service channel so it is no longer visible to the user
            nm.deleteNotificationChannel("stovo_service")

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

            // IMPORTANCE_MIN: no sound, no status-bar icon, appears only at the
            // very bottom of the notification shade — effectively invisible.
            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Stovo connection",
                NotificationManager.IMPORTANCE_MIN
            )
            serviceChannel.setShowBadge(false)

            nm.createNotificationChannels(listOf(messagesChannel, callsChannel, serviceChannel))
        }
    }
}
