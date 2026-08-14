package com.stakhovivan.stovo

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.os.Build
import android.net.Uri
import android.provider.MediaStore
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.util.UUID

@CapacitorPlugin(
    name = "MediaLibraryPlugin",
    permissions = [Permission(
        alias = "media",
        strings = [
            "android.permission.READ_MEDIA_IMAGES",
            "android.permission.READ_MEDIA_VIDEO",
            "android.permission.READ_MEDIA_AUDIO",
            "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
            "android.permission.READ_EXTERNAL_STORAGE"
        ]
    )]
)
class MediaLibraryPlugin : Plugin() {
    @PluginMethod
    fun listMedia(call: PluginCall) {
        val category = call.getString("category", "gallery") ?: "gallery"
        if (category != "documents" && !hasMediaAccess()) {
            requestPermissionForAlias("media", call, "loadMedia")
            return
        }
        loadMedia(call)
    }

    @PermissionCallback
    private fun loadMedia(call: PluginCall) {
        val category = call.getString("category", "gallery") ?: "gallery"
        if (category != "documents" && !hasMediaAccess()) {
            call.reject("Media library permission was not granted")
            return
        }
        val limit = (call.getInt("limit", 120) ?: 120).coerceIn(1, 300)
        val resolver = resolver() ?: run {
            call.reject("Media library is unavailable")
            return
        }
        val items = JSArray()
        val collection = when (category) {
            "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            "documents" -> MediaStore.Downloads.EXTERNAL_CONTENT_URI
            else -> MediaStore.Files.getContentUri("external")
        }
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.DURATION
        )
        val selection = when (category) {
            "audio" -> "${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?"
            "documents" -> "${MediaStore.Files.FileColumns.MIME_TYPE} NOT LIKE ?"
            else -> "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (?, ?)"
        }
        val arguments = when (category) {
            "audio" -> arrayOf(MediaStore.Files.FileColumns.MEDIA_TYPE_AUDIO.toString())
            "documents" -> arrayOf("image/%")
            else -> arrayOf(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(), MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString())
        }
        try {
            resolver.query(
                collection, projection, selection, arguments,
                "${MediaStore.Files.FileColumns.DATE_ADDED} DESC LIMIT $limit"
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
                val nameIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
                val mimeIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)
                val durationIndex = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DURATION)
                while (cursor.moveToNext()) {
                    val id = cursor.getLong(idIndex)
                    val uri = ContentUris.withAppendedId(collection, id)
                    items.put(JSObject().apply {
                        put("id", id.toString())
                        put("uri", uri.toString())
                        put("name", cursor.getString(nameIndex) ?: "media-$id")
                        put("mimeType", cursor.getString(mimeIndex) ?: "application/octet-stream")
                        put("durationMs", cursor.getLong(durationIndex).coerceAtLeast(0))
                    })
                }
            }
        } catch (_: Exception) {
            // MediaStore implementations vary between Android releases and vendors.
            // A malformed/stale provider row must not take down the WebView activity;
            // returning an empty list keeps the system picker available as a fallback.
        }
        call.resolve(JSObject().put("items", items))
    }

    @PluginMethod
    fun copyMedia(call: PluginCall) {
        val ids = call.getArray("ids") ?: JSArray()
        val files = JSArray()
        val resolver = resolver() ?: run {
            call.reject("Media library is unavailable")
            return
        }
        val destinationDirectory = File(context.cacheDir, "media-library").apply { mkdirs() }
        for (index in 0 until ids.length()) {
            val id = ids.optString(index).toLongOrNull() ?: continue
            val uri = ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), id)
            try {
                val name = displayName(uri) ?: "media-$id"
                val mimeType = resolver.getType(uri) ?: "application/octet-stream"
                val destination = File(destinationDirectory, "${UUID.randomUUID()}-${sanitize(name)}")
                resolver.openInputStream(uri)?.use { input ->
                    destination.outputStream().use { output -> input.copyTo(output) }
                } ?: continue
                files.put(JSObject().apply {
                    put("path", Uri.fromFile(destination).toString())
                    put("name", name)
                    put("mimeType", mimeType)
                })
            } catch (_: Exception) {
                // A single inaccessible library item must not prevent sending the rest.
            }
        }
        call.resolve(JSObject().put("files", files))
    }

    private fun displayName(uri: Uri): String? = resolver()?.query(
        uri,
        arrayOf(MediaStore.MediaColumns.DISPLAY_NAME),
        null,
        null,
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0)?.takeIf { it.isNotBlank() } else null
    }

    private fun resolver() = (activity ?: bridge?.activity)?.contentResolver

    /**
     * Android 14 lets people grant access to only selected photos and videos.
     * That is still sufficient for MediaStore to return the media we may show,
     * but Capacitor's alias state reports it as denied because the broad media
     * permissions themselves are not granted.
     */
    private fun hasMediaAccess(): Boolean {
        val permissionContext = context ?: return false
        fun granted(permission: String) = permissionContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

        return when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE ->
                granted(Manifest.permission.READ_MEDIA_IMAGES) ||
                    granted(Manifest.permission.READ_MEDIA_VIDEO) ||
                    granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED)
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ->
                granted(Manifest.permission.READ_MEDIA_IMAGES) || granted(Manifest.permission.READ_MEDIA_VIDEO)
            else -> granted(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
    }

    private fun sanitize(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(180).ifBlank { "media" }
}
