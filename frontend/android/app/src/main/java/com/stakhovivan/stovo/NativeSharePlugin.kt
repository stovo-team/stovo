package com.stakhovivan.stovo

import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileOutputStream

@CapacitorPlugin(name = "NativeSharePlugin")
class NativeSharePlugin : Plugin() {

    @PluginMethod
    fun share(call: PluginCall) {
        val title = call.getString("title")
        val text = call.getString("text")
        val url = call.getString("url")
        val dialogTitle = call.getString("dialogTitle") ?: title ?: "Share"
        val imageBase64 = call.getString("imageBase64")
        val imageName = call.getString("imageName") ?: "share-image.png"
        val mimeType = call.getString("mimeType") ?: "image/png"

        try {
            val sendIntent = Intent(Intent.ACTION_SEND)

            // Compose share text
            val body = when {
                !text.isNullOrBlank() && !url.isNullOrBlank() -> "$text\n$url"
                !url.isNullOrBlank() -> url
                !text.isNullOrBlank() -> text
                else -> ""
            }

            if (body.isNotBlank()) {
                sendIntent.putExtra(Intent.EXTRA_TEXT, body)
            }
            if (!title.isNullOrBlank()) {
                sendIntent.putExtra(Intent.EXTRA_SUBJECT, title)
                sendIntent.putExtra(Intent.EXTRA_TITLE, title)
            }

            if (!imageBase64.isNullOrBlank()) {
                // Decode image and save to cache directory
                val cleanBase64 = if (imageBase64.contains(",")) {
                    imageBase64.substringAfter(",")
                } else {
                    imageBase64
                }
                val imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val shareDir = File(context.cacheDir, "shared-temp").apply { mkdirs() }
                val tempFile = File(shareDir, imageName)
                FileOutputStream(tempFile).use { fos ->
                    fos.write(imageBytes)
                }

                val authority = "${context.packageName}.fileprovider"
                val contentUri: Uri = FileProvider.getUriForFile(context, authority, tempFile)

                sendIntent.type = mimeType
                sendIntent.putExtra(Intent.EXTRA_STREAM, contentUri)
                sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } else {
                sendIntent.type = "text/plain"
            }

            val chooser = Intent.createChooser(sendIntent, dialogTitle).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(chooser)

            val result = JSObject().apply {
                put("shared", true)
            }
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Could not share content", e.message, e)
        }
    }
}
