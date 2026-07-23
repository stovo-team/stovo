package com.stakhovivan.stovo

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import java.io.IOException
import kotlin.math.max

private const val API_ORIGIN = "https://stovo-local.stovo.ru"
const val AUDIO_RETURN_URI = "$API_ORIGIN/app/audio"

private class PlaybackCredentialStore {
    var sourceUrl: String? = null
        private set
    var token: String? = null
        private set

    fun set(sourceUrl: String, token: String) {
        this.sourceUrl = sourceUrl
        this.token = token
    }

    fun clear() {
        sourceUrl = null
        token = null
    }
}

private class PlaybackResumeStore(service: AudioPlaybackService) {
    private val preferences =
        service.getSharedPreferences("audio_playback_resume", Context.MODE_PRIVATE)

    fun save(snapshot: AudioPlaybackSnapshot) {
        val identity = snapshot.identity ?: return clear()
        preferences.edit()
            .putString("chat_id", identity.chatId)
            .putString("message_id", identity.messageId)
            .putString("file_id", identity.fileId)
            .putLong("position_bits", snapshot.position.toBits())
            .putLong("duration_bits", snapshot.duration.toBits())
            .putBoolean("former_play_when_ready", snapshot.playWhenReady)
            .apply()
    }

    fun restore(): AudioPlaybackRecovery? {
        val chatId = preferences.getString("chat_id", null) ?: return null
        val messageId = preferences.getString("message_id", null) ?: return null
        val fileId = preferences.getString("file_id", null) ?: return null
        val position = Double.fromBits(preferences.getLong("position_bits", 0L))
        val duration = Double.fromBits(preferences.getLong("duration_bits", 0L))
        if (!position.isFinite() || position < 0.0 || !duration.isFinite() || duration < 0.0) {
            clear()
            return null
        }
        return AudioPlaybackRecovery(
            identity = AudioPlaybackIdentity(chatId, messageId, fileId),
            position = position,
            duration = duration,
            formerPlayWhenReady = preferences.getBoolean("former_play_when_ready", false)
        )
    }

    fun clear() {
        preferences.edit().clear().apply()
    }
}

@OptIn(UnstableApi::class)
class AudioPlaybackService : MediaSessionService() {
    private val coordinator = AudioPlaybackCoordinator()
    private val credentials = PlaybackCredentialStore()
    private lateinit var resumeStore: PlaybackResumeStore
    private lateinit var player: ExoPlayer
    private lateinit var mediaSession: MediaSession
    private var identity: AudioPlaybackIdentity? = null
    private var callActive = false
    private var revision = 0L
    private var released = false

    override fun onCreate() {
        super.onCreate()
        resumeStore = PlaybackResumeStore(this)

        val httpFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(false)
        val resolvingFactory = ResolvingDataSource.Factory(httpFactory) { dataSpec ->
            val source = credentials.sourceUrl
                ?: throw IOException("Audio authorization required")
            val token = credentials.token
                ?: throw IOException("Audio authorization required")
            if (!isExactMediaUrl(dataSpec.uri, identity?.fileId) || dataSpec.uri.toString() != source) {
                throw IOException("Audio source rejected")
            }
            dataSpec.buildUpon()
                .setHttpRequestHeaders(
                    dataSpec.httpRequestHeaders + ("X-Stovo-Media-Token" to token)
                )
                .build()
        }
        val protectedFactory = DataSource.Factory {
            OriginCheckingDataSource(resolvingFactory.createDataSource())
        }
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
            .setUsage(C.USAGE_MEDIA)
            .build()
        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(protectedFactory))
            .setSeekBackIncrementMs(SEEK_INCREMENT_MS)
            .setSeekForwardIncrementMs(SEEK_INCREMENT_MS)
            .build()
            .also {
                it.setAudioAttributes(audioAttributes, true)
                it.setHandleAudioBecomingNoisy(true)
                it.addListener(playerListener)
            }

        mediaSession = MediaSession.Builder(this, player)
            .setCallback(SessionCallback())
            .setSessionActivity(buildSessionActivity())
            .build()

        resumeStore.restore()?.let {
            coordinator.restore(it)
            identity = it.identity
        }
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo
    ): MediaSession = mediaSession

    override fun onDestroy() {
        if (!released) {
            released = true
            mediaSession.release()
            player.release()
        }
        super.onDestroy()
    }

    private val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            if (callActive && player.playWhenReady) {
                player.pause()
                return
            }
            publishPlayerState()
        }

        override fun onPlayerError(error: PlaybackException) {
            credentials.clear()
            publishPlayerState(mapPlaybackError(error))
        }
    }

    private inner class SessionCallback : MediaSession.Callback {
        override fun onConnect(
            session: MediaSession,
            controller: MediaSession.ControllerInfo
        ): MediaSession.ConnectionResult {
            val ownPackage = controller.packageName == packageName
            if (!ownPackage && !controller.isTrusted) {
                return MediaSession.ConnectionResult.reject()
            }
            val base = super.onConnect(session, controller)
            if (!ownPackage) return base
            val commands = base.availableSessionCommands.buildUpon()
                .add(COMMAND_LOAD)
                .add(COMMAND_GET_STATE)
                .add(COMMAND_CLEAR)
                .add(COMMAND_SET_CALL_ACTIVE)
                .build()
            return MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(commands)
                .setAvailablePlayerCommands(base.availablePlayerCommands)
                .build()
        }

        override fun onCustomCommand(
            session: MediaSession,
            controller: MediaSession.ControllerInfo,
            customCommand: SessionCommand,
            args: Bundle
        ): ListenableFuture<SessionResult> {
            if (controller.packageName != packageName) {
                return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_PERMISSION_DENIED))
            }
            val result = when (customCommand.customAction) {
                COMMAND_LOAD.customAction -> load(args)
                COMMAND_GET_STATE.customAction ->
                    SessionResult(SessionResult.RESULT_SUCCESS, snapshotBundle())
                COMMAND_CLEAR.customAction -> {
                    clearPlayback(AudioPlaybackCleanupReason.EXPLICIT_CLOSE)
                    SessionResult(SessionResult.RESULT_SUCCESS, snapshotBundle())
                }
                COMMAND_SET_CALL_ACTIVE.customAction -> {
                    setCallActive(args.getBoolean(KEY_CALL_ACTIVE, false))
                    SessionResult(SessionResult.RESULT_SUCCESS, snapshotBundle())
                }
                else -> SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED)
            }
            return Futures.immediateFuture(result)
        }
    }

    private fun load(args: Bundle): SessionResult {
        val requestedIdentity = AudioPlaybackIdentity(
            args.getString(KEY_CHAT_ID).orEmpty(),
            args.getString(KEY_MESSAGE_ID).orEmpty(),
            args.getString(KEY_FILE_ID).orEmpty()
        )
        val sourceUrl = args.getString(KEY_SOURCE_URL).orEmpty()
        val token = args.getString(KEY_TOKEN).orEmpty()
        val positionSeconds = args.getDouble(KEY_POSITION, Double.NaN)
        val requestedPlay = args.getBoolean(KEY_PLAY_WHEN_READY, false)
        val decision = coordinator.evaluateLoad(
            identity = requestedIdentity,
            itemCount = 1,
            hasScopedCredential = token.isNotBlank(),
            startPosition = positionSeconds,
            requestedPlay = requestedPlay
        )
        if (!decision.accepted || !isExactMediaUrl(sourceUrl.toUri(), requestedIdentity.fileId)) {
            return SessionResult(SessionResult.RESULT_ERROR_BAD_VALUE)
        }

        identity = requestedIdentity
        credentials.set(sourceUrl, token)
        val metadata = MediaMetadata.Builder()
            .setTitle("Audio attachment")
            .setArtist("Stovo")
            .build()
        val item = MediaItem.Builder()
            .setMediaId(GENERIC_MEDIA_ID)
            .setUri(sourceUrl)
            .setMediaMetadata(metadata)
            .build()
        player.setMediaItem(item, (decision.startPosition * 1000.0).toLong())
        player.prepare()
        player.playWhenReady = decision.playWhenReady
        publishPlayerState()
        return SessionResult(SessionResult.RESULT_SUCCESS, snapshotBundle())
    }

    private fun setCallActive(active: Boolean) {
        callActive = active
        coordinator.setCallActive(active)
        if (active) player.pause()
        publishPlayerState(
            suppression = if (active && identity != null) AudioSuppressionReason.CALL else null
        )
    }

    private fun publishPlayerState(
        error: AudioPlaybackErrorCode? = null,
        suppression: AudioSuppressionReason? = null
    ) {
        val currentIdentity = identity
        val state = AudioPlaybackServiceState(
            identity = currentIdentity,
            engineState = when (player.playbackState) {
                Player.STATE_BUFFERING -> AudioPlaybackEngineState.BUFFERING
                Player.STATE_READY -> AudioPlaybackEngineState.READY
                Player.STATE_ENDED -> AudioPlaybackEngineState.ENDED
                else -> AudioPlaybackEngineState.IDLE
            },
            playWhenReady = player.playWhenReady && !callActive,
            isPlaying = player.isPlaying && !callActive,
            suppressionReason = suppression ?: if (callActive && currentIdentity != null) {
                AudioSuppressionReason.CALL
            } else {
                null
            },
            position = max(0L, player.currentPosition).toDouble() / 1000.0,
            duration = if (player.duration == C.TIME_UNSET) {
                0.0
            } else {
                max(0L, player.duration).toDouble() / 1000.0
            },
            bufferedPosition = max(0L, player.bufferedPosition).toDouble() / 1000.0,
            canSeek = player.isCurrentMediaItemSeekable,
            error = error,
            revision = ++revision
        )
        coordinator.acceptServiceState(state)
        val snapshot = coordinator.snapshot()
        if (snapshot.identity != null) resumeStore.save(snapshot)
        if (::mediaSession.isInitialized) {
            mediaSession.broadcastCustomCommand(EVENT_STATE_CHANGED, snapshotBundle(snapshot))
        }
    }

    private fun clearPlayback(reason: AudioPlaybackCleanupReason) {
        player.pause()
        player.stop()
        player.clearMediaItems()
        credentials.clear()
        resumeStore.clear()
        coordinator.cleanup(reason)
        identity = null
        callActive = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun snapshotBundle(snapshot: AudioPlaybackSnapshot = coordinator.snapshot()) = Bundle().apply {
        snapshot.identity?.let {
            putString(KEY_CHAT_ID, it.chatId)
            putString(KEY_MESSAGE_ID, it.messageId)
            putString(KEY_FILE_ID, it.fileId)
        }
        putDouble(KEY_POSITION, snapshot.position)
        putDouble(KEY_DURATION, snapshot.duration)
        putDouble(KEY_BUFFERED_POSITION, snapshot.bufferedPosition)
        putString(KEY_STATUS, snapshot.status.wireValue)
        putBoolean(KEY_PLAY_WHEN_READY, snapshot.playWhenReady)
        putBoolean(KEY_IS_PLAYING, snapshot.isPlaying)
        snapshot.suppressionReason?.let { putString(KEY_SUPPRESSION_REASON, it.wireValue) }
        putBoolean(KEY_CAN_SEEK, snapshot.canSeek)
        snapshot.error?.let { putString(KEY_ERROR, it.wireValue) }
        putLong(KEY_REVISION, snapshot.revision)
        putString(KEY_PLATFORM, snapshot.platform)
    }

    private fun buildSessionActivity(): PendingIntent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(AUDIO_RETURN_URI), this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun isExactMediaUrl(uri: Uri, fileId: String?): Boolean {
        if (fileId.isNullOrBlank()) return false
        val origin = Uri.parse(API_ORIGIN)
        return uri.scheme == origin.scheme &&
            uri.host == origin.host &&
            effectivePort(uri) == effectivePort(origin) &&
            uri.userInfo == null &&
            uri.query == null &&
            uri.fragment == null &&
            uri.pathSegments.size == 3 &&
            uri.pathSegments[0] == "api" &&
            uri.pathSegments[1] == "media" &&
            uri.pathSegments[2] == fileId
    }

    private fun effectivePort(uri: Uri): Int =
        if (uri.port != -1) uri.port else if (uri.scheme == "https") 443 else 80

    private fun mapPlaybackError(error: PlaybackException): AudioPlaybackErrorCode =
        when (error.errorCode) {
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
                AudioPlaybackErrorCode.NETWORK
            PlaybackException.ERROR_CODE_DECODING_FAILED,
            PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ->
                AudioPlaybackErrorCode.DECODE
            PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
            PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ->
                AudioPlaybackErrorCode.UNSUPPORTED
            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
                AudioPlaybackErrorCode.AUTHORIZATION
            else -> AudioPlaybackErrorCode.UNKNOWN
        }

    private class OriginCheckingDataSource(
        private val upstream: DataSource
    ) : DataSource by upstream {
        override fun open(dataSpec: DataSpec): Long {
            val opened = upstream.open(dataSpec)
            val finalUri = upstream.uri
            val expected = Uri.parse(API_ORIGIN)
            if (
                finalUri == null ||
                finalUri.scheme != expected.scheme ||
                finalUri.host != expected.host ||
                effectivePort(finalUri) != effectivePort(expected)
            ) {
                upstream.close()
                throw IOException("Audio redirect rejected")
            }
            return opened
        }

        private fun effectivePort(uri: Uri): Int =
            if (uri.port != -1) uri.port else if (uri.scheme == "https") 443 else 80
    }

    companion object {
        const val KEY_CHAT_ID = "chatId"
        const val KEY_MESSAGE_ID = "messageId"
        const val KEY_FILE_ID = "fileId"
        const val KEY_SOURCE_URL = "sourceUrl"
        const val KEY_TOKEN = "token"
        const val KEY_POSITION = "position"
        const val KEY_DURATION = "duration"
        const val KEY_BUFFERED_POSITION = "bufferedPosition"
        const val KEY_PLAY_WHEN_READY = "playWhenReady"
        const val KEY_IS_PLAYING = "isPlaying"
        const val KEY_STATUS = "status"
        const val KEY_SUPPRESSION_REASON = "suppressionReason"
        const val KEY_CAN_SEEK = "canSeek"
        const val KEY_ERROR = "error"
        const val KEY_REVISION = "revision"
        const val KEY_PLATFORM = "platform"
        const val KEY_CALL_ACTIVE = "active"

        private const val GENERIC_MEDIA_ID = "stovo-audio"
        private const val SEEK_INCREMENT_MS = 10_000L

        val COMMAND_LOAD = SessionCommand(AudioPlaybackCustomCommand.LOAD.wireValue, Bundle.EMPTY)
        val COMMAND_GET_STATE =
            SessionCommand(AudioPlaybackCustomCommand.GET_STATE.wireValue, Bundle.EMPTY)
        val COMMAND_CLEAR = SessionCommand(AudioPlaybackCustomCommand.CLEAR.wireValue, Bundle.EMPTY)
        val COMMAND_SET_CALL_ACTIVE =
            SessionCommand(AudioPlaybackCustomCommand.SET_CALL_ACTIVE.wireValue, Bundle.EMPTY)
        val EVENT_STATE_CHANGED =
            SessionCommand("com.stakhovivan.stovo.audio.STATE_CHANGED", Bundle.EMPTY)
    }
}
