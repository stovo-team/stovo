package com.stakhovivan.stovo

import java.lang.reflect.Modifier
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioPlaybackCoordinatorTest {
    private fun identity(
        chatId: String = "chat/%/семья",
        messageId: String = "message/百分比%",
        fileId: String = "file/opaque%2Fid"
    ) = AudioPlaybackIdentity(
        chatId = chatId,
        messageId = messageId,
        fileId = fileId
    )

    private fun candidate(
        identity: AudioPlaybackIdentity? = identity(),
        position: Double = 12.0,
        duration: Double = 60.0,
        bufferedPosition: Double = 24.0,
        status: AudioPlaybackStatus = AudioPlaybackStatus.PLAYING,
        playWhenReady: Boolean = true,
        isPlaying: Boolean = true,
        suppressionReason: AudioSuppressionReason? = null,
        canSeek: Boolean = true,
        error: AudioPlaybackErrorCode? = null,
        revision: Long = 1L
    ) = AudioPlaybackSnapshot(
        identity = identity,
        position = position,
        duration = duration,
        bufferedPosition = bufferedPosition,
        status = status,
        playWhenReady = playWhenReady,
        isPlaying = isPlaying,
        suppressionReason = suppressionReason,
        canSeek = canSeek,
        error = error,
        revision = revision
    )

    @Test
    fun `valid state preserves opaque identity and exact wire contract`() {
        val coordinator = AudioPlaybackCoordinator()

        assertTrue(coordinator.accept(candidate(revision = 7)))

        val snapshot = coordinator.snapshot()
        assertEquals(identity(), snapshot.identity)
        assertEquals(12.0, snapshot.position, 0.0)
        assertEquals(60.0, snapshot.duration, 0.0)
        assertEquals(24.0, snapshot.bufferedPosition, 0.0)
        assertEquals(AudioPlaybackStatus.PLAYING, snapshot.status)
        assertTrue(snapshot.playWhenReady)
        assertTrue(snapshot.isPlaying)
        assertNull(snapshot.suppressionReason)
        assertTrue(snapshot.canSeek)
        assertNull(snapshot.error)
        assertEquals(7L, snapshot.revision)
        assertEquals("android", snapshot.platform)

        assertEquals(
            setOf(
                "identity",
                "position",
                "duration",
                "bufferedPosition",
                "status",
                "playWhenReady",
                "isPlaying",
                "suppressionReason",
                "canSeek",
                "error",
                "revision",
                "platform"
            ),
            AudioPlaybackSnapshot::class.java.declaredFields
                .filterNot {
                    it.isSynthetic ||
                        it.name.startsWith("$") ||
                        Modifier.isStatic(it.modifiers)
                }
                .map { it.name }
                .toSet()
        )
        assertEquals(
            setOf("chatId", "messageId", "fileId"),
            AudioPlaybackIdentity::class.java.declaredFields
                .filterNot {
                    it.isSynthetic ||
                        it.name.startsWith("$") ||
                        Modifier.isStatic(it.modifiers)
                }
                .map { it.name }
                .toSet()
        )
    }

    @Test
    fun `malformed newer state advances revision before rejecting normalization`() {
        val coordinator = AudioPlaybackCoordinator()
        assertTrue(coordinator.accept(candidate(position = 20.0, revision = 4)))

        assertFalse(
            coordinator.accept(
                candidate(
                    position = Double.NaN,
                    duration = Double.POSITIVE_INFINITY,
                    revision = 8
                )
            )
        )
        assertEquals(8L, coordinator.acceptedRevision())
        assertEquals(20.0, coordinator.snapshot().position, 0.0)
        assertFalse(coordinator.accept(candidate(position = 3.0, revision = 7)))
        assertEquals(20.0, coordinator.snapshot().position, 0.0)
    }

    @Test
    fun `invalid identity timing and enum relationships fail closed or clamp safely`() {
        val invalidStates = listOf(
            candidate(identity = identity(chatId = ""), revision = 1),
            candidate(identity = identity(messageId = "   "), revision = 2),
            candidate(identity = identity(fileId = ""), revision = 3),
            candidate(position = -1.0, revision = 4),
            candidate(duration = Double.NaN, revision = 5),
            candidate(bufferedPosition = Double.POSITIVE_INFINITY, revision = 6),
            candidate(
                status = AudioPlaybackStatus.PLAYING,
                playWhenReady = false,
                isPlaying = true,
                revision = 7
            ),
            candidate(
                status = AudioPlaybackStatus.SUPPRESSED,
                playWhenReady = false,
                isPlaying = false,
                suppressionReason = null,
                revision = 8
            ),
            candidate(
                status = AudioPlaybackStatus.ERROR,
                playWhenReady = false,
                isPlaying = false,
                error = null,
                revision = 9
            )
        )

        invalidStates.forEach { state ->
            val coordinator = AudioPlaybackCoordinator()
            assertFalse(coordinator.accept(state))
            assertNull(coordinator.snapshot().identity)
            assertEquals(AudioPlaybackStatus.IDLE, coordinator.snapshot().status)
        }

        val coordinator = AudioPlaybackCoordinator()
        assertTrue(
            coordinator.accept(
                candidate(
                    position = 80.0,
                    duration = 60.0,
                    bufferedPosition = 75.0,
                    revision = 10
                )
            )
        )
        assertEquals(60.0, coordinator.snapshot().position, 0.0)
        assertEquals(60.0, coordinator.snapshot().bufferedPosition, 0.0)
    }

    @Test
    fun `intent actual buffering end suppression recovery and error remain distinct`() {
        val coordinator = AudioPlaybackCoordinator()

        assertTrue(
            coordinator.accept(
                candidate(
                    status = AudioPlaybackStatus.BUFFERING,
                    playWhenReady = true,
                    isPlaying = false,
                    revision = 1
                )
            )
        )
        assertTrue(coordinator.snapshot().playWhenReady)
        assertFalse(coordinator.snapshot().isPlaying)

        assertTrue(
            coordinator.accept(
                candidate(
                    status = AudioPlaybackStatus.SUPPRESSED,
                    playWhenReady = false,
                    isPlaying = false,
                    suppressionReason = AudioSuppressionReason.FOCUS,
                    revision = 2
                )
            )
        )
        assertEquals(AudioSuppressionReason.FOCUS, coordinator.snapshot().suppressionReason)

        assertTrue(
            coordinator.accept(
                candidate(
                    status = AudioPlaybackStatus.AUTHORIZATION_REQUIRED,
                    playWhenReady = false,
                    isPlaying = false,
                    canSeek = true,
                    revision = 3
                )
            )
        )
        assertEquals(AudioPlaybackStatus.AUTHORIZATION_REQUIRED, coordinator.snapshot().status)

        assertTrue(
            coordinator.accept(
                candidate(
                    status = AudioPlaybackStatus.ERROR,
                    playWhenReady = false,
                    isPlaying = false,
                    error = AudioPlaybackErrorCode.NETWORK,
                    revision = 4
                )
            )
        )
        assertEquals(AudioPlaybackErrorCode.NETWORK, coordinator.snapshot().error)
    }

    @Test
    fun `active call pauses and blocks play without post-call auto resume`() {
        val coordinator = AudioPlaybackCoordinator()
        coordinator.accept(candidate(revision = 1))

        coordinator.setCallActive(true)
        assertFalse(coordinator.requestPlay())
        assertEquals(AudioPlaybackStatus.SUPPRESSED, coordinator.snapshot().status)
        assertEquals(AudioSuppressionReason.CALL, coordinator.snapshot().suppressionReason)
        assertFalse(coordinator.snapshot().playWhenReady)
        assertFalse(coordinator.snapshot().isPlaying)
        assertEquals(12.0, coordinator.snapshot().position, 0.0)

        coordinator.setCallActive(false)
        assertEquals(AudioPlaybackStatus.PAUSED, coordinator.snapshot().status)
        assertNull(coordinator.snapshot().suppressionReason)
        assertFalse(coordinator.snapshot().playWhenReady)
        assertTrue(coordinator.requestPlay())
    }

    @Test
    fun `natural end and recoverable failure retain replayable ownership`() {
        val coordinator = AudioPlaybackCoordinator()
        coordinator.accept(candidate(position = 40.0, duration = 60.0, revision = 1))

        coordinator.naturalEnd()
        assertEquals(identity(), coordinator.snapshot().identity)
        assertEquals(60.0, coordinator.snapshot().position, 0.0)
        assertEquals(AudioPlaybackStatus.ENDED, coordinator.snapshot().status)
        assertTrue(coordinator.requestPlay())

        coordinator.recoverableFailure(AudioPlaybackErrorCode.NETWORK)
        assertEquals(identity(), coordinator.snapshot().identity)
        assertEquals(AudioPlaybackStatus.ERROR, coordinator.snapshot().status)
        assertEquals(AudioPlaybackErrorCode.NETWORK, coordinator.snapshot().error)
    }

    @Test
    fun `terminal cleanup removes ownership and is idempotent`() {
        AudioPlaybackCleanupReason.entries.forEach { reason ->
            val coordinator = AudioPlaybackCoordinator()
            coordinator.accept(candidate(revision = 1))

            assertTrue(coordinator.cleanup(reason))
            assertFalse(coordinator.cleanup(reason))
            assertNull(coordinator.snapshot().identity)
            assertEquals(AudioPlaybackStatus.IDLE, coordinator.snapshot().status)
            assertFalse(coordinator.snapshot().playWhenReady)
            assertFalse(coordinator.snapshot().isPlaying)
        }
    }

    @Test
    fun `credential free recovery restores paused authorization required state`() {
        val recovery = AudioPlaybackRecovery(
            identity = identity(),
            position = 34.0,
            duration = 90.0,
            formerPlayWhenReady = true
        )
        val forbiddenFragments = listOf(
            "token",
            "credential",
            "url",
            "uri",
            "source",
            "title",
            "filename",
            "messagecontent"
        )
        val recoveryFields = AudioPlaybackRecovery::class.java.declaredFields
            .filterNot {
                it.isSynthetic ||
                    it.name.startsWith("$") ||
                    Modifier.isStatic(it.modifiers)
            }
            .map { it.name.lowercase() }
        assertTrue(recoveryFields.none { field -> forbiddenFragments.any(field::contains) })

        val coordinator = AudioPlaybackCoordinator()
        assertTrue(coordinator.restore(recovery))
        assertEquals(identity(), coordinator.snapshot().identity)
        assertEquals(34.0, coordinator.snapshot().position, 0.0)
        assertEquals(90.0, coordinator.snapshot().duration, 0.0)
        assertEquals(AudioPlaybackStatus.AUTHORIZATION_REQUIRED, coordinator.snapshot().status)
        assertFalse(coordinator.snapshot().playWhenReady)
        assertFalse(coordinator.snapshot().isPlaying)
        assertNull(coordinator.snapshot().error)
    }

    @Test
    fun `system seek increments exactly ten seconds and clamps at boundaries`() {
        val coordinator = AudioPlaybackCoordinator()
        coordinator.accept(candidate(position = 5.0, duration = 20.0, revision = 1))

        assertEquals(0.0, coordinator.seekBy(-10.0), 0.0)
        assertEquals(10.0, coordinator.seekBy(10.0), 0.0)
        assertEquals(20.0, coordinator.seekBy(10.0), 0.0)
        assertEquals(20.0, coordinator.seekBy(10.0), 0.0)
    }

    @Test
    fun `wire enums are closed and reject unknown values`() {
        assertEquals(AudioPlaybackStatus.PLAYING, AudioPlaybackStatus.fromWireValue("playing"))
        assertEquals(
            AudioSuppressionReason.FOCUS,
            AudioSuppressionReason.fromWireValue("focus")
        )
        assertEquals(
            AudioPlaybackErrorCode.AUTHORIZATION,
            AudioPlaybackErrorCode.fromWireValue("authorization")
        )
        assertNull(AudioPlaybackStatus.fromWireValue("streaming"))
        assertNull(AudioSuppressionReason.fromWireValue("other"))
        assertNull(AudioPlaybackErrorCode.fromWireValue("raw-http-401"))
    }
}
