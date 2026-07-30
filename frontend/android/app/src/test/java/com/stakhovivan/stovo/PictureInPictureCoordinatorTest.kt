package com.stakhovivan.stovo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PictureInPictureCoordinatorTest {
    @Test
    fun `video call PiP uses a portrait aspect ratio`() {
        assertEquals(
            PiPAspectRatio(width = 9, height = 16),
            pictureInPictureAspectRatio(PiPOwner.CALL, null)
        )
    }

    private fun video(
        active: Boolean = true,
        playing: Boolean = true,
        chatId: String = "chat/%/семья",
        messageId: String = "message/百分比%",
        fileId: String = "file/opaque%2Fid",
        positionSeconds: Double = 12.0,
        durationSeconds: Double = 60.0,
        width: Double = 1920.0,
        height: Double = 1080.0,
        revision: Long = 1L
    ) = VideoPiPState(
        active = active,
        playing = playing,
        chatId = chatId,
        messageId = messageId,
        fileId = fileId,
        positionSeconds = positionSeconds,
        durationSeconds = durationSeconds,
        width = width,
        height = height,
        revision = revision
    )

    @Test
    fun `video call owns PiP and audio call blocks attachment video`() {
        val coordinator = PictureInPictureCoordinator()
        assertTrue(coordinator.updateVideoState(video()))

        coordinator.updateCallState(active = true, video = true, chatId = "call-chat", sessionId = "call-session")
        assertEquals(PiPOwner.CALL, coordinator.snapshot().requestedOwner)

        coordinator.updateCallState(active = true, video = false, chatId = "call-chat", sessionId = "call-session")
        assertEquals(PiPOwner.NONE, coordinator.snapshot().requestedOwner)
        assertFalse(coordinator.snapshot().eligible)
    }

    @Test
    fun `ending a call exposes only a currently playing attachment video`() {
        val coordinator = PictureInPictureCoordinator()
        coordinator.updateVideoState(video())
        coordinator.updateCallState(active = true, video = false, chatId = "call", sessionId = "session")
        coordinator.updateCallState(active = false, video = false, chatId = null, sessionId = null)
        assertEquals(PiPOwner.VIDEO, coordinator.snapshot().requestedOwner)

        coordinator.updateVideoState(video(playing = false, revision = 2))
        assertEquals(PiPOwner.NONE, coordinator.snapshot().requestedOwner)

        coordinator.updateVideoState(video(active = false, playing = false, revision = 3))
        assertEquals(PiPOwner.NONE, coordinator.snapshot().requestedOwner)
    }

    @Test
    fun `malformed video state cannot become owner`() {
        val invalidStates = listOf(
            video(chatId = "", revision = 1),
            video(messageId = "   ", revision = 2),
            video(fileId = "", revision = 3),
            video(positionSeconds = Double.NaN, revision = 4),
            video(durationSeconds = Double.POSITIVE_INFINITY, revision = 5),
            video(positionSeconds = -1.0, revision = 6),
            video(width = Double.NaN, revision = 7),
            video(height = -1.0, revision = 8)
        )

        invalidStates.forEach { state ->
            val coordinator = PictureInPictureCoordinator()
            assertFalse(coordinator.updateVideoState(state))
            assertEquals(PiPOwner.NONE, coordinator.snapshot().requestedOwner)
            assertNull(coordinator.snapshot().videoState)
        }
    }

    @Test
    fun `lower video revisions are ignored`() {
        val coordinator = PictureInPictureCoordinator()
        val accepted = video(positionSeconds = 20.0, revision = 8)
        assertTrue(coordinator.updateVideoState(accepted))
        assertFalse(coordinator.updateVideoState(video(playing = false, positionSeconds = 3.0, revision = 7)))

        val snapshot = coordinator.snapshot()
        assertEquals(8L, snapshot.acceptedVideoRevision)
        assertEquals(20.0, snapshot.videoState?.positionSeconds ?: -1.0, 0.0)
        assertTrue(snapshot.videoState?.playing == true)
    }

    @Test
    fun `video actions toggle playback and clamp seek without changing identity`() {
        val coordinator = PictureInPictureCoordinator()
        val original = video(positionSeconds = 5.0, durationSeconds = 20.0, revision = 4)
        coordinator.updateVideoState(original)
        coordinator.captureForEntry()

        val paused = coordinator.performAction(PiPAction.PAUSE)
        assertFalse(paused?.playing ?: true)
        val atZero = coordinator.performAction(PiPAction.SEEK_BACKWARD)
        assertEquals(0.0, atZero?.positionSeconds ?: -1.0, 0.0)
        coordinator.performAction(PiPAction.SEEK_FORWARD)
        val atEnd = coordinator.performAction(PiPAction.SEEK_FORWARD)
        assertEquals(20.0, atEnd?.positionSeconds ?: -1.0, 0.0)
        assertEquals(original.chatId, atEnd?.chatId)
        assertEquals(original.messageId, atEnd?.messageId)
        assertEquals(original.fileId, atEnd?.fileId)
        assertTrue(coordinator.performAction(PiPAction.PLAY)?.playing == true)
    }

    @Test
    fun `captured video identity survives pause until PiP exit is cleared`() {
        val coordinator = PictureInPictureCoordinator()
        val original = video(revision = 9)
        coordinator.updateVideoState(original)

        val entered = coordinator.captureForEntry()
        assertEquals(PiPOwner.VIDEO, entered?.activeOwner)
        coordinator.performAction(PiPAction.PAUSE)

        val exitSnapshot = coordinator.activePictureInPictureSnapshot()
        assertEquals(PiPOwner.VIDEO, exitSnapshot?.activeOwner)
        assertEquals(original.chatId, exitSnapshot?.videoState?.chatId)
        assertFalse(exitSnapshot?.videoState?.playing ?: true)

        coordinator.clearActivePictureInPicture()
        assertNull(coordinator.activePictureInPictureSnapshot())
        assertEquals(PiPOwner.NONE, coordinator.snapshot().requestedOwner)
    }

    @Test
    fun `wire actions are closed and reject unknown receiver input`() {
        assertEquals(PiPAction.PLAY, PiPAction.fromWireValue("play"))
        assertEquals(PiPAction.SEEK_FORWARD, PiPAction.fromWireValue("seek-forward"))
        assertNull(PiPAction.fromWireValue("delete-message"))
        assertNull(PiPAction.fromWireValue(""))
    }

    @Test
    fun `ending a call retains paused video state without starting playback`() {
        val coordinator = PictureInPictureCoordinator()
        assertTrue(coordinator.updateVideoState(video(playing = true, revision = 1)))
        coordinator.updateCallState(active = true, video = true, chatId = "call", sessionId = "session")
        assertEquals(PiPOwner.CALL, coordinator.snapshot().requestedOwner)

        assertTrue(coordinator.updateVideoState(video(playing = false, revision = 2)))
        coordinator.updateCallState(active = false, video = false, chatId = null, sessionId = null)

        val snapshot = coordinator.snapshot()
        assertEquals(PiPOwner.NONE, snapshot.requestedOwner)
        assertEquals(false, snapshot.videoState?.playing)
        assertEquals("file/opaque%2Fid", snapshot.videoState?.fileId)
        assertNull(PiPAction.fromWireValue("auto-resume"))
    }

    @Test
    fun `stale revisions and unknown actions cannot displace the captured call-priority owner`() {
        val coordinator = PictureInPictureCoordinator()
        assertTrue(coordinator.updateVideoState(video(revision = 5)))
        coordinator.updateCallState(active = true, video = true, chatId = "call-chat", sessionId = "call-session")
        val entered = coordinator.captureForEntry()
        assertEquals(PiPOwner.CALL, entered?.activeOwner)

        assertFalse(coordinator.updateVideoState(video(playing = false, revision = 4)))
        assertNull(PiPAction.fromWireValue("delete-message"))
        assertEquals(PiPOwner.CALL, coordinator.activePictureInPictureSnapshot()?.activeOwner)
        assertEquals(5L, coordinator.snapshot().acceptedVideoRevision)
    }
}
