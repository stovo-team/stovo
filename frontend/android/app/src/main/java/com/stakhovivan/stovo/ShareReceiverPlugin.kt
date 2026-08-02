package com.stakhovivan.stovo

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.UUID

@CapacitorPlugin(name = "ShareReceiverPlugin")
class ShareReceiverPlugin : Plugin() {
    override fun load() {
        instance = this
        if (pendingFiles.isNotEmpty() || pendingSkippedCount > 0) {
            notifyListeners("sharesReceived", JSObject())
        }
    }

    @PluginMethod
    fun consumePendingShares(call: PluginCall) {
        val files = JSArray()
        pendingFiles.values.forEach { shared ->
            files.put(
                JSObject()
                    .put("id", shared.id)
                    .put("path", Uri.fromFile(shared.file).toString())
                    .put("name", shared.name)
                    .put("mimeType", shared.mimeType)
                    .put("sizeBytes", shared.file.length())
            )
        }
        val response = JSObject()
            .put("files", files)
            .put("skippedCount", pendingSkippedCount)
        pendingSkippedCount = 0
        call.resolve(response)
    }

    @PluginMethod
    fun releasePendingShares(call: PluginCall) {
        val ids = call.getArray("ids") ?: JSArray()
        for (index in 0 until ids.length()) {
            val id = ids.optString(index)
            pendingFiles.remove(id)?.file?.delete()
        }
        call.resolve()
    }

    companion object {
        private const val SHARE_CACHE_DIRECTORY = "shared-files"
        private val pendingFiles = linkedMapOf<String, PendingShare>()
        private var pendingSkippedCount = 0
        private var instance: ShareReceiverPlugin? = null

        fun captureIntent(context: Context, intent: Intent?) {
            if (intent?.action != Intent.ACTION_SEND && intent?.action != Intent.ACTION_SEND_MULTIPLE) {
                return
            }
            val streams = linkedSetOf<Uri>()
            @Suppress("DEPRECATION")
            val single = intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
            single?.let(streams::add)
            @Suppress("DEPRECATION")
            intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.forEach(streams::add)
            intent.clipData?.let { clip ->
                for (index in 0 until clip.itemCount) {
                    clip.getItemAt(index).uri?.let(streams::add)
                }
            }

            streams.forEach { uri ->
                if (!copySupportedFile(context, uri)) {
                    pendingSkippedCount += 1
                }
            }
            if (streams.isNotEmpty()) {
                instance?.notifyListeners("sharesReceived", JSObject())
            }
        }

        private fun copySupportedFile(context: Context, uri: Uri): Boolean {
            if (uri.scheme != "content") return false
            val name = displayName(context, uri) ?: "file"
            val mimeType = resolveMimeType(context, uri, name) ?: return false
            return try {
                val directory = File(context.cacheDir, SHARE_CACHE_DIRECTORY).apply { mkdirs() }
                val id = UUID.randomUUID().toString()
                val destination = File(directory, "$id-${sanitizeFilename(name)}")
                context.contentResolver.openInputStream(uri)?.use { input ->
                    destination.outputStream().use { output -> input.copyTo(output) }
                } ?: return false
                pendingFiles[id] = PendingShare(id, destination, name, mimeType)
                true
            } catch (_: Exception) {
                false
            }
        }

        private fun displayName(context: Context, uri: Uri): String? {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return cursor.getString(0)?.takeIf { it.isNotBlank() }
                }
            }
            return null
        }

        private fun resolveMimeType(context: Context, uri: Uri, name: String): String? {
            val reported = context.contentResolver.getType(uri)?.substringBefore(';')?.lowercase()
            if (reported != null && reported != "application/octet-stream" && reported != "binary/octet-stream") {
                return reported.takeIf(allowedMimeTypes::contains)
            }
            val extension = name.substringAfterLast('.', "").lowercase()
            return mimeTypesByExtension[extension]
        }

        private fun sanitizeFilename(name: String): String =
            name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(180).ifBlank { "file" }

        private data class PendingShare(
            val id: String,
            val file: File,
            val name: String,
            val mimeType: String
        )

        private val mimeTypesByExtension = mapOf(
            "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png", "gif" to "image/gif", "webp" to "image/webp",
            "mp4" to "video/mp4", "webm" to "video/webm", "mov" to "video/quicktime",
            "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "aac" to "audio/aac", "wav" to "audio/wav", "ogg" to "audio/ogg",
            "pdf" to "application/pdf", "txt" to "text/plain", "doc" to "application/msword",
            "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls" to "application/vnd.ms-excel", "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "ppt" to "application/vnd.ms-powerpoint", "pptx" to "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        )
        private val allowedMimeTypes = mimeTypesByExtension.values.toSet() + setOf("audio/x-wav", "audio/webm")
    }
}
