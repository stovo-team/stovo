package com.stakhovivan.stovo

import com.getcapacitor.JSObject
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capability and key-lifecycle bridge for the encrypted local replica.
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
        val keyReady = runCatching { ReplicaKeyStore.prepare(profileId) }.getOrElse { error ->
            call.reject("Could not prepare encrypted replica key: ${error.message ?: "unknown error"}")
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
        runCatching {
            EncryptedReplicaStore(context.filesDir.resolve("replica")).clearProfile(profileId)
            ReplicaKeyStore.clear(profileId)
        }.onFailure { error ->
            call.reject("Could not clear encrypted replica key: ${error.message ?: "unknown error"}")
            return
        }
        call.resolve(status(false))
    }

    @PluginMethod
    fun getValue(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val key = call.getString("key")?.trim().orEmpty()
        if (profileId.isEmpty() || key.isEmpty()) {
            call.reject("profileId and key are required")
            return
        }
        val value = runCatching { EncryptedReplicaStore(context.filesDir.resolve("replica")).read(profileId, key) }.getOrElse { error ->
            call.reject("Could not read encrypted replica value: ${error.message ?: "unknown error"}")
            return
        }
        call.resolve(JSObject().put("value", value).put("replicaReady", true))
    }

    @PluginMethod
    fun setValue(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val key = call.getString("key")?.trim().orEmpty()
        val value = call.getString("value")
        if (profileId.isEmpty() || key.isEmpty() || value == null || value.length > 5_000_000) {
            call.reject("profileId, key, and a value up to 5 MB are required")
            return
        }
        runCatching { EncryptedReplicaStore(context.filesDir.resolve("replica")).write(profileId, key, value) }.onFailure { error ->
            call.reject("Could not save encrypted replica value: ${error.message ?: "unknown error"}")
            return
        }
        call.resolve(JSObject().put("replicaReady", true))
    }

    @PluginMethod
    fun getSyncCursor(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        if (profileId.isEmpty()) {
            call.reject("profileId is required")
            return
        }
        val cursor = runCatching {
            EncryptedReplicaStore(context.filesDir.resolve("replica")).read(profileId, "sync-cursor")
        }.getOrElse { error ->
            call.reject("Could not read encrypted sync cursor: ${error.message ?: "unknown error"}")
            return
        }
        call.resolve(JSObject().put("cursor", cursor).put("replicaReady", true))
    }

    @PluginMethod
    fun setSyncCursor(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val cursor = call.getString("cursor")?.trim()
        if (profileId.isEmpty() || cursor == null || cursor.length > 4_096) {
            call.reject("profileId and a cursor up to 4096 characters are required")
            return
        }
        runCatching {
            EncryptedReplicaStore(context.filesDir.resolve("replica")).write(profileId, "sync-cursor", cursor)
        }.onFailure { error ->
            call.reject("Could not save encrypted sync cursor: ${error.message ?: "unknown error"}")
            return
        }
        call.resolve(JSObject().put("replicaReady", true))
    }

    // The persistent operation graph remains the next migration step. It must
    // not claim durability until binary transfer data and retry dependencies
    // are stored in one native transaction.
    @PluginMethod
    fun listOperations(call: PluginCall) {
        call.resolve(JSObject().put("operations", JSArray()).put("replicaReady", false))
    }

    private fun status(keyReady: Boolean) = JSObject()
        .put("supported", true)
        .put("keyReady", keyReady)
        .put("schemaVersion", if (keyReady) 1 else 0)
        .put("replicaReady", keyReady)
        .put("migrationState", if (keyReady) "ready" else "scaffold")
}
