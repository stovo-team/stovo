package com.stakhovivan.stovo

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.util.Calendar

class StovoFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        const val PREFS_NAME = "stovo_fcm"
        const val PREF_FCM_TOKEN = "fcm_token"
        const val PREF_QUIET_HOURS_ENABLED = "quiet_hours_enabled"
        const val PREF_QUIET_HOURS_START = "quiet_hours_start"
        const val PREF_QUIET_HOURS_END = "quiet_hours_end"

        /** ID of the most recently posted "ringing" call notification, or null if none. */
        @Volatile var activeCallNotificationId: Int? = null

        fun updateNotificationSchedule(context: Context, enabled: Boolean, start: String, end: String) {
            context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                .putBoolean(PREF_QUIET_HOURS_ENABLED, enabled)
                .putString(PREF_QUIET_HOURS_START, start)
                .putString(PREF_QUIET_HOURS_END, end)
                .apply()
        }

        fun isWithinQuietHours(enabled: Boolean, start: String, end: String, minuteOfDay: Int): Boolean {
            if (!enabled || !TIME_PATTERN.matches(start) || !TIME_PATTERN.matches(end) || start == end) return false
            val from = timeToMinutes(start)
            val to = timeToMinutes(end)
            return if (from < to) minuteOfDay >= from && minuteOfDay < to else minuteOfDay >= from || minuteOfDay < to
        }

        private val TIME_PATTERN = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

        private fun timeToMinutes(time: String): Int {
            val (hour, minute) = time.split(":").map(String::toInt)
            return hour * 60 + minute
        }

        fun getCachedToken(context: Context): String? {
            return context.getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString(PREF_FCM_TOKEN, null)
        }
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
            .putString(PREF_FCM_TOKEN, token)
            .apply()
        NtfyPlugin.broadcastTokenUpdate(token)
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data
        if (data.isEmpty()) return

        NotificationChannels.createAll(applicationContext)

        val title = data["title"] ?: "Stovo"
        val body = data["message"] ?: "New message"
        val click = data["click"] ?: ""
        val tags = (data["tags"] ?: "").split(",").map { it.trim() }.filter { it.isNotEmpty() }

        var notificationId = if (click.isNotEmpty()) click.hashCode() else System.currentTimeMillis().toInt()

        val isRinging = tags.contains("phone")
        val isMissed = tags.contains("telephone_receiver")
        val isMessage = !isRinging && !isMissed
        val messageChatId = if (isMessage) chatIdFromAppLink(click, "stovo://chat/") else null
        val missedCallChatId = if (isMissed) chatIdFromAppLink(click, "stovo://call/missed/") else null
        if (messageChatId != null) notificationId = messageNotificationId(messageChatId)
        if (missedCallChatId != null) notificationId = missedCallNotificationId(missedCallChatId)

        val notificationPrefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        val calendar = Calendar.getInstance()
        val isQuietTime = isWithinQuietHours(
            notificationPrefs.getBoolean(PREF_QUIET_HOURS_ENABLED, false),
            notificationPrefs.getString(PREF_QUIET_HOURS_START, "22:00") ?: "22:00",
            notificationPrefs.getString(PREF_QUIET_HOURS_END, "07:00") ?: "07:00",
            calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
        )
        val messagesChannelId = if (isQuietTime) NotificationChannels.SILENT_MESSAGES_CHANNEL_ID else NotificationChannels.MESSAGES_CHANNEL_ID
        val callsChannelId = if (isQuietTime) NotificationChannels.SILENT_CALLS_CHANNEL_ID else NotificationChannels.CALLS_CHANNEL_ID

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    applicationContext,
                    android.Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return
            }
        }

        val appIcon = BitmapFactory.decodeResource(applicationContext.resources, R.mipmap.ic_launcher)

        val notification: Notification = when {
            isRinging -> {
                val pendingIntent = buildPendingIntent(click, notificationId)
                val acceptPendingIntent = PendingIntent.getActivity(
                    applicationContext,
                    ("accept_" + notificationId).hashCode(),
                    Intent(Intent.ACTION_VIEW, Uri.parse(click)).apply {
                        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                NotificationCompat.Builder(applicationContext, callsChannelId)
                    .setSmallIcon(R.drawable.ic_notification_call)
                    .setLargeIcon(appIcon)
                    .setContentTitle(title)
                    .setContentText("Incoming call")
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_CALL)
                    .setFullScreenIntent(pendingIntent, true)
                    .addAction(R.drawable.ic_notification_call, "Accept", acceptPendingIntent)
                    .build()
            }
            isMissed -> {
                val pendingIntent = buildPendingIntent(click, notificationId)
                val builder = NotificationCompat.Builder(applicationContext, callsChannelId)
                    .setSmallIcon(R.drawable.ic_notification_call)
                    .setLargeIcon(appIcon)
                    .setContentTitle(title)
                    .setContentText("Missed call")
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
                if (missedCallChatId != null) {
                    builder.addAction(
                        R.drawable.ic_notification_call,
                        "Call back",
                        NotificationActionReceiver.callbackPendingIntent(
                            applicationContext,
                            missedCallChatId
                        )
                    )
                }
                builder.build()
            }
            else -> {
                val pendingIntent = buildPendingIntent(click, notificationId)
                val parsed = parseMessageNotification(title, body, tags)
                val history = if (messageChatId != null) {
                    MessageNotificationStack.append(
                        messageChatId,
                        parsed.senderName,
                        parsed.text
                    )
                } else {
                    listOf(
                        StackedChatMessage(
                            parsed.senderName,
                            parsed.text,
                            System.currentTimeMillis()
                        )
                    )
                }
                val localUser = Person.Builder()
                    .setName("You")
                    .setKey("local")
                    .build()
                val messagingStyle = NotificationCompat.MessagingStyle(localUser)
                if (!parsed.isDirect) {
                    messagingStyle
                        .setConversationTitle(parsed.conversationTitle ?: title)
                        .setGroupConversation(true)
                }
                for (entry in history) {
                    val sender = Person.Builder()
                        .setName(entry.senderName)
                        .setKey(entry.senderName)
                        .build()
                    messagingStyle.addMessage(entry.text, entry.timestamp, sender)
                }
                val builder = NotificationCompat.Builder(applicationContext, messagesChannelId)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setLargeIcon(appIcon)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(messagingStyle)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setOnlyAlertOnce(history.size > 1)
                    .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                if (messageChatId != null) {
                    builder.setDeleteIntent(
                        NotificationActionReceiver.dismissPendingIntent(
                            applicationContext,
                            messageChatId
                        )
                    )
                    val replyInput = RemoteInput.Builder(NotificationActionReceiver.REPLY_TEXT_KEY)
                        .setLabel("Reply")
                        .build()
                    val replyAction = NotificationCompat.Action.Builder(
                        R.drawable.ic_notification,
                        "Reply",
                        NotificationActionReceiver.replyPendingIntent(
                            applicationContext,
                            messageChatId
                        )
                    )
                        .addRemoteInput(replyInput)
                        .build()
                    builder.addAction(replyAction)
                }
                builder.build()
            }
        }

        if (isRinging) {
            activeCallNotificationId = notificationId
        } else if (isMissed) {
            activeCallNotificationId = null
        }
        NotificationManagerCompat.from(applicationContext).notify(notificationId, notification)
    }

    private fun buildPendingIntent(click: String, requestCode: Int): PendingIntent {
        val intent = if (click.isNotEmpty()) {
            Intent(Intent.ACTION_VIEW, Uri.parse(click))
        } else {
            Intent(applicationContext, MainActivity::class.java)
        }.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(
            applicationContext,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
