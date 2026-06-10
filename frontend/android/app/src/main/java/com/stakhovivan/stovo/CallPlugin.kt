package com.stakhovivan.stovo

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.os.PowerManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "CallPlugin")
class CallPlugin : Plugin() {

    private var proximityWakeLock: PowerManager.WakeLock? = null
    private var sensorManager: SensorManager? = null
    private var proximitySensor: Sensor? = null
    private var proximityListener: SensorEventListener? = null

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

    override fun handleOnDestroy() {
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
        val pm = activity?.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        @Suppress("DEPRECATION")
        proximityWakeLock = pm.newWakeLock(
            PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
            "stovo:call-proximity"
        )
        proximityWakeLock?.acquire()
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
}
