package com.stakhovivan.stovo

data class AudioPlaybackIdentity(
    val chatId: String,
    val messageId: String,
    val fileId: String
)

enum class AudioPlaybackStatus(val wireValue: String) {
    IDLE("idle"),
    LOADING("loading"),
    READY("ready"),
    PLAYING("playing"),
    PAUSED("paused"),
    BUFFERING("buffering"),
    SUPPRESSED("suppressed"),
    ENDED("ended"),
    ERROR("error"),
    AUTHORIZATION_REQUIRED("authorization-required");

    companion object {
        fun fromWireValue(value: String?): AudioPlaybackStatus? = entries.firstOrNull {
            it.wireValue == value
        }
    }
}

enum class AudioSuppressionReason(val wireValue: String) {
    CALL("call"),
    VIDEO("video"),
    FOCUS("focus");

    companion object {
        fun fromWireValue(value: String?): AudioSuppressionReason? = entries.firstOrNull {
            it.wireValue == value
        }
    }
}

enum class AudioPlaybackErrorCode(val wireValue: String) {
    UNAVAILABLE("unavailable"),
    NETWORK("network"),
    UNSUPPORTED("unsupported"),
    DECODE("decode"),
    PLAYBACK_DENIED("playback-denied"),
    AUTHORIZATION("authorization"),
    UNKNOWN("unknown");

    companion object {
        fun fromWireValue(value: String?): AudioPlaybackErrorCode? = entries.firstOrNull {
            it.wireValue == value
        }
    }
}

enum class AudioPlaybackCleanupReason {
    INACCESSIBLE,
    ACCOUNT_BOUNDARY,
    EXPLICIT_CLOSE
}

data class AudioPlaybackSnapshot(
    val identity: AudioPlaybackIdentity?,
    val position: Double,
    val duration: Double,
    val bufferedPosition: Double,
    val status: AudioPlaybackStatus,
    val playWhenReady: Boolean,
    val isPlaying: Boolean,
    val suppressionReason: AudioSuppressionReason?,
    val canSeek: Boolean,
    val error: AudioPlaybackErrorCode?,
    val revision: Long,
    val platform: String = PLATFORM_ANDROID
) {
    companion object {
        const val PLATFORM_ANDROID = "android"
    }
}

data class AudioPlaybackRecovery(
    val identity: AudioPlaybackIdentity,
    val position: Double,
    val duration: Double,
    val formerPlayWhenReady: Boolean
)

class AudioPlaybackCoordinator {
    private var acceptedRevision = -1L
    private var callActive = false
    private var current = idleSnapshot(0L)

    fun snapshot(): AudioPlaybackSnapshot = current

    fun acceptedRevision(): Long = acceptedRevision

    fun accept(candidate: AudioPlaybackSnapshot): Boolean {
        if (candidate.revision < 0 || candidate.revision <= acceptedRevision) return false
        acceptedRevision = candidate.revision
        val normalized = normalize(candidate) ?: return false
        current = normalized
        return true
    }

    fun setCallActive(active: Boolean) {
        callActive = active
        if (current.identity == null) return
        if (active) {
            replaceCurrent(
                status = AudioPlaybackStatus.SUPPRESSED,
                playWhenReady = false,
                isPlaying = false,
                suppressionReason = AudioSuppressionReason.CALL,
                error = null
            )
        } else if (current.suppressionReason == AudioSuppressionReason.CALL) {
            replaceCurrent(
                status = AudioPlaybackStatus.PAUSED,
                playWhenReady = false,
                isPlaying = false,
                suppressionReason = null,
                error = null
            )
        }
    }

    fun requestPlay(): Boolean {
        if (callActive || current.identity == null) return false
        replaceCurrent(
            position = if (current.status == AudioPlaybackStatus.ENDED) 0.0 else current.position,
            status = AudioPlaybackStatus.BUFFERING,
            playWhenReady = true,
            isPlaying = false,
            suppressionReason = null,
            error = null
        )
        return true
    }

    fun requestPause() {
        if (current.identity == null) return
        replaceCurrent(
            status = AudioPlaybackStatus.PAUSED,
            playWhenReady = false,
            isPlaying = false,
            suppressionReason = null,
            error = null
        )
    }

    fun seekBy(deltaSeconds: Double): Double {
        if (current.identity == null || !deltaSeconds.isFinite()) return current.position
        val position = clamp(current.position + deltaSeconds, current.duration)
        replaceCurrent(position = position)
        return position
    }

    fun naturalEnd() {
        if (current.identity == null) return
        replaceCurrent(
            position = if (current.duration > 0.0) current.duration else current.position,
            status = AudioPlaybackStatus.ENDED,
            playWhenReady = false,
            isPlaying = false,
            suppressionReason = null,
            error = null
        )
    }

    fun recoverableFailure(error: AudioPlaybackErrorCode) {
        if (current.identity == null) return
        replaceCurrent(
            status = AudioPlaybackStatus.ERROR,
            playWhenReady = false,
            isPlaying = false,
            suppressionReason = null,
            error = error
        )
    }

    fun restore(recovery: AudioPlaybackRecovery): Boolean {
        if (
            !validIdentity(recovery.identity) ||
            !validFinite(recovery.position) ||
            !validFinite(recovery.duration)
        ) {
            return false
        }
        val nextRevision = nextRevision()
        current = AudioPlaybackSnapshot(
            identity = recovery.identity.copy(),
            position = clamp(recovery.position, recovery.duration),
            duration = recovery.duration,
            bufferedPosition = 0.0,
            status = AudioPlaybackStatus.AUTHORIZATION_REQUIRED,
            playWhenReady = false,
            isPlaying = false,
            suppressionReason = null,
            canSeek = recovery.duration > 0.0,
            error = null,
            revision = nextRevision
        )
        return true
    }

    fun cleanup(@Suppress("UNUSED_PARAMETER") reason: AudioPlaybackCleanupReason): Boolean {
        if (current.identity == null) return false
        current = idleSnapshot(nextRevision())
        callActive = false
        return true
    }

    private fun normalize(candidate: AudioPlaybackSnapshot): AudioPlaybackSnapshot? {
        if (candidate.platform != AudioPlaybackSnapshot.PLATFORM_ANDROID) return null
        val identity = candidate.identity
        if (identity == null) {
            return if (
                candidate.status == AudioPlaybackStatus.IDLE &&
                candidate.position == 0.0 &&
                candidate.duration == 0.0 &&
                candidate.bufferedPosition == 0.0 &&
                !candidate.playWhenReady &&
                !candidate.isPlaying &&
                candidate.suppressionReason == null &&
                !candidate.canSeek &&
                candidate.error == null
            ) {
                candidate
            } else {
                null
            }
        }
        if (
            !validIdentity(identity) ||
            !validFinite(candidate.position) ||
            !validFinite(candidate.duration) ||
            !validFinite(candidate.bufferedPosition)
        ) {
            return null
        }

        val playingRelationship =
            !candidate.isPlaying ||
                (
                    candidate.status == AudioPlaybackStatus.PLAYING &&
                        candidate.playWhenReady &&
                        candidate.suppressionReason == null
                    )
        val playingStatusRelationship =
            candidate.status != AudioPlaybackStatus.PLAYING ||
                (candidate.isPlaying && candidate.playWhenReady)
        val suppressionRelationship =
            (
                candidate.status == AudioPlaybackStatus.SUPPRESSED &&
                    candidate.suppressionReason != null
                ) ||
                (
                    candidate.status != AudioPlaybackStatus.SUPPRESSED &&
                        candidate.suppressionReason == null
                    )
        val errorRelationship =
            (
                candidate.status == AudioPlaybackStatus.ERROR &&
                    candidate.error != null
                ) ||
                (
                    candidate.status != AudioPlaybackStatus.ERROR &&
                        candidate.error == null
                    )
        if (
            !playingRelationship ||
            !playingStatusRelationship ||
            !suppressionRelationship ||
            !errorRelationship
        ) {
            return null
        }

        return candidate.copy(
            identity = identity.copy(),
            position = clamp(candidate.position, candidate.duration),
            bufferedPosition = clamp(candidate.bufferedPosition, candidate.duration),
            canSeek = candidate.canSeek && candidate.duration > 0.0
        )
    }

    private fun replaceCurrent(
        position: Double = current.position,
        status: AudioPlaybackStatus = current.status,
        playWhenReady: Boolean = current.playWhenReady,
        isPlaying: Boolean = current.isPlaying,
        suppressionReason: AudioSuppressionReason? = current.suppressionReason,
        error: AudioPlaybackErrorCode? = current.error
    ) {
        current = current.copy(
            position = clamp(position, current.duration),
            status = status,
            playWhenReady = playWhenReady,
            isPlaying = isPlaying,
            suppressionReason = suppressionReason,
            error = error,
            revision = nextRevision()
        )
    }

    private fun nextRevision(): Long {
        val next = maxOf(acceptedRevision, current.revision) + 1L
        acceptedRevision = next
        return next
    }

    private fun validIdentity(identity: AudioPlaybackIdentity): Boolean =
        identity.chatId.isNotBlank() &&
            identity.messageId.isNotBlank() &&
            identity.fileId.isNotBlank()

    private fun validFinite(value: Double): Boolean = value.isFinite() && value >= 0.0

    private fun clamp(position: Double, duration: Double): Double {
        val nonNegative = position.coerceAtLeast(0.0)
        return if (duration > 0.0) nonNegative.coerceAtMost(duration) else nonNegative
    }

    private fun idleSnapshot(revision: Long) = AudioPlaybackSnapshot(
        identity = null,
        position = 0.0,
        duration = 0.0,
        bufferedPosition = 0.0,
        status = AudioPlaybackStatus.IDLE,
        playWhenReady = false,
        isPlaying = false,
        suppressionReason = null,
        canSeek = false,
        error = null,
        revision = revision
    )
}
