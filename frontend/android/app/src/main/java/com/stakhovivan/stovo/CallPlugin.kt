package com.stakhovivan.stovo

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
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
    }

    private var proximityWakeLock: PowerManager.WakeLock? = null
    private var sensorManager: SensorManager? = null
    private var proximitySensor: Sensor? = null
    private var proximityListener: SensorEventListener? = null
    private var isActiveCall = false
    private var isVideoCall = false
    private var activeCallChatId: String? = null
    private var activeCallSessionId: String? = null
    private var pictureInPictureActive = false

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
        isActiveCall = call.getBoolean("active", false) ?: false
        isVideoCall = call.getBoolean("video", false) ?: false
        activeCallChatId = call.getString("chatId")
        activeCallSessionId = call.getString("sessionId")

        if (!isActiveCall) {
            isVideoCall = false
            activeCallChatId = null
            activeCallSessionId = null
        }

        call.resolve(buildPictureInPictureState("call-state"))
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
            val entered = maybeEnterPictureInPicture(currentActivity, "manual")
            val payload = buildPictureInPictureState("manual").apply {
                put("entered", entered)
            }
            call.resolve(payload)
        }
    }

    override fun handleOnDestroy() {
        if (activeInstanceRef?.get() === this) {
            activeInstanceRef = null
        }
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
                val near = event.values[0] < maxRange
                val payload = JSObject()
                payload.put("near", near)
                notifyListeners("proximityChange", payload)
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        sm.registerListener(
            proximityListener,
            sensor,
            SensorManager.SENSOR_DELAY_NORMAL
        )
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
        notifyPictureInPictureChanged(
            if (isInPictureInPictureMode) "entered" else "exited"
        )
    }

    private fun maybeEnterPictureInPicture(
        hostActivity: Activity?,
        reason: String
    ): Boolean {
        val currentActivity = hostActivity ?: activity ?: bridge?.activity ?: return false
        if (!isPictureInPictureSupported(currentActivity)) return false
        if (!isPictureInPictureEligible()) return false
        if (currentActivity.isFinishing || currentActivity.isDestroyed) return false
        if (currentActivity.isInPictureInPictureModeCompat()) return true

        return try {
            val entered = currentActivity.enterPictureInPictureMode(
                PictureInPictureParams.Builder().build()
            )
            if (entered) {
                pictureInPictureActive = currentActivity.isInPictureInPictureModeCompat()
                notifyPictureInPictureChanged(reason)
            }
            entered
        } catch (_: IllegalArgumentException) {
            false
        } catch (_: IllegalStateException) {
            false
        } catch (_: SecurityException) {
            false
        }
    }

    private fun notifyPictureInPictureChanged(reason: String) {
        notifyListeners("pictureInPictureChange", buildPictureInPictureState(reason))
    }

    private fun buildPictureInPictureState(reason: String): JSObject {
        val payload = JSObject()
        payload.put("active", pictureInPictureActive)
        payload.put("supported", isPictureInPictureSupported(activity ?: bridge?.activity))
        payload.put("eligible", isPictureInPictureEligible())
        payload.put("callActive", isActiveCall)
        payload.put("video", isVideoCall)
        payload.put("chatId", activeCallChatId)
        payload.put("sessionId", activeCallSessionId)
        payload.put("reason", reason)
        return payload
    }

    private fun isPictureInPictureEligible(): Boolean {
        return isActiveCall && isVideoCall
    }

    private fun isPictureInPictureSupported(hostActivity: Activity?): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            hostActivity != null &&
            hostActivity.packageManager.hasSystemFeature(
                PackageManager.FEATURE_PICTURE_IN_PICTURE
            )
    }

    private fun Activity.isInPictureInPictureModeCompat(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            this.isInPictureInPictureMode()
        } else {
            false
        }
    }
}
