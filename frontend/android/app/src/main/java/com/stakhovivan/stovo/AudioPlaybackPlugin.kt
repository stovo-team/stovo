package com.stakhovivan.stovo

import android.content.ComponentName
import android.net.Uri
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionResult
import androidx.media3.session.SessionToken
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import org.json.JSONObject

@CapacitorPlugin(name = "AudioPlaybackPlugin")
class AudioPlaybackPlugin : Plugin() {
    private val executor by lazy { ContextCompat.getMainExecutor(context) }
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var destroyed = false

    private val controllerListener = object : MediaController.Listener {
        override fun onCustomCommand(
            controller: MediaController,
            command: SessionCommand,
            args: Bundle
        ): ListenableFuture<SessionResult> {
            if (command.customAction == AudioPlaybackService.EVENT_STATE_CHANGED.customAction) {
                emitSnapshot(args)
                return Futures.immediateFuture(SessionResult(SessionResult.RESULT_SUCCESS))
            }
            return Futures.immediateFuture(SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED))
        }
    }

    override fun load() {
        super.load()
        withController(null) { controller ->
            requestState(controller, null, emit = true)
        }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        withController(call) { requestState(it, call, emit = false) }
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val chatId = call.getString(AudioPlaybackService.KEY_CHAT_ID).orEmpty()
        val messageId = call.getString(AudioPlaybackService.KEY_MESSAGE_ID).orEmpty()
        val fileId = call.getString(AudioPlaybackService.KEY_FILE_ID).orEmpty()
        val sourceUrl = call.getString(AudioPlaybackService.KEY_SOURCE_URL).orEmpty()
        val token = call.getString(AudioPlaybackService.KEY_TOKEN).orEmpty()
        val startPosition = call.getDouble("startPosition") ?: Double.NaN
        if (
            chatId.isBlank() ||
            messageId.isBlank() ||
            fileId.isBlank() ||
            token.isBlank() ||
            !startPosition.isFinite() ||
            startPosition < 0.0 ||
            !isExactMediaUrl(sourceUrl, fileId)
        ) {
            call.reject("Invalid audio load request")
            return
        }
        val args = Bundle().apply {
            putString(AudioPlaybackService.KEY_CHAT_ID, chatId)
            putString(AudioPlaybackService.KEY_MESSAGE_ID, messageId)
            putString(AudioPlaybackService.KEY_FILE_ID, fileId)
            putString(AudioPlaybackService.KEY_SOURCE_URL, sourceUrl)
            putString(AudioPlaybackService.KEY_TOKEN, token)
            putDouble(AudioPlaybackService.KEY_POSITION, startPosition)
            putBoolean(AudioPlaybackService.KEY_PLAY_WHEN_READY, false)
        }
        withController(call) {
            sendCommand(it, AudioPlaybackService.COMMAND_LOAD, args, call, resolveState = false)
        }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        withController(call) { controller ->
            try {
                if (controller.playbackState == Player.STATE_ENDED) {
                    val seekFuture = controller.seekTo(0L)
                    seekFuture.addListener(
                        {
                            try {
                                seekFuture.get()
                                controller.play()
                                call.resolve()
                            } catch (_: Exception) {
                                call.reject("Audio play unavailable")
                            }
                        },
                        executor,
                    )
                    return@withController
                }
                controller.play()
                call.resolve()
            } catch (_: Exception) {
                call.reject("Audio play unavailable")
            }
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        withController(call) {
            it.pause()
            call.resolve()
        }
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        val position = call.getDouble(AudioPlaybackService.KEY_POSITION) ?: Double.NaN
        if (!position.isFinite() || position < 0.0) {
            call.reject("Invalid audio seek position")
            return
        }
        withController(call) { controller ->
            try {
                val seekFuture = controller.seekTo((position * 1000.0).toLong())
                seekFuture.addListener(
                    {
                        try {
                            seekFuture.get()
                            call.resolve()
                        } catch (_: Exception) {
                            call.reject("Audio seek unavailable")
                        }
                    },
                    executor,
                )
            } catch (_: Exception) {
                call.reject("Audio seek unavailable")
            }
        }
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        withController(call) { controller ->
            sendCommand(
                controller,
                AudioPlaybackService.COMMAND_CLEAR,
                Bundle.EMPTY,
                call,
                resolveState = false
            )
            // Service stops itself on clear — drop the stale controller handle.
            releaseController()
        }
    }

    @PluginMethod
    fun setCallActive(call: PluginCall) {
        val active = call.getBoolean(AudioPlaybackService.KEY_CALL_ACTIVE)
        if (active == null) {
            call.reject("Invalid call state")
            return
        }
        val args = Bundle().apply {
            putBoolean(AudioPlaybackService.KEY_CALL_ACTIVE, active)
        }
        withController(call) {
            sendCommand(
                it,
                AudioPlaybackService.COMMAND_SET_CALL_ACTIVE,
                args,
                call,
                resolveState = false
            )
        }
    }

    override fun handleOnDestroy() {
        destroyed = true
        controllerFuture?.let(MediaController::releaseFuture)
        controllerFuture = null
        super.handleOnDestroy()
    }

    private fun withController(
        call: PluginCall?,
        allowRetry: Boolean = true,
        action: (MediaController) -> Unit,
    ) {
        if (destroyed) {
            call?.reject("Audio controller unavailable")
            return
        }
        val future = controllerFuture ?: MediaController.Builder(
            context,
            SessionToken(context, ComponentName(context, AudioPlaybackService::class.java))
        )
            .setListener(controllerListener)
            .buildAsync()
            .also { controllerFuture = it }
        future.addListener(
            {
                try {
                    if (destroyed) return@addListener
                    val controller = future.get()
                    if (!controller.isConnected) {
                        releaseController(future)
                        if (allowRetry) {
                            withController(call, allowRetry = false, action = action)
                        } else {
                            call?.reject("Audio controller unavailable")
                        }
                        return@addListener
                    }
                    try {
                        action(controller)
                    } catch (_: Exception) {
                        // MediaSession can be mid-teardown during clear/stopSelf.
                        releaseController(future)
                        if (allowRetry) {
                            withController(call, allowRetry = false, action = action)
                        } else {
                            call?.reject("Audio controller unavailable")
                        }
                    }
                } catch (_: Exception) {
                    releaseController(future)
                    if (allowRetry) {
                        withController(call, allowRetry = false, action = action)
                    } else {
                        call?.reject("Audio controller unavailable")
                    }
                }
            },
            executor
        )
    }

    private fun releaseController(future: ListenableFuture<MediaController>? = controllerFuture) {
        if (future == null) return
        if (controllerFuture === future) controllerFuture = null
        MediaController.releaseFuture(future)
    }

    private fun requestState(
        controller: MediaController,
        call: PluginCall?,
        emit: Boolean
    ) {
        sendCommand(
            controller,
            AudioPlaybackService.COMMAND_GET_STATE,
            Bundle.EMPTY,
            call,
            resolveState = !emit,
            emitState = emit
        )
    }

    private fun sendCommand(
        controller: MediaController,
        command: SessionCommand,
        args: Bundle,
        call: PluginCall?,
        resolveState: Boolean,
        emitState: Boolean = false
    ) {
        val future = controller.sendCustomCommand(command, args)
        future.addListener(
            {
                try {
                    val result = future.get()
                    if (result.resultCode != SessionResult.RESULT_SUCCESS) {
                        call?.reject("Audio command rejected")
                        return@addListener
                    }
                    val payload = snapshotObject(result.extras)
                    if (emitState) notifyListeners("stateChanged", payload)
                    if (resolveState) call?.resolve(payload) else call?.resolve()
                } catch (_: Exception) {
                    call?.reject("Audio command unavailable")
                }
            },
            executor
        )
    }

    private fun emitSnapshot(bundle: Bundle) {
        notifyListeners("stateChanged", snapshotObject(bundle))
        // Natural end keeps the service + media item alive for seek+play replay.
        // Only explicit clear() releases the controller (service stopSelf).
    }

    /**
     * Capacitor's JSObject extends JSONObject: put(key, null) *removes* the key.
     * The JS bridge requires a closed schema (null fields present as JSON null),
     * so optional values must use JSONObject.NULL or every playing/paused update
     * is dropped and the in-app player never shows pause, progress, or EQ.
     */
    private fun snapshotObject(bundle: Bundle): JSObject = JSObject().apply {
        val chatId = bundle.getString(AudioPlaybackService.KEY_CHAT_ID)
        val messageId = bundle.getString(AudioPlaybackService.KEY_MESSAGE_ID)
        val fileId = bundle.getString(AudioPlaybackService.KEY_FILE_ID)
        if (chatId != null && messageId != null && fileId != null) {
            put(
                "identity",
                JSObject().apply {
                    put(AudioPlaybackService.KEY_CHAT_ID, chatId)
                    put(AudioPlaybackService.KEY_MESSAGE_ID, messageId)
                    put(AudioPlaybackService.KEY_FILE_ID, fileId)
                }
            )
        } else {
            put("identity", JSONObject.NULL)
        }
        put(AudioPlaybackService.KEY_POSITION, bundle.getDouble(AudioPlaybackService.KEY_POSITION))
        put(AudioPlaybackService.KEY_DURATION, bundle.getDouble(AudioPlaybackService.KEY_DURATION))
        put(
            AudioPlaybackService.KEY_BUFFERED_POSITION,
            bundle.getDouble(AudioPlaybackService.KEY_BUFFERED_POSITION)
        )
        putNullable(AudioPlaybackService.KEY_STATUS, bundle.getString(AudioPlaybackService.KEY_STATUS))
        put(
            AudioPlaybackService.KEY_PLAY_WHEN_READY,
            bundle.getBoolean(AudioPlaybackService.KEY_PLAY_WHEN_READY)
        )
        put(AudioPlaybackService.KEY_IS_PLAYING, bundle.getBoolean(AudioPlaybackService.KEY_IS_PLAYING))
        putNullable(
            AudioPlaybackService.KEY_SUPPRESSION_REASON,
            bundle.getString(AudioPlaybackService.KEY_SUPPRESSION_REASON)
        )
        put(AudioPlaybackService.KEY_CAN_SEEK, bundle.getBoolean(AudioPlaybackService.KEY_CAN_SEEK))
        putNullable(AudioPlaybackService.KEY_ERROR, bundle.getString(AudioPlaybackService.KEY_ERROR))
        put(AudioPlaybackService.KEY_REVISION, bundle.getLong(AudioPlaybackService.KEY_REVISION))
        putNullable(
            AudioPlaybackService.KEY_PLATFORM,
            bundle.getString(AudioPlaybackService.KEY_PLATFORM)
        )
    }

    private fun JSObject.putNullable(key: String, value: String?) {
        if (value == null) put(key, JSONObject.NULL) else put(key, value)
    }

    private fun isExactMediaUrl(sourceUrl: String, fileId: String): Boolean {
        if (fileId.isBlank()) return false
        val uri = Uri.parse(sourceUrl)
        val scheme = uri.scheme?.lowercase()
        val segments = uri.pathSegments
        val pathFileId = if (
            segments.size == 3 &&
            segments[0] == "api" &&
            segments[1] == "media"
        ) {
            Uri.decode(segments[2])
        } else {
            null
        }
        // Accept the configured API origin (http/https). Auth is the short-lived playback token.
        return (scheme == "https" || scheme == "http") &&
            !uri.host.isNullOrBlank() &&
            uri.userInfo == null &&
            uri.query == null &&
            uri.fragment == null &&
            pathFileId == fileId
    }
}
