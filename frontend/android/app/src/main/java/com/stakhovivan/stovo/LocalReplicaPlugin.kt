package com.stakhovivan.stovo

import com.getcapacitor.JSObject
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capability and key-lifecycle bridge for the encrypted local replica.
 *
 * It intentionally reports replicaReady=false until the Room/SQLCipher data
 * store is shipped. JavaScript callers must retain their existing IndexedDB
 * fallback while that migration is incomplete.
 */
@CapacitorPlugin(name = "LocalReplicaPlugin")
class LocalReplicaPlugin : Plugin() {
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val profileId = call.getString("profileId")
        val keyReady = profileId?.let { runCatching { ReplicaKeyStore.exists(it) }.getOrDefault(false) } ?: false
        call.resolve(status(keyReady))
    }

    @PluginMethod
    fun prepareProfile(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        if (profileId.isEmpty()) {
            call.reject("profileId is required")
            return
        }
        val keyReady = runCatching { ReplicaKeyStore.prepare(profileId) }.getOrElse {
            call.reject("Could not prepare encrypted replica key", it)
            return
        }
        call.resolve(status(keyReady))
    }

    @PluginMethod
    fun clearProfile(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        if (profileId.isEmpty()) {
            call.reject("profileId is required")
            return
        }
        runCatching { ReplicaKeyStore.clear(profileId) }.onFailure {
            call.reject("Could not clear encrypted replica key", it)
            return
        }
        call.resolve(status(false))
    }

    // These contracts reserve the native bridge shape for sync state and the
    // persistent operation graph. Until the encrypted database migration is
    // complete they intentionally return empty values rather than accepting
    // data that could be lost after an app restart.
    @PluginMethod
    fun getSyncCursor(call: PluginCall) {
        call.resolve(JSObject().put("cursor", null).put("replicaReady", false))
    }

    @PluginMethod
    fun listOperations(call: PluginCall) {
        call.resolve(JSObject().put("operations", JSArray()).put("replicaReady", false))
    }

    private fun status(keyReady: Boolean) = JSObject()
        .put("supported", true)
        .put("keyReady", keyReady)
        .put("schemaVersion", 0)
        .put("replicaReady", false)
        .put("migrationState", "scaffold")
}
