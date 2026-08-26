package com.stakhovivan.stovo

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Executes the reserve -> direct PUT -> complete protocol from encrypted staging. */
class ResumableFileUploadWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    private val client = OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).writeTimeout(10, TimeUnit.MINUTES).build()

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val profileId = inputData.getString("profileId") ?: return@withContext Result.failure()
        val operationId = inputData.getString("operationId") ?: return@withContext Result.failure()
        val replica = EncryptedReplicaStore(applicationContext.filesDir.resolve("replica"))
        val raw = replica.read(profileId, "transfer:$operationId") ?: return@withContext Result.failure()
        val operation = JSONObject(raw)
        try {
            setForeground(foregroundInfo(operation.optString("originalName", "file")))
            val reservation = reserve(operation, operationId)
            val state = reservation.optString("state")
            if (state == "reserved") upload(operation, profileId, operationId, reservation.getString("uploadUrl"))
            val completed = if (state == "reserved") complete(operation, reservation.getString("uploadId"), operationId) else reservation
            operation.put("status", completed.optString("state", "validating"))
                .put("uploadId", completed.getString("uploadId")).put("fileId", completed.getString("fileId"))
            replica.write(profileId, "transfer:$operationId", operation.toString())
            EncryptedTransferStore(applicationContext).remove(profileId, operationId)
            Result.success()
        } catch (error: UploadTerminalException) {
            operation.put("status", "failed").put("error", error.message)
            replica.write(profileId, "transfer:$operationId", operation.toString())
            Result.failure()
        } catch (_: Exception) { Result.retry() }
    }

    private fun reserve(op: JSONObject, id: String): JSONObject {
        val payload = JSONObject().put("originalName", op.getString("originalName")).put("mimeType", op.getString("mimeType")).put("sizeBytes", op.getLong("sizeBytes"))
        op.optString("chatId").takeIf { it.isNotBlank() }?.let { payload.put("chatId", it) }
        return executeJson(Request.Builder().url("${op.getString("apiUrl")}/api/files/uploads").header("Authorization", "Bearer ${op.getString("accessToken")}").header("Idempotency-Key", id).post(payload.toString().toRequestBody("application/json".toMediaType())).build())
    }

    private fun upload(op: JSONObject, profileId: String, operationId: String, url: String) {
        val store = EncryptedTransferStore(applicationContext)
        val body = object : RequestBody() {
            override fun contentType() = op.getString("mimeType").toMediaType()
            override fun contentLength() = op.getLong("sizeBytes")
            override fun writeTo(sink: BufferedSink) { store.open(profileId, operationId, op.optInt("chunkCount", 0)).use { it.copyTo(sink.outputStream()) } }
        }
        client.newCall(Request.Builder().url(url).put(body).build()).execute().use { response ->
            if (!response.isSuccessful) throw RetryableUploadException()
        }
    }

    private fun complete(op: JSONObject, uploadId: String, id: String): JSONObject = executeJson(Request.Builder().url("${op.getString("apiUrl")}/api/files/uploads/$uploadId/complete").header("Authorization", "Bearer ${op.getString("accessToken")}").header("Idempotency-Key", id).post(ByteArray(0).toRequestBody()).build())

    private fun executeJson(request: Request): JSONObject = client.newCall(request).execute().use { response ->
        val body = response.body?.string().orEmpty()
        if (response.isSuccessful) return JSONObject(body)
        if (response.code == 408 || response.code == 429 || response.code >= 500) throw RetryableUploadException()
        throw UploadTerminalException("Upload request failed (${response.code})")
    }

    private fun foregroundInfo(name: String): ForegroundInfo {
        val channel = "background_transfers"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) applicationContext.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(channel, "Background transfers", NotificationManager.IMPORTANCE_LOW))
        val notification = NotificationCompat.Builder(applicationContext, channel).setSmallIcon(R.drawable.ic_notification).setContentTitle("Uploading $name").setOngoing(true).build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(4301, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else ForegroundInfo(4301, notification)
    }

    private class RetryableUploadException : RuntimeException()
    private class UploadTerminalException(message: String) : RuntimeException(message)
}
