package com.stakhovivan.stovo

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationManagerCompat

object NotificationChannels {

    const val SERVICE_CHANNEL_ID = "stovo_service"

    fun createAll(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
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

            val serviceChannel = NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Stovo connection",
                NotificationManager.IMPORTANCE_LOW
            )

            NotificationManagerCompat.from(context).createNotificationChannels(
                listOf(messagesChannel, callsChannel, serviceChannel)
            )
        }
    }
}
