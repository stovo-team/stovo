package com.stakhovivan.stovo

import org.junit.Assert.assertEquals
import org.junit.Test

class MessageNotificationTest {
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
}
