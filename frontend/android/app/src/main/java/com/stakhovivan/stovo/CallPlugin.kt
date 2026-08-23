package com.stakhovivan.stovo

import android.app.Activity
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.Icon
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import android.util.Rational
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.lang.ref.WeakReference

@CapacitorPlugin(name = "CallPlugin")
class CallPlugin : Plugin() {
    companion object {
        private var activeInstanceRef: WeakReference<CallPlugin>? = null
        fun handleUserLeaveHint(activity: Activity?) {
            activeInstanceRef?.get()?.handleUserLeaveHintInternal(activity)
        }

        fun handlePictureInPictureModeChanged(isInPictureInPictureMode: Boolean) {
            activeInstanceRef?.get()?.handlePictureInPictureModeChangedInternal(
                isInPictureInPictureMode
            )
        }

        fun handlePictureInPictureAction(action: PiPAction) {
            activeInstanceRef?.get()?.handlePictureInPictureActionInternal(action)
        }
    }

    private data class EntryResult(val entered: Boolean, val reason: String)

    private var proximityWakeLock: PowerManager.WakeLock? = null
    private var sensorManager: SensorManager? = null
    private var proximitySensor: Sensor? = null
    private var proximityListener: SensorEventListener? = null
    private var pictureInPictureActive = false
    private val pictureInPictureCoordinator = PictureInPictureCoordinator()

    override fun load() {
        super.load()
        activeInstanceRef = WeakReference(this)
    }

    @PluginMethod
    fun enableCallMode(call: PluginCall) {
        val earpiece = call.getBoolean("earpiece", true) ?: true
        setAudioRoute(earpiece)
        acquireProximityWakeLock()
        registerProximityListener()
        call.resolve()
    }

    @PluginMethod
    fun disableCallMode(call: PluginCall) {
        releaseCallMode()
        call.resolve()
    }

    @PluginMethod
    fun setAudioRoute(call: PluginCall) {
        val earpiece = call.getBoolean("earpiece", true) ?: true
        setAudioRoute(earpiece)
        call.resolve()
    }

    @PluginMethod
    fun setActiveCallState(call: PluginCall) {
        val update = {
            pictureInPictureCoordinator.updateCallState(
                active = call.getBoolean("active", false) ?: false,
                video = call.getBoolean("video", false) ?: false,
                chatId = call.getString("chatId"),
                sessionId = call.getString("sessionId")
            )
            updateAutomaticPictureInPicture()
            call.resolve(buildPictureInPictureState("call-state"))
        }
        val currentActivity = activity ?: bridge?.activity
        if (currentActivity == null) update() else currentActivity.runOnUiThread(update)
    }

    @PluginMethod
    fun setActiveVideoState(call: PluginCall) {
        val candidate = VideoPiPState(
            active = call.getBoolean("active", false) ?: false,
            playing = call.getBoolean("playing", false) ?: false,
            chatId = call.getString("chatId") ?: "",
            messageId = call.getString("messageId") ?: "",
            fileId = call.getString("fileId") ?: "",
            positionSeconds = call.getDouble("positionSeconds") ?: Double.NaN,
            durationSeconds = call.getDouble("durationSeconds") ?: Double.NaN,
            width = call.getDouble("width") ?: Double.NaN,
            height = call.getDouble("height") ?: Double.NaN,
            revision = call.getLong("revision") ?: -1L
        )
        val previousRevision = pictureInPictureCoordinator.snapshot().acceptedVideoRevision
        val update = {
            val accepted = pictureInPictureCoordinator.updateVideoState(candidate)
            val reason = when {
                accepted -> "video-state"
                candidate.revision < previousRevision -> "stale-video-state"
                else -> "invalid-video-state"
            }
            refreshPictureInPictureParams()
            call.resolve(buildPictureInPictureState(reason))
        }
        val currentActivity = activity ?: bridge?.activity
        if (currentActivity == null) update() else currentActivity.runOnUiThread(update)
    }

    @PluginMethod
    fun isPictureInPictureSupported(call: PluginCall) {
        call.resolve(buildPictureInPictureState("query-support"))
    }

    @PluginMethod
    fun isPictureInPictureActive(call: PluginCall) {
        call.resolve(buildPictureInPictureState("query-active"))
    }

    @PluginMethod
    fun enterPictureInPictureIfPossible(call: PluginCall) {
        val currentActivity = activity ?: bridge?.activity
        if (currentActivity == null) {
            call.resolve(buildPictureInPictureState("missing-activity").apply {
                put("entered", false)
            })
            return
        }

        currentActivity.runOnUiThread {
            val result = maybeEnterPictureInPicture(currentActivity, "manual")
            call.resolve(buildPictureInPictureState(result.reason).apply {
                put("entered", result.entered)
            })
        }
    }

    override fun handleOnDestroy() {
        if (activeInstanceRef?.get() === this) activeInstanceRef = null
        pictureInPictureCoordinator.clearActivePictureInPicture()
        releaseCallMode()
        super.handleOnDestroy()
    }

    private fun setAudioRoute(earpiece: Boolean) {
        val am = activity?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        am.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = !earpiece
    }

    private fun acquireProximityWakeLock() {
        if (proximityWakeLock?.isHeld == true) return
        val sm = activity?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        if (sm.getDefaultSensor(Sensor.TYPE_PROXIMITY) == null) return
        val pm = activity?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        try {
            @Suppress("DEPRECATION")
            proximityWakeLock = pm.newWakeLock(
                PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                "stovo:call-proximity"
            )
            proximityWakeLock?.acquire()
        } catch (_: SecurityException) {
            proximityWakeLock = null
        }
    }

    private fun registerProximityListener() {
        if (proximityListener != null) return
        val sm = activity?.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        val sensor = sm.getDefaultSensor(Sensor.TYPE_PROXIMITY) ?: return
        sensorManager = sm
        proximitySensor = sensor
        proximityListener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                val maxRange = proximitySensor?.maximumRange ?: 5f
                val payload = JSObject()
                payload.put("near", event.values[0] < maxRange)
                notifyListeners("proximityChange", payload)
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        sm.registerListener(proximityListener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
    }

    private fun releaseCallMode() {
        unregisterProximityListener()
        releaseProximityWakeLock()
        val am = activity?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        am.mode = AudioManager.MODE_NORMAL
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = false
    }

    private fun unregisterProximityListener() {
        val listener = proximityListener ?: return
        sensorManager?.unregisterListener(listener)
        proximityListener = null
        sensorManager = null
        proximitySensor = null
    }

    private fun releaseProximityWakeLock() {
        val lock = proximityWakeLock ?: return
        if (lock.isHeld) lock.release()
        proximityWakeLock = null
    }

    private fun handleUserLeaveHintInternal(hostActivity: Activity?) {
        maybeEnterPictureInPicture(hostActivity, "user-leave")
    }

    private fun handlePictureInPictureModeChangedInternal(isInPictureInPictureMode: Boolean) {
        pictureInPictureActive = isInPictureInPictureMode
        if (isInPictureInPictureMode) {
            if (pictureInPictureCoordinator.activePictureInPictureSnapshot() == null) {
                pictureInPictureCoordinator.captureForEntry()
            }
            notifyPictureInPictureChanged("entered")
        } else {
            notifyPictureInPictureChanged("exited")
            pictureInPictureCoordinator.clearActivePictureInPicture()
        }
    }

    private fun handlePictureInPictureActionInternal(action: PiPAction) {
        val currentActivity = activity ?: bridge?.activity
        fun dispatch() {
            val updated = pictureInPictureCoordinator.performAction(action) ?: return
            refreshPictureInPictureParams()
            val payload = JSObject()
            payload.put("action", action.wireValue)
            payload.put("videoState", buildVideoState(updated))
            notifyListeners("pictureInPictureAction", payload)
        }
        if (currentActivity == null) {
            dispatch()
        } else {
            currentActivity.runOnUiThread { dispatch() }
        }
    }

    private fun maybeEnterPictureInPicture(hostActivity: Activity?, reason: String): EntryResult {
        val currentActivity = hostActivity ?: activity ?: bridge?.activity
            ?: return EntryResult(false, "missing-activity")
        if (!isPictureInPictureSupported(currentActivity)) return EntryResult(false, "unsupported")
        if (!pictureInPictureCoordinator.snapshot().eligible) return EntryResult(false, "ineligible")
        if (currentActivity.isFinishing || currentActivity.isDestroyed) {
            return EntryResult(false, "activity-unavailable")
        }
        if (currentActivity.isInPictureInPictureModeCompat()) return EntryResult(true, "already-active")

        val captured = pictureInPictureCoordinator.captureForEntry()
            ?: return EntryResult(false, "ineligible")
        return try {
            val entered = currentActivity.enterPictureInPictureMode(
                buildPictureInPictureParams(currentActivity, captured)
            )
            if (entered) {
                pictureInPictureActive = currentActivity.isInPictureInPictureModeCompat()
                notifyPictureInPictureChanged(reason)
                EntryResult(true, reason)
            } else {
                pictureInPictureCoordinator.clearActivePictureInPicture()
                EntryResult(false, "entry-rejected")
            }
        } catch (_: IllegalArgumentException) {
            pictureInPictureCoordinator.clearActivePictureInPicture()
            EntryResult(false, "entry-rejected")
        } catch (_: IllegalStateException) {
            pictureInPictureCoordinator.clearActivePictureInPicture()
            EntryResult(false, "entry-rejected")
        } catch (_: SecurityException) {
            pictureInPictureCoordinator.clearActivePictureInPicture()
            EntryResult(false, "entry-denied")
        }
    }

    private fun buildPictureInPictureParams(
        hostActivity: Activity,
        snapshot: PiPCoordinatorSnapshot
    ): PictureInPictureParams {
        val builder = PictureInPictureParams.Builder()
        pictureInPictureAspectRatio(snapshot.activeOwner, snapshot.videoState)
            ?.let { ratio -> builder.setAspectRatio(Rational(ratio.width, ratio.height)) }
        // An explicit empty list replaces Android's media-session defaults for calls.
        // The system still provides its built-in expand and close affordances.
        builder.setActions(buildRemoteActions(hostActivity))
        return builder.build()
    }

    private fun buildRemoteActions(hostActivity: Activity): List<RemoteAction> {
        return pictureInPictureCoordinator.availableActions().map { action ->
            val (iconResource, title) = when (action) {
                PiPAction.PLAY -> android.R.drawable.ic_media_play to "Play"
                PiPAction.PAUSE -> android.R.drawable.ic_media_pause to "Pause"
                PiPAction.SEEK_BACKWARD -> android.R.drawable.ic_media_rew to "Back 10 seconds"
                PiPAction.SEEK_FORWARD -> android.R.drawable.ic_media_ff to "Forward 10 seconds"
            }
            val intent = Intent(hostActivity, PictureInPictureActionReceiver::class.java).apply {
                this.action = PictureInPictureActionReceiver.intentAction(action)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                hostActivity,
                action.ordinal,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            RemoteAction(
                Icon.createWithResource(hostActivity, iconResource),
                title,
                title,
                pendingIntent
            )
        }
    }

    private fun refreshPictureInPictureParams() {
        val currentActivity = activity ?: bridge?.activity ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !currentActivity.isInPictureInPictureModeCompat()) {
            return
        }
        val snapshot = pictureInPictureCoordinator.activePictureInPictureSnapshot() ?: return
        try {
            currentActivity.setPictureInPictureParams(
                buildPictureInPictureParams(currentActivity, snapshot)
            )
        } catch (_: IllegalArgumentException) {
            // The active PiP session and captured restore state remain valid.
        } catch (_: IllegalStateException) {
            // OEMs may reject parameter changes during a lifecycle transition.
        } catch (_: SecurityException) {
            // PiP denial is a typed fallback, never a playback teardown.
        }
    }

    private fun updateAutomaticPictureInPicture() {
        val currentActivity = activity ?: bridge?.activity ?: return
        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            currentActivity.isInPictureInPictureModeCompat() ||
            currentActivity.isFinishing ||
            currentActivity.isDestroyed
        ) {
            return
        }

        val snapshot = pictureInPictureCoordinator.snapshot()
        try {
            val params = PictureInPictureParams.Builder().apply {
                setAutoEnterEnabled(snapshot.eligible)
                pictureInPictureAspectRatio(snapshot.requestedOwner, snapshot.videoState)
                    ?.let { ratio -> setAspectRatio(Rational(ratio.width, ratio.height)) }
            }.build()
            currentActivity.setPictureInPictureParams(params)
        } catch (_: IllegalArgumentException) {
            // Some OEMs reject PiP parameter changes during lifecycle transitions.
        } catch (_: IllegalStateException) {
            // The next explicit app-state transition still attempts PiP entry.
        } catch (_: SecurityException) {
            // PiP support is optional and must never affect the live call.
        }
    }

    private fun notifyPictureInPictureChanged(reason: String) {
        notifyListeners("pictureInPictureChange", buildPictureInPictureState(reason))
    }

    private fun buildPictureInPictureState(reason: String): JSObject {
        val snapshot = pictureInPictureCoordinator.snapshot()
        val owner = if (snapshot.activeOwner != PiPOwner.NONE) {
            snapshot.activeOwner
        } else {
            snapshot.requestedOwner
        }
        return JSObject().apply {
            put("active", pictureInPictureActive)
            put("supported", isPictureInPictureSupported(activity ?: bridge?.activity))
            put("eligible", snapshot.eligible)
            put("owner", owner.wireValue)
            put("requestedOwner", snapshot.requestedOwner.wireValue)
            put("activeOwner", snapshot.activeOwner.wireValue)
            put("callActive", snapshot.callActive)
            put("video", snapshot.callVideo)
            put("chatId", snapshot.callChatId)
            put("sessionId", snapshot.callSessionId)
            put("acceptedRevision", snapshot.acceptedVideoRevision)
            put("videoState", snapshot.videoState?.let(::buildVideoState))
            put("reason", reason)
        }
    }

    private fun buildVideoState(state: VideoPiPState): JSObject = JSObject().apply {
        put("active", state.active)
        put("playing", state.playing)
        put("chatId", state.chatId)
        put("messageId", state.messageId)
        put("fileId", state.fileId)
        put("positionSeconds", state.positionSeconds)
        put("durationSeconds", state.durationSeconds)
        put("width", state.width)
        put("height", state.height)
        put("revision", state.revision)
    }

    private fun isPictureInPictureSupported(hostActivity: Activity?): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            hostActivity != null &&
            hostActivity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
    }

    private fun Activity.isInPictureInPictureModeCompat(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode()
    }

}
