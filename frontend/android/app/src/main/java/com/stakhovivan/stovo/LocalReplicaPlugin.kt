package com.stakhovivan.stovo

import com.getcapacitor.JSObject
import com.getcapacitor.JSArray
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

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

    @PluginMethod
    fun listOperations(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        if (profileId.isEmpty()) { call.reject("profileId is required"); return }
        val statuses = call.getArray("statuses")
        val requestedStatuses = statuses?.let { values ->
            (0 until values.length()).mapNotNull { index -> values.optString(index).takeIf { it.isNotBlank() } }.toSet()
        }
        val store = EncryptedReplicaStore(context.filesDir.resolve("replica"))
        val result = JSArray()
        for (operationId in operationIDs(store, profileId)) {
            val raw = runCatching { store.read(profileId, operationKey(operationId)) }.getOrNull() ?: continue
            val operation = runCatching { JSONObject(raw) }.getOrNull() ?: continue
            if (requestedStatuses != null && operation.optString("status") !in requestedStatuses) continue
            val bridged = JSObject()
            operation.keys().forEach { key -> bridged.put(key, operation.get(key)) }
            result.put(bridged)
        }
        call.resolve(JSObject().put("operations", result).put("replicaReady", true))
    }

    @PluginMethod
    fun putOperation(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val raw = call.getString("operationJson")
        if (profileId.isEmpty() || raw.isNullOrBlank() || raw.length > 20_000_000) {
            call.reject("profileId and an operation up to 20 MB are required"); return
        }
        val operation = runCatching { JSONObject(raw) }.getOrElse { call.reject("Invalid operation JSON"); return }
        val operationId = operation.optString("id").trim()
        if (!operationId.matches(Regex("[A-Za-z0-9._:-]{1,200}")) || operation.optString("type").isBlank()) {
            call.reject("Invalid operation"); return
        }
        runCatching {
            val store = EncryptedReplicaStore(context.filesDir.resolve("replica"))
            store.write(profileId, operationKey(operationId), operation.toString())
            val ids = operationIDs(store, profileId).toMutableList()
            if (operationId !in ids) {
                ids.add(operationId)
                store.write(profileId, operationIndexKey, JSONArray(ids).toString())
            }
        }.onFailure { error -> call.reject("Could not persist operation: ${error.message ?: "unknown error"}"); return }
        call.resolve(JSObject().put("replicaReady", true))
    }

    @PluginMethod
    fun removeOperation(call: PluginCall) {
        val profileId = call.getString("profileId")?.trim().orEmpty()
        val operationId = call.getString("operationId")?.trim().orEmpty()
        if (profileId.isEmpty() || !operationId.matches(Regex("[A-Za-z0-9._:-]{1,200}"))) {
            call.reject("profileId and a valid operationId are required"); return
        }
        runCatching {
            val store = EncryptedReplicaStore(context.filesDir.resolve("replica"))
            store.delete(profileId, operationKey(operationId))
            store.write(profileId, operationIndexKey, JSONArray(operationIDs(store, profileId).filterNot { it == operationId }).toString())
        }.onFailure { error -> call.reject("Could not remove operation: ${error.message ?: "unknown error"}"); return }
        call.resolve(JSObject().put("replicaReady", true))
    }

    private fun operationIDs(store: EncryptedReplicaStore, profileId: String): List<String> = runCatching {
        val raw = store.read(profileId, operationIndexKey) ?: return@runCatching emptyList()
        val list = JSONArray(raw)
        (0 until list.length()).mapNotNull { index -> list.optString(index).takeIf { it.matches(Regex("[A-Za-z0-9._:-]{1,200}")) } }
    }.getOrDefault(emptyList())

    private fun operationKey(operationId: String) = "operation:$operationId"

    private companion object {
        const val operationIndexKey = "operation-index"
    }

    private fun status(keyReady: Boolean) = JSObject()
        .put("supported", true)
        .put("keyReady", keyReady)
        .put("schemaVersion", if (keyReady) 1 else 0)
        .put("replicaReady", keyReady)
        .put("migrationState", if (keyReady) "ready" else "scaffold")
}
