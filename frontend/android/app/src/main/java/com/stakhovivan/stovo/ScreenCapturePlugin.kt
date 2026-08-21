package com.stakhovivan.stovo

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import android.util.DisplayMetrics
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream

@CapacitorPlugin(name = "ScreenCapturePlugin")
class ScreenCapturePlugin : Plugin() {

    private var mediaProjectionManager: MediaProjectionManager? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null

    private var lastFrameTimeMs = 0L
    private val minFrameIntervalMs = 66L // ~15 fps target for smooth sharing and low battery/CPU overhead

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val pm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        call.resolve(JSObject().apply {
            put("supported", pm != null)
        })
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (mediaProjection != null) {
            call.resolve(JSObject().apply { put("alreadyActive", true) })
            return
        }

        val manager = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
        if (manager == null) {
            call.reject("MediaProjection is not supported on this device")
            return
        }
        mediaProjectionManager = manager

        val captureIntent = manager.createScreenCaptureIntent()
        startActivityForResult(call, captureIntent, "handleScreenCaptureResult")
    }

    @ActivityCallback
    private fun handleScreenCaptureResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return

        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Screen capture permission was denied by user")
            return
        }

        val manager = mediaProjectionManager ?: run {
            call.reject("MediaProjectionManager unavailable")
            return
        }

        try {
            // Android 14+ requires foreground service started before or immediately with MediaProjection
            ScreenCaptureService.startService(context)

            val projection = manager.getMediaProjection(result.resultCode, result.data!!) ?: run {
                ScreenCaptureService.stopService(context)
                call.reject("Failed to obtain MediaProjection")
                return
            }
            mediaProjection = projection

            projection.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    cleanupCapture()
                    notifyListeners("stopped", JSObject())
                }
            }, null)

            val displayMetrics: DisplayMetrics = context.resources.displayMetrics
            val screenWidth = displayMetrics.widthPixels
            val screenHeight = displayMetrics.heightPixels
            val densityDpi = displayMetrics.densityDpi

            // Scale down to max 720p width/height to optimize memory & transmission bandwidth
            val maxDimension = 720
            val scale = if (screenWidth > screenHeight) {
                if (screenWidth > maxDimension) maxDimension.toFloat() / screenWidth else 1.0f
            } else {
                if (screenHeight > maxDimension) maxDimension.toFloat() / screenHeight else 1.0f
            }

            var captureWidth = (screenWidth * scale).toInt()
            var captureHeight = (screenHeight * scale).toInt()
            // Dimensions must be even for video/encoders
            if (captureWidth % 2 != 0) captureWidth--
            if (captureHeight % 2 != 0) captureHeight--
            if (captureWidth <= 0) captureWidth = 480
            if (captureHeight <= 0) captureHeight = 640

            val thread = HandlerThread("StovoScreenCaptureThread").apply { start() }
            backgroundThread = thread
            val handler = Handler(thread.looper)
            backgroundHandler = handler

            val reader = ImageReader.newInstance(captureWidth, captureHeight, PixelFormat.RGBA_8888, 2)
            imageReader = reader

            reader.setOnImageAvailableListener({ ir ->
                handleImageAvailable(ir, captureWidth, captureHeight)
            }, handler)

            virtualDisplay = projection.createVirtualDisplay(
                "StovoScreenCaptureDisplay",
                captureWidth,
                captureHeight,
                densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.surface,
                null,
                handler
            )

            call.resolve(JSObject().apply {
                put("active", true)
                put("width", captureWidth)
                put("height", captureHeight)
            })
        } catch (e: Exception) {
            cleanupCapture()
            call.reject("Failed to initialize screen capture: ${e.message}", e)
        }
    }

    private fun handleImageAvailable(reader: ImageReader, width: Int, height: Int) {
        val now = System.currentTimeMillis()
        if (now - lastFrameTimeMs < minFrameIntervalMs) {
            // Drop frame to preserve target FPS
            try {
                reader.acquireLatestImage()?.close()
            } catch (_: Exception) {}
            return
        }

        var image: Image? = null
        try {
            image = reader.acquireLatestImage() ?: return
            lastFrameTimeMs = now

            val planes = image.planes
            if (planes.isEmpty()) return
            val buffer = planes[0].buffer
            val pixelStride = planes[0].pixelStride
            val rowStride = planes[0].rowStride
            val rowPadding = rowStride - pixelStride * width

            val bitmap = Bitmap.createBitmap(
                width + rowPadding / pixelStride,
                height,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)

            val croppedBitmap = if (rowPadding != 0) {
                Bitmap.createBitmap(bitmap, 0, 0, width, height)
            } else {
                bitmap
            }

            val outputStream = ByteArrayOutputStream()
            croppedBitmap.compress(Bitmap.CompressFormat.JPEG, 65, outputStream)
            val jpegBytes = outputStream.toByteArray()
            val base64Data = Base64.encodeToString(jpegBytes, Base64.NO_WRAP)

            if (croppedBitmap !== bitmap) {
                croppedBitmap.recycle()
            }
            bitmap.recycle()

            val payload = JSObject().apply {
                put("data", base64Data)
                put("width", width)
                put("height", height)
            }
            notifyListeners("screenFrame", payload)
        } catch (_: Exception) {
            // Buffer lock or teardown in flight
        } finally {
            image?.close()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        cleanupCapture()
        call.resolve(JSObject().apply { put("active", false) })
    }

    override fun handleOnDestroy() {
        cleanupCapture()
        super.handleOnDestroy()
    }

    private fun cleanupCapture() {
        try {
            virtualDisplay?.release()
        } catch (_: Exception) {}
        virtualDisplay = null

        try {
            imageReader?.close()
        } catch (_: Exception) {}
        imageReader = null

        try {
            mediaProjection?.stop()
        } catch (_: Exception) {}
        mediaProjection = null

        backgroundThread?.quitSafely()
        backgroundThread = null
        backgroundHandler = null

        ScreenCaptureService.stopService(context)
    }
}
