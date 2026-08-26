package com.stakhovivan.stovo

import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.TimeUnit

/** Accepts an app-private source and immediately hands an encrypted copy to WorkManager. */
@CapacitorPlugin(name = "BackgroundUploadPlugin")
class BackgroundUploadPlugin : Plugin() {
    @PluginMethod
    fun enqueue(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val operationId = call.getString("operationId")?.trim().orEmpty()
        val sourceUri = call.getString("sourceUri")?.trim().orEmpty()
        val apiUrl = call.getString("apiUrl")?.trim()?.trimEnd('/').orEmpty()
        val accessToken = call.getString("accessToken")?.trim().orEmpty()
        val originalName = call.getString("originalName")?.trim().orEmpty()
        val mimeType = call.getString("mimeType")?.trim().orEmpty().ifEmpty { "application/octet-stream" }
        val sizeBytes = call.getLong("sizeBytes") ?: -1L
        if (profileId.isEmpty() || operationId.isEmpty() || sourceUri.isEmpty() || apiUrl.isEmpty() || accessToken.isEmpty() || originalName.isEmpty() || sizeBytes < 0) {
            call.reject("profileId, operationId, sourceUri, apiUrl, accessToken, originalName and sizeBytes are required")
            return
        }
        runCatching {
            ReplicaKeyStore.prepare(profileId)
            val transfers = EncryptedTransferStore(context)
            if (!transfers.exists(profileId, operationId)) transfers.stage(profileId, operationId, sourceUri)
            persistAndSchedule(profileId, operationId, apiUrl, accessToken, originalName, mimeType, sizeBytes, call.getString("chatId"))
        }.onFailure { error -> call.reject("Could not persist background upload: ${error.message ?: "unknown error"}"); return }
        call.resolve(JSObject().put("queued", true).put("operationId", operationId))
    }

    @PluginMethod
    fun stageWebChunk(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val operationId = call.getString("operationId")?.trim().orEmpty()
        val index = call.getInt("index") ?: -1
        val encoded = call.getString("dataBase64")
        if (profileId.isEmpty() || operationId.isEmpty() || index < 0 || encoded == null) {
            call.reject("profileId, operationId, index and dataBase64 are required")
            return
        }
        runCatching {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            if (bytes.size > 384 * 1024) error("Upload chunk exceeds 384 KiB")
            ReplicaKeyStore.prepare(profileId)
            EncryptedTransferStore(context).stageChunk(profileId, operationId, index, bytes)
        }.onFailure { error -> call.reject("Could not stage upload chunk: ${error.message ?: "unknown error"}"); return }
        call.resolve(JSObject().put("staged", true).put("index", index))
    }

    @PluginMethod
    fun finalizeWebUpload(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val operationId = call.getString("operationId")?.trim().orEmpty()
        val apiUrl = call.getString("apiUrl")?.trim()?.trimEnd('/').orEmpty()
        val accessToken = call.getString("accessToken")?.trim().orEmpty()
        val originalName = call.getString("originalName")?.trim().orEmpty()
        val mimeType = call.getString("mimeType")?.trim().orEmpty().ifEmpty { "application/octet-stream" }
        val sizeBytes = call.getLong("sizeBytes") ?: -1L
        val chunkCount = call.getInt("chunkCount") ?: 0
        if (profileId.isEmpty() || operationId.isEmpty() || apiUrl.isEmpty() || accessToken.isEmpty() || originalName.isEmpty() || sizeBytes < 0 || chunkCount !in 1..100_000) {
            call.reject("profileId, operationId, apiUrl, accessToken, originalName, sizeBytes and chunkCount are required")
            return
        }
        runCatching {
            val transfers = EncryptedTransferStore(context)
            if (!transfers.hasChunks(profileId, operationId, chunkCount)) error("Incomplete staged upload")
            persistAndSchedule(profileId, operationId, apiUrl, accessToken, originalName, mimeType, sizeBytes, call.getString("chatId"), chunkCount)
        }.onFailure { error -> call.reject("Could not finalize background upload: ${error.message ?: "unknown error"}"); return }
        call.resolve(JSObject().put("queued", true).put("operationId", operationId))
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val operationId = call.getString("operationId")?.trim().orEmpty()
        if (profileId.isEmpty() || operationId.isEmpty()) { call.reject("profileId and operationId are required"); return }
        val raw = runCatching { EncryptedReplicaStore(context.filesDir.resolve("replica")).read(profileId, "transfer:$operationId") }.getOrNull()
        call.resolve(JSObject().put("operation", raw))
    }

    private fun persistAndSchedule(profileId: String, operationId: String, apiUrl: String, accessToken: String, originalName: String, mimeType: String, sizeBytes: Long, chatId: String?, chunkCount: Int = 0) {
        val operation = JSObject()
            .put("operationId", operationId).put("apiUrl", apiUrl).put("accessToken", accessToken)
            .put("originalName", originalName).put("mimeType", mimeType).put("sizeBytes", sizeBytes)
            .put("chatId", chatId).put("chunkCount", chunkCount).put("status", "queued")
        EncryptedReplicaStore(context.filesDir.resolve("replica")).write(profileId, "transfer:$operationId", operation.toString())
        val data = Data.Builder().putString("profileId", profileId).putString("operationId", operationId).build()
        val request = OneTimeWorkRequestBuilder<ResumableFileUploadWorker>()
            .setInputData(data)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("stovo-upload-$operationId", ExistingWorkPolicy.KEEP, request)
    }
}
