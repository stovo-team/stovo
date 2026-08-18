package com.stakhovivan.stovo

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import android.net.Uri
import android.provider.MediaStore
import android.util.Size
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
        if (category == "gallery") {
            try {
                // Do not query MediaStore.Files for visual media.  On some Android 13+
                // devices (especially with "selected photos" access) that collection can
                // legitimately return no rows even though the image and video collections
                // are readable.  Query the collections that own the permissions instead.
                appendVisualMedia(items, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, limit)
                appendVisualMedia(items, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, limit)
                call.resolve(JSObject().put("items", items))
            } catch (error: Exception) {
                call.reject("Unable to read the media library", error)
            }
            return
        }
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
                        // Preserve the owning collection for audio and downloads too.
                        // Numeric ids are not portable between MediaStore collections.
                        put("id", uri.toString())
                        put("uri", uri.toString())
                        put("name", cursor.getString(nameIndex) ?: "media-$id")
                        put("mimeType", cursor.getString(mimeIndex) ?: "application/octet-stream")
                        put("durationMs", cursor.getLong(durationIndex).coerceAtLeast(0))
                    })
                }
            }
        } catch (error: Exception) {
            call.reject("Unable to read the media library", error)
            return
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
            val value = ids.optString(index)
            // Gallery entries use their source collection URI.  Keeping that URI is
            // essential for Android's partial photo permission, where a generic Files
            // URI may not be readable for an otherwise permitted photo.
            val uri = Uri.parse(value).takeIf { it.scheme == "content" && it.authority == "media" }
                ?: value.toLongOrNull()?.let { ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), it) }
                ?: continue
            try {
                val name = displayName(uri) ?: "media-$index"
                val mimeType = resolver.getType(uri) ?: "application/octet-stream"
                val destination = File(destinationDirectory, "${uri.toString().hashCode().toUInt().toString(16)}-${sanitize(name)}")
                if (!destination.exists() || destination.length() == 0L) {
                    resolver.openInputStream(uri)?.use { input ->
                        destination.outputStream().use { output -> input.copyTo(output) }
                    } ?: continue
                }
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

    private fun appendVisualMedia(items: JSArray, collection: Uri, limit: Int) {
        val resolver = resolver() ?: return
        val projection = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.DURATION
        )
        resolver.query(
            collection,
            projection,
            null,
            null,
            "${MediaStore.MediaColumns.DATE_ADDED} DESC"
        )?.use { cursor ->
            val idIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val nameIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            val mimeIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
            val durationIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DURATION)
            var count = 0
            while (count < limit && cursor.moveToNext()) {
                val id = cursor.getLong(idIndex)
                val uri = ContentUris.withAppendedId(collection, id)
                val mimeType = cursor.getString(mimeIndex) ?: "application/octet-stream"
                items.put(JSObject().apply {
                    // The URI, rather than an unscoped numeric id, is stable across the
                    // image/video collections and can be copied with partial access.
                    put("id", uri.toString())
                    put("uri", uri.toString())
                    put("name", cursor.getString(nameIndex) ?: "media-$id")
                    put("mimeType", mimeType)
                    put("durationMs", cursor.getLong(durationIndex).coerceAtLeast(0))
                    createPreview(uri, mimeType)?.let { put("thumbnailPath", it) }
                })
                count++
            }
        }
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

    /** Exports a preview because the WebView cannot render content:// URIs. */
    private fun createPreview(uri: Uri, mimeType: String): String? {
        val resolver = resolver() ?: return null
        return try {
            val directory = File(context.cacheDir, "media-library-previews-v4").apply { mkdirs() }
            val destination = File(directory, "${uri.toString().hashCode().toUInt().toString(16)}.jpg")
            if (destination.exists() && destination.length() > 0) return Uri.fromFile(destination).toString()

            val bitmap: Bitmap? = if (mimeType.startsWith("video/")) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        resolver.loadThumbnail(uri, Size(1600, 1600), null)
                    } catch (_: Exception) {
                        null
                    }
                } else {
                    null
                }
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    val source = ImageDecoder.createSource(resolver, uri)
                    ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                        val maxDimension = 2048
                        val width = info.size.width
                        val height = info.size.height
                        if (width > maxDimension || height > maxDimension) {
                            val scale = maxOf(width.toFloat() / maxDimension, height.toFloat() / maxDimension)
                            decoder.setTargetSize((width / scale).toInt().coerceAtLeast(1), (height / scale).toInt().coerceAtLeast(1))
                        }
                        decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    }
                } catch (_: Exception) {
                    null
                }
            } else {
                null
            } ?: run {
                resolver.openInputStream(uri)?.use { stream ->
                    val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeStream(stream, null, boundsOptions)
                    val width = boundsOptions.outWidth
                    val height = boundsOptions.outHeight
                    var sampleSize = 1
                    val maxDimension = 2048
                    if (width > maxDimension || height > maxDimension) {
                        val maxSide = maxOf(width, height)
                        while ((maxSide / sampleSize) > maxDimension * 2) {
                            sampleSize *= 2
                        }
                    }
                    resolver.openInputStream(uri)?.use { decodeStream ->
                        val decodeOptions = BitmapFactory.Options().apply {
                            inSampleSize = sampleSize
                            inPreferredConfig = Bitmap.Config.ARGB_8888
                        }
                        BitmapFactory.decodeStream(decodeStream, null, decodeOptions)
                    }
                }
            } ?: return null

            destination.outputStream().use { output ->
                bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)
            }
            Uri.fromFile(destination).toString()
        } catch (_: Exception) {
            null
        }
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
