package com.stakhovivan.stovo

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
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

    private val ntfyWebSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            reconnectDelay = RECONNECT_BASE_DELAY_MS
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            android.util.Log.d("NtfyService", "msg: $text")
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
            .setContentText("Notifications active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
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
