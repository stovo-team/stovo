package com.stakhovivan.stovo

import java.util.concurrent.ConcurrentHashMap

fun messageNotificationId(chatId: String): Int = "stovo://chat/$chatId".hashCode()

fun missedCallNotificationId(chatId: String): Int = "stovo://call/missed/$chatId".hashCode()

fun chatIdFromAppLink(link: String, prefix: String): String? {
    if (!link.startsWith(prefix)) return null
    return link.removePrefix(prefix)
        .takeIf { it.isNotEmpty() && !it.contains('/') && !it.contains('?') && !it.contains('#') }
}

data class StackedChatMessage(
    val senderName: String,
    val text: String,
    val timestamp: Long
)

data class ParsedMessageNotification(
    val isDirect: Boolean,
    val conversationTitle: String?,
    val senderName: String,
    val text: String
)

fun parseMessageNotification(
    title: String,
    body: String,
    tags: List<String>
): ParsedMessageNotification {
    val isDirect = tags.contains("direct")
    if (isDirect) {
        val sender = title.ifBlank { "Someone" }
        return ParsedMessageNotification(
            isDirect = true,
            conversationTitle = null,
            senderName = sender,
            text = body.ifBlank { "New message" }
        )
    }
    val conversation = title.ifBlank { "Chat" }
    val separator = body.indexOf(": ")
    return if (separator > 0) {
        ParsedMessageNotification(
            isDirect = false,
            conversationTitle = conversation,
            senderName = body.substring(0, separator).ifBlank { "Someone" },
            text = body.substring(separator + 2).ifBlank { "New message" }
        )
    } else {
        ParsedMessageNotification(
            isDirect = false,
            conversationTitle = conversation,
            senderName = "Someone",
            text = body.ifBlank { "New message" }
        )
    }
}

object MessageNotificationStack {
    const val MAX_MESSAGES = 10

    private val byChat = ConcurrentHashMap<String, MutableList<StackedChatMessage>>()

    fun append(chatId: String, senderName: String, text: String, timestamp: Long = System.currentTimeMillis()): List<StackedChatMessage> {
        val list = byChat.getOrPut(chatId) { mutableListOf() }
        synchronized(list) {
            list.add(StackedChatMessage(senderName, text, timestamp))
            while (list.size > MAX_MESSAGES) {
                list.removeAt(0)
            }
            return list.toList()
        }
    }

    fun clear(chatId: String) {
        byChat.remove(chatId)
    }

    fun snapshot(chatId: String): List<StackedChatMessage> {
        val list = byChat[chatId] ?: return emptyList()
        synchronized(list) {
            return list.toList()
        }
    }
}
