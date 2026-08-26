package com.stakhovivan.stovo

import android.util.AtomicFile
import java.io.File
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec

/**
 * Small encrypted persistence primitive for the current Capacitor cache
 * migration. Each account/key gets an internal app file encrypted with an
 * account-scoped Android Keystore AES-GCM key. It deliberately stores opaque
 * JSON only; Room/SQLCipher can later replace it without exposing plaintext to
 * the WebView or device backup.
 */
internal class EncryptedReplicaStore(private val root: File) {
    companion object {
        private const val IV_BYTES = 12
        private const val TAG_BITS = 128
    }

    fun read(profileId: String, key: String): String? {
        val keyMaterial = ReplicaKeyStore.key(profileId) ?: return null
        val file = fileFor(profileId, key) ?: return null
        if (!file.exists()) return null
        val encrypted = file.readBytes()
        if (encrypted.size <= IV_BYTES) return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, keyMaterial, GCMParameterSpec(TAG_BITS, encrypted.copyOfRange(0, IV_BYTES)))
        return cipher.doFinal(encrypted.copyOfRange(IV_BYTES, encrypted.size)).toString(Charsets.UTF_8)
    }

    fun write(profileId: String, key: String, value: String) {
        val keyMaterial = ReplicaKeyStore.key(profileId) ?: throw IllegalStateException("Replica key unavailable")
        val file = fileFor(profileId, key) ?: throw IllegalArgumentException("Invalid replica key")
        file.parentFile?.mkdirs()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, keyMaterial)
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val payload = cipher.iv + encrypted
        val atomicFile = AtomicFile(file)
        var stream: java.io.FileOutputStream? = null
        try {
            stream = atomicFile.startWrite()
            stream.write(payload)
            atomicFile.finishWrite(stream)
        } catch (error: Exception) {
            if (stream != null) atomicFile.failWrite(stream)
            throw error
        }
    }

    fun clearProfile(profileId: String) {
        val digest = ReplicaKeyStore.profileDigest(profileId) ?: return
        File(root, digest).deleteRecursively()
    }

    private fun fileFor(profileId: String, key: String): File? {
        if (key.isBlank() || key.length > 512) return null
        val profileDigest = ReplicaKeyStore.profileDigest(profileId) ?: return null
        val keyDigest = java.security.MessageDigest.getInstance("SHA-256")
            .digest(key.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return File(File(root, profileDigest), "$keyDigest.bin")
    }
}
