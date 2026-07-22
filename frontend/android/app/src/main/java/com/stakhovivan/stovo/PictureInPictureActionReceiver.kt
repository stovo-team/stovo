package com.stakhovivan.stovo

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PictureInPictureActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
        val action = actionFromIntent(intent) ?: return
        CallPlugin.handlePictureInPictureAction(action)
    }

    companion object {
        private const val ACTION_PREFIX = "com.stakhovivan.stovo.pip."

        fun intentAction(action: PiPAction): String = ACTION_PREFIX + action.wireValue

        private fun actionFromIntent(intent: Intent?): PiPAction? {
            val value = intent?.action?.takeIf { it.startsWith(ACTION_PREFIX) }
                ?.removePrefix(ACTION_PREFIX)
            return PiPAction.fromWireValue(value)
        }
    }
}
