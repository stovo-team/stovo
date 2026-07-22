package com.stakhovivan.stovo

enum class PiPOwner(val wireValue: String) {
    NONE("none"),
    CALL("call"),
    VIDEO("video")
}

enum class PiPAction(val wireValue: String) {
    PLAY("play"),
    PAUSE("pause"),
    SEEK_BACKWARD("seek-backward"),
    SEEK_FORWARD("seek-forward");

    companion object {
        fun fromWireValue(value: String?): PiPAction? = entries.firstOrNull {
            it.wireValue == value
        }
    }
}

data class VideoPiPState(
    val active: Boolean,
    val playing: Boolean,
    val chatId: String,
    val messageId: String,
    val fileId: String,
    val positionSeconds: Double,
    val durationSeconds: Double,
    val width: Double,
    val height: Double,
    val revision: Long
)

data class PiPCoordinatorSnapshot(
    val requestedOwner: PiPOwner,
    val activeOwner: PiPOwner,
    val eligible: Boolean,
    val callActive: Boolean,
    val callVideo: Boolean,
    val callChatId: String?,
    val callSessionId: String?,
    val videoState: VideoPiPState?,
    val acceptedVideoRevision: Long
)

class PictureInPictureCoordinator {
    private data class CallState(
        val active: Boolean = false,
        val video: Boolean = false,
        val chatId: String? = null,
        val sessionId: String? = null
    )

    private var callState = CallState()
    private var videoState: VideoPiPState? = null
    private var acceptedVideoRevision = -1L
    private var activePictureInPicture: PiPCoordinatorSnapshot? = null

    fun updateCallState(
        active: Boolean,
        video: Boolean,
        chatId: String?,
        sessionId: String?
    ) {
        callState = if (active) {
            CallState(active = true, video = video, chatId = chatId, sessionId = sessionId)
        } else {
            CallState()
        }
    }

    fun updateVideoState(candidate: VideoPiPState): Boolean {
        if (candidate.revision < 0 || candidate.revision < acceptedVideoRevision) return false
        acceptedVideoRevision = candidate.revision

        val normalized = normalize(candidate)
        videoState = normalized
        val activeSnapshot = activePictureInPicture
        if (
            normalized != null &&
            activeSnapshot?.activeOwner == PiPOwner.VIDEO &&
            sameIdentity(activeSnapshot.videoState, normalized)
        ) {
            activePictureInPicture = activeSnapshot.copy(videoState = normalized)
        }
        return normalized != null
    }

    fun snapshot(): PiPCoordinatorSnapshot {
        val requestedOwner = requestedOwner()
        val activeSnapshot = activePictureInPicture
        return PiPCoordinatorSnapshot(
            requestedOwner = requestedOwner,
            activeOwner = activeSnapshot?.activeOwner ?: PiPOwner.NONE,
            eligible = requestedOwner != PiPOwner.NONE,
            callActive = callState.active,
            callVideo = callState.video,
            callChatId = callState.chatId,
            callSessionId = callState.sessionId,
            videoState = activeSnapshot?.videoState ?: videoState,
            acceptedVideoRevision = acceptedVideoRevision
        )
    }

    fun captureForEntry(): PiPCoordinatorSnapshot? {
        val current = snapshot()
        if (current.requestedOwner == PiPOwner.NONE) return null
        return current.copy(
            activeOwner = current.requestedOwner,
            videoState = if (current.requestedOwner == PiPOwner.VIDEO) videoState else null
        ).also { activePictureInPicture = it }
    }

    fun activePictureInPictureSnapshot(): PiPCoordinatorSnapshot? = activePictureInPicture

    fun clearActivePictureInPicture() {
        activePictureInPicture = null
    }

    fun availableActions(): List<PiPAction> {
        val captured = activePictureInPicture ?: return emptyList()
        if (captured.activeOwner != PiPOwner.VIDEO) return emptyList()
        val state = captured.videoState ?: return emptyList()
        return listOf(
            PiPAction.SEEK_BACKWARD,
            if (state.playing) PiPAction.PAUSE else PiPAction.PLAY,
            PiPAction.SEEK_FORWARD
        )
    }

    fun performAction(action: PiPAction): VideoPiPState? {
        val captured = activePictureInPicture ?: return null
        if (captured.activeOwner != PiPOwner.VIDEO) return null
        val current = captured.videoState ?: return null
        val updated = when (action) {
            PiPAction.PLAY -> current.copy(active = true, playing = true)
            PiPAction.PAUSE -> current.copy(playing = false)
            PiPAction.SEEK_BACKWARD -> current.copy(
                positionSeconds = clampPosition(current.positionSeconds - SEEK_SECONDS, current.durationSeconds)
            )
            PiPAction.SEEK_FORWARD -> current.copy(
                positionSeconds = clampPosition(current.positionSeconds + SEEK_SECONDS, current.durationSeconds)
            )
        }
        activePictureInPicture = captured.copy(videoState = updated)
        if (sameIdentity(videoState, updated)) videoState = updated
        return updated
    }

    private fun requestedOwner(): PiPOwner {
        if (callState.active) return if (callState.video) PiPOwner.CALL else PiPOwner.NONE
        val currentVideo = videoState
        return if (currentVideo?.active == true && currentVideo.playing) {
            PiPOwner.VIDEO
        } else {
            PiPOwner.NONE
        }
    }

    private fun normalize(candidate: VideoPiPState): VideoPiPState? {
        if (
            candidate.chatId.isBlank() ||
            candidate.messageId.isBlank() ||
            candidate.fileId.isBlank() ||
            !candidate.positionSeconds.isFinite() ||
            !candidate.durationSeconds.isFinite() ||
            !candidate.width.isFinite() ||
            !candidate.height.isFinite() ||
            candidate.positionSeconds < 0 ||
            candidate.durationSeconds < 0 ||
            candidate.width < 0 ||
            candidate.height < 0
        ) {
            return null
        }
        return candidate.copy(
            positionSeconds = clampPosition(candidate.positionSeconds, candidate.durationSeconds)
        )
    }

    private fun clampPosition(positionSeconds: Double, durationSeconds: Double): Double {
        val nonNegative = positionSeconds.coerceAtLeast(0.0)
        return if (durationSeconds > 0) nonNegative.coerceAtMost(durationSeconds) else nonNegative
    }

    private fun sameIdentity(left: VideoPiPState?, right: VideoPiPState?): Boolean {
        return left != null && right != null &&
            left.chatId == right.chatId &&
            left.messageId == right.messageId &&
            left.fileId == right.fileId
    }

    private companion object {
        const val SEEK_SECONDS = 10.0
    }
}
