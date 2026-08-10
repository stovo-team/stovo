package com.stakhovivan.stovo

import android.content.ContentUris
import android.net.Uri
import android.provider.MediaStore
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
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
            "android.permission.READ_EXTERNAL_STORAGE"
        ]
    )]
)
class MediaLibraryPlugin : Plugin() {
    @PluginMethod
    fun listMedia(call: PluginCall) {
        if (getPermissionState("media") != PermissionState.GRANTED) {
            requestPermissionForAlias("media", call, "loadMedia")
            return
        }
        loadMedia(call)
    }

    @PermissionCallback
    private fun loadMedia(call: PluginCall) {
        if (getPermissionState("media") != PermissionState.GRANTED) {
            call.reject("Media library permission was not granted")
            return
        }
        val limit = (call.getInt("limit", 120) ?: 120).coerceIn(1, 300)
        val resolver = resolver() ?: run {
            call.reject("Media library is unavailable")
            return
        }
        val items = JSArray()
        val collection = MediaStore.Files.getContentUri("external")
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID,
            MediaStore.Files.FileColumns.DISPLAY_NAME,
            MediaStore.Files.FileColumns.MIME_TYPE,
            MediaStore.Files.FileColumns.DURATION
        )
        val selection = "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN (?, ?)"
        val arguments = arrayOf(
            MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(),
            MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString()
        )
        resolver.query(
            collection,
            projection,
            selection,
            arguments,
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

    private fun sanitize(name: String): String =
        name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(180).ifBlank { "media" }
}
