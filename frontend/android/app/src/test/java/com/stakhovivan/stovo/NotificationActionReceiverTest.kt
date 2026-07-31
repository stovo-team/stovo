package com.stakhovivan.stovo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationActionReceiverTest {
    @Test
    fun `reply action trims text before storing it`() {
        assertEquals(
            PendingNotificationAction("reply", "chat-a", "On my way"),
            NotificationActionReceiver.pendingReply("chat-a", "  On my way  ")
        )
    }

    @Test
    fun `reply action rejects whitespace-only text`() {
        assertNull(NotificationActionReceiver.pendingReply("chat-a", "   "))
    }

    @Test
    fun `callback action stores its chat ID`() {
        assertEquals(
            PendingNotificationAction("callback", "chat-a"),
            NotificationActionReceiver.callbackAction("chat-a")
        )
    }

    @Test
    fun `actions reject blank chat IDs`() {
        assertNull(NotificationActionReceiver.pendingReply(" ", "hello"))
        assertNull(NotificationActionReceiver.callbackAction(""))
    }
}
