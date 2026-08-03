package com.stakhovivan.stovo

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import org.json.JSONObject

data class PendingNotificationAction(
    val type: String,
    val chatId: String,
    val text: String? = null
)

class NotificationActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_REPLY = "com.stakhovivan.stovo.notification.REPLY"
        const val ACTION_CALLBACK = "com.stakhovivan.stovo.notification.CALLBACK"
        const val ACTION_DISMISS = "com.stakhovivan.stovo.notification.DISMISS"
        const val EXTRA_CHAT_ID = "chat_id"
        const val REPLY_TEXT_KEY = "reply_text"
        const val PREFS_NAME = "stovo_notification_actions"
        const val PREF_PENDING_ACTION = "pending_action"

        fun pendingReply(chatId: String?, text: CharSequence?): PendingNotificationAction? {
            val validChatId = chatId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val validText = text?.toString()?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return PendingNotificationAction("reply", validChatId, validText)
        }

        fun callbackAction(chatId: String?): PendingNotificationAction? {
            val validChatId = chatId?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return PendingNotificationAction("callback", validChatId)
        }

        fun replyPendingIntent(context: Context, chatId: String): PendingIntent {
            val intent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_REPLY
                putExtra(EXTRA_CHAT_ID, chatId)
            }
            return PendingIntent.getBroadcast(
                context,
                ("reply:$chatId").hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
            )
        }

        fun callbackPendingIntent(context: Context, chatId: String): PendingIntent {
            val intent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_CALLBACK
                putExtra(EXTRA_CHAT_ID, chatId)
            }
            return PendingIntent.getBroadcast(
                context,
                ("callback:$chatId").hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        fun dismissPendingIntent(context: Context, chatId: String): PendingIntent {
            val intent = Intent(context, NotificationActionReceiver::class.java).apply {
                action = ACTION_DISMISS
                putExtra(EXTRA_CHAT_ID, chatId)
            }
            return PendingIntent.getBroadcast(
                context,
                ("dismiss:$chatId").hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        fun readAndClearPendingAction(context: Context): PendingNotificationAction? {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val rawAction = prefs.getString(PREF_PENDING_ACTION, null) ?: return null
            prefs.edit().remove(PREF_PENDING_ACTION).apply()
            return try {
                val json = JSONObject(rawAction)
                when (json.optString("type")) {
                    "reply" -> pendingReply(json.optString("chatId"), json.optString("text"))
                    "callback" -> callbackAction(json.optString("chatId"))
                    else -> null
                }
            } catch (_: Exception) {
                null
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val chatId = intent.getStringExtra(EXTRA_CHAT_ID)
        val validChatId = chatId?.trim()?.takeIf { it.isNotEmpty() } ?: return

        if (intent.action == ACTION_DISMISS) {
            MessageNotificationStack.clear(validChatId)
            return
        }

        val pendingAction = when (intent.action) {
            ACTION_REPLY -> pendingReply(
                chatId,
                RemoteInput.getResultsFromIntent(intent)?.getCharSequence(REPLY_TEXT_KEY)
            )
            ACTION_CALLBACK -> callbackAction(chatId)
            else -> null
        }

        if (pendingAction != null) {
            val json = JSONObject()
                .put("type", pendingAction.type)
                .put("chatId", pendingAction.chatId)
            pendingAction.text?.let { json.put("text", it) }
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_PENDING_ACTION, json.toString())
                .apply()
        }

        MessageNotificationStack.clear(validChatId)
        NotificationManagerCompat.from(context).apply {
            cancel(messageNotificationId(validChatId))
            cancel(missedCallNotificationId(validChatId))
        }

        val appLink = if (intent.action == ACTION_CALLBACK) {
            "stovo://call/callback/$validChatId"
        } else {
            "stovo://chat/$validChatId"
        }
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(appLink)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
        )
    }
}
