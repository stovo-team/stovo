package com.stakhovivan.stovo

import android.media.MediaRecorder
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File

/**
 * Records voice notes outside WebView's MediaRecorder implementation.  Several
 * Android WebViews produce WebM files with invalid duration cues; AAC in an
 * MPEG-4 container is finalized by the platform and is playable by Media3.
 */
@CapacitorPlugin(
    name = "VoiceRecordingPlugin",
    permissions = [Permission(alias = "microphone", strings = ["android.permission.RECORD_AUDIO"])]
)
class VoiceRecordingPlugin : Plugin() {
    private var recorder: MediaRecorder? = null
    private var output: File? = null

    @PluginMethod
    fun start(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "beginRecording")
            return
        }
        beginRecording(call)
    }

    @PermissionCallback
    private fun beginRecording(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone permission is required to record")
            return
        }
        if (recorder != null) {
            call.reject("Voice recording is already in progress")
            return
        }
        val destination = File(context.cacheDir, "voice-notes").apply { mkdirs() }
        val file = File(destination, "voice-${System.currentTimeMillis()}.m4a")
        var next: MediaRecorder? = null
        try {
            val preparedRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION") MediaRecorder()
            }
            next = preparedRecorder
            preparedRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            preparedRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            preparedRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            preparedRecorder.setAudioChannels(1)
            preparedRecorder.setAudioSamplingRate(44_100)
            preparedRecorder.setAudioEncodingBitRate(64_000)
            preparedRecorder.setOutputFile(file.absolutePath)
            preparedRecorder.prepare()
            preparedRecorder.start()
            recorder = preparedRecorder
            output = file
            call.resolve()
        } catch (error: Exception) {
            next?.release()
            recorder = null
            output = null
            file.delete()
            call.reject("Could not start voice recording", error.message, error)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val active = recorder ?: run {
            call.reject("No voice recording is in progress")
            return
        }
        val file = output
        try {
            active.stop()
            if (file == null || !file.isFile || file.length() == 0L) {
                file?.delete()
                call.reject("Recording was empty")
                return
            }
            call.resolve(JSObject().apply {
                put("path", "file://${file.absolutePath}")
                put("name", file.name)
                put("mimeType", "audio/mp4")
            })
        } catch (error: RuntimeException) {
            file?.delete()
            call.reject("Could not finish voice recording", error.message, error)
        } finally {
            release()
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        try {
            recorder?.stop()
        } catch (_: RuntimeException) {
            // Stopping a very short recording can fail; it is being discarded.
        } finally {
            output?.delete()
            release()
        }
        call.resolve()
    }

    override fun handleOnDestroy() {
        output?.delete()
        release()
        super.handleOnDestroy()
    }

    private fun release() {
        recorder?.reset()
        recorder?.release()
        recorder = null
        output = null
    }
}
