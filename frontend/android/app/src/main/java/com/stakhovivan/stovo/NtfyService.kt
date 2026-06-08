package com.stakhovivan.stovo

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.pm.PackageManager
import android.content.Intent
import android.os.Build
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class NtfyService : Service() {

    companion object {
        const val ACTION_START = "com.stakhovivan.stovo.ntfy.START"
        const val ACTION_STOP = "com.stakhovivan.stovo.ntfy.STOP"
        const val EXTRA_TOPIC = "ntfy_topic"
        const val EXTRA_NTFY_BASE_URL = "ntfy_base_url"
        const val FOREGROUND_NOTIFICATION_ID = 1001
        const val RECONNECT_BASE_DELAY_MS = 2_000L
        const val RECONNECT_MAX_DELAY_MS = 300_000L
        const val PREFS_NAME = "stovo_ntfy"
        const val PREF_TOPIC = "topic"
        const val PREF_BASE_URL = "base_url"
    }

    private lateinit var okHttpClient: OkHttpClient
    private var webSocket: WebSocket? = null
    private var reconnectJob: Job? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentTopic: String = ""
    private var currentBaseUrl: String = ""
    private var reconnectDelay = RECONNECT_BASE_DELAY_MS

    private fun buildPendingIntent(click: String, requestCode: Int): PendingIntent {
        val intent = if (click.isNotEmpty()) {
            Intent(Intent.ACTION_VIEW, Uri.parse(click))
        } else {
            Intent(applicationContext, MainActivity::class.java)
        }.apply {
            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        return PendingIntent.getActivity(
            applicationContext,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private val ntfyWebSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectDelay = RECONNECT_BASE_DELAY_MS
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            android.util.Log.d("NtfyService", "msg: $text")

            val jsonObj = try {
                JSONObject(text)
            } catch (e: Exception) {
                android.util.Log.w("NtfyService", "Failed to parse JSON: ${e.message}")
                return
            }

            if (jsonObj.optString("event") != "message") return

            val title = jsonObj.optString("title", "Stovo")
            val body = jsonObj.optString("message", "New message")
            val click = jsonObj.optString("click", "")

            val notificationId = if (click.isNotEmpty()) click.hashCode() else System.currentTimeMillis().toInt()

            // Parse tags to determine notification type
            val tagsArray = jsonObj.optJSONArray("tags")
            val tags = (0 until (tagsArray?.length() ?: 0)).map { tagsArray!!.getString(it) }

            val isRinging = tags.contains("phone")
            val isMissed = tags.contains("telephone_receiver")
            val isMessage = !isRinging && !isMissed

            // Guard: POST_NOTIFICATIONS required on API 33+. Foreground service
            // notifications bypass this check, but regular notify() calls do not.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(
                        applicationContext,
                        android.Manifest.permission.POST_NOTIFICATIONS
                    ) != PackageManager.PERMISSION_GRANTED
                ) {
                    android.util.Log.w(
                        "NtfyService",
                        "POST_NOTIFICATIONS not granted — notification suppressed. " +
                        "Grant it in Settings → Apps → Stovo → Permissions → Notifications."
                    )
                    return
                }
            }

            val appIcon = BitmapFactory.decodeResource(applicationContext.resources, R.mipmap.ic_launcher)

            val notification: Notification = when {
                isRinging -> {
                    val pendingIntent = buildPendingIntent(click, notificationId)
                    val acceptPendingIntent = PendingIntent.getActivity(
                        applicationContext,
                        ("accept_" + notificationId).hashCode(),
                        Intent(Intent.ACTION_VIEW, Uri.parse(click)).apply {
                            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        },
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    NotificationCompat.Builder(applicationContext, "stovo_calls")
                        .setSmallIcon(R.drawable.ic_notification_call)
                        .setLargeIcon(appIcon)
                        .setContentTitle(title)           // caller name
                        .setContentText("Incoming call")
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent)
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_CALL)
                        .setFullScreenIntent(pendingIntent, true)
                        .addAction(R.drawable.ic_notification_call, "Accept", acceptPendingIntent)
                        .build()
                }
                isMissed -> {
                    val pendingIntent = buildPendingIntent(click, notificationId)
                    NotificationCompat.Builder(applicationContext, "stovo_calls")
                        .setSmallIcon(R.drawable.ic_notification_call)
                        .setLargeIcon(appIcon)
                        .setContentTitle(title)           // caller name
                        .setContentText("Missed call")
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
                        .build()
                }
                else -> {
                    val pendingIntent = buildPendingIntent(click, notificationId)
                    NotificationCompat.Builder(applicationContext, "stovo_messages")
                        .setSmallIcon(R.drawable.ic_notification)
                        .setLargeIcon(appIcon)
                        .setContentTitle(title)           // sender name
                        .setContentText(body)             // message text
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .build()
                }
            }

            NotificationManagerCompat.from(applicationContext).notify(notificationId, notification)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            android.util.Log.w("NtfyService", "WebSocket failure: ${t.message}")
            reconnectJob = serviceScope.launch {
                delay(reconnectDelay)
                connectWebSocket()
                reconnectDelay = minOf(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS)
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            // Reconnect fires from onFailure if unexpected closure
        }
    }

    override fun onCreate() {
        super.onCreate()
        okHttpClient = OkHttpClient.Builder()
            .pingInterval(30, TimeUnit.SECONDS)
            .build()
        NotificationChannels.createAll(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(FOREGROUND_NOTIFICATION_ID, buildServiceNotification())

        when (intent?.action) {
            ACTION_START -> {
                val topic = intent.getStringExtra(EXTRA_TOPIC) ?: ""
                val ntfyBaseUrl = intent.getStringExtra(EXTRA_NTFY_BASE_URL) ?: ""

                val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                prefs.edit()
                    .putString(PREF_TOPIC, topic)
                    .putString(PREF_BASE_URL, ntfyBaseUrl)
                    .apply()

                currentTopic = topic
                currentBaseUrl = ntfyBaseUrl

                reconnectJob?.cancel()
                connectWebSocket()
            }
            ACTION_STOP -> {
                stopSelf()
            }
        }

        return START_STICKY
    }

    private fun buildServiceNotification(): Notification {
        return NotificationCompat.Builder(this, NotificationChannels.SERVICE_CHANNEL_ID)
            .setContentTitle("Stovo")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(false)          // dismissable — user can swipe it away
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .build()
    }

    private fun connectWebSocket() {
        webSocket?.cancel()

        val wsUrl = currentBaseUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/') + "/${currentTopic}/ws"

        val request = Request.Builder()
            .url(wsUrl)
            .build()

        webSocket = okHttpClient.newWebSocket(request, ntfyWebSocketListener)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        webSocket?.cancel()
        serviceScope.cancel()
    }
}
