package com.stakhovivan.stovo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class MessageNotificationTest {
    @Before
    fun clearStacks() {
        MessageNotificationStack.clear("family-chat")
        MessageNotificationStack.clear("dm-chat")
    }

    @Test
    fun `message notification ID is stable for the opened chat`() {
        assertEquals(
            "stovo://chat/family-chat".hashCode(),
            messageNotificationId("family-chat")
        )
    }

    @Test
    fun `missed-call notification ID is stable for the opened chat`() {
        assertEquals(
            "stovo://call/missed/family-chat".hashCode(),
            missedCallNotificationId("family-chat")
        )
    }

    @Test
    fun `extracts chat ID from app link with valid prefix`() {
        assertEquals("family-chat", chatIdFromAppLink("stovo://chat/family-chat", "stovo://chat/"))
        assertEquals("direct-123", chatIdFromAppLink("stovo://call/missed/direct-123", "stovo://call/missed/"))
    }

    @Test
    fun `rejects invalid app links for chat ID extraction`() {
        assertNull(chatIdFromAppLink("https://example.com/chat/123", "stovo://chat/"))
        assertNull(chatIdFromAppLink("stovo://chat/", "stovo://chat/"))
        assertNull(chatIdFromAppLink("stovo://chat/room/extra", "stovo://chat/"))
        assertNull(chatIdFromAppLink("stovo://chat/room?param=1", "stovo://chat/"))
        assertNull(chatIdFromAppLink("stovo://chat/room#anchor", "stovo://chat/"))
    }

    @Test
    fun `parses direct message notifications`() {
        val parsed = parseMessageNotification("Alice", "hello there", listOf("speech_balloon", "direct"))
        assertTrue(parsed.isDirect)
        assertNull(parsed.conversationTitle)
        assertEquals("Alice", parsed.senderName)
        assertEquals("hello there", parsed.text)
    }

    @Test
    fun `parses group message notifications with chat title`() {
        val parsed = parseMessageNotification(
            "Family Chat",
            "Alice: hello there",
            listOf("speech_balloon")
        )
        assertFalse(parsed.isDirect)
        assertEquals("Family Chat", parsed.conversationTitle)
        assertEquals("Alice", parsed.senderName)
        assertEquals("hello there", parsed.text)
    }

    @Test
    fun `stacks messages from one chat and caps history`() {
        repeat(12) { index ->
            MessageNotificationStack.append("family-chat", "Alice", "msg-$index", index.toLong())
        }
        val stacked = MessageNotificationStack.snapshot("family-chat")
        assertEquals(MessageNotificationStack.MAX_MESSAGES, stacked.size)
        assertEquals("msg-2", stacked.first().text)
        assertEquals("msg-11", stacked.last().text)
    }

    @Test
    fun `clear removes stacked messages for a chat`() {
        MessageNotificationStack.append("dm-chat", "Bob", "hi")
        MessageNotificationStack.clear("dm-chat")
        assertTrue(MessageNotificationStack.snapshot("dm-chat").isEmpty())
    }

    @Test
    fun `quiet hours silence notifications across midnight`() {
        assertTrue(StovoFirebaseMessagingService.isWithinQuietHours(true, "22:00", "07:00", 23 * 60 + 30))
        assertTrue(StovoFirebaseMessagingService.isWithinQuietHours(true, "22:00", "07:00", 6 * 60 + 59))
        assertFalse(StovoFirebaseMessagingService.isWithinQuietHours(true, "22:00", "07:00", 12 * 60))
    }

    @Test
    fun `disabled or invalid schedules do not silence notifications`() {
        assertFalse(StovoFirebaseMessagingService.isWithinQuietHours(false, "22:00", "07:00", 23 * 60))
        assertFalse(StovoFirebaseMessagingService.isWithinQuietHours(true, "25:00", "07:00", 23 * 60))
    }
}
