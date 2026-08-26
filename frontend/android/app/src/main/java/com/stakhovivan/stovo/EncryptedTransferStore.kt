package com.stakhovivan.stovo

import android.content.Context
import android.net.Uri
import android.util.AtomicFile
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.SequenceInputStream
import java.util.Collections
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.CipherOutputStream
import javax.crypto.spec.GCMParameterSpec

/** Encrypted, account-scoped binary staging for WorkManager uploads. */
internal class EncryptedTransferStore(private val context: Context) {
    companion object { private const val IV_BYTES = 12; private const val TAG_BITS = 128 }

    fun stage(profileId: String, operationId: String, source: String): Long {
        val key = ReplicaKeyStore.key(profileId) ?: error("Replica key unavailable")
        val target = target(profileId, operationId) ?: error("Invalid upload operation")
        target.parentFile?.mkdirs()
        val atomic = AtomicFile(target)
        var output: java.io.FileOutputStream? = null
        try {
            output = atomic.startWrite()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            output.write(cipher.iv)
            openSource(source).use { input -> CipherOutputStream(output, cipher).use { encrypted -> input.copyTo(encrypted) } }
            atomic.finishWrite(output)
            return target.length().coerceAtLeast(IV_BYTES.toLong())
        } catch (error: Exception) {
            if (output != null) atomic.failWrite(output)
            throw error
        }
    }

    /**
     * The WebView cannot hand an ordinary file-picker File to WorkManager as a
     * content Uri. Each bridge chunk is therefore authenticated and encrypted
     * independently; the worker sees one continuous input stream.
     */
    fun stageChunk(profileId: String, operationId: String, index: Int, bytes: ByteArray) {
        val key = ReplicaKeyStore.key(profileId) ?: error("Replica key unavailable")
        val target = chunkTarget(profileId, operationId, index) ?: error("Invalid upload operation")
        target.parentFile?.mkdirs()
        val atomic = AtomicFile(target)
        var output: java.io.FileOutputStream? = null
        try {
            output = atomic.startWrite()
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key) }
            output.write(cipher.iv)
            CipherOutputStream(output, cipher).use { encrypted -> encrypted.write(bytes) }
            atomic.finishWrite(output)
        } catch (error: Exception) {
            if (output != null) atomic.failWrite(output)
            throw error
        }
    }

    fun open(profileId: String, operationId: String, chunkCount: Int = 0): InputStream {
        if (chunkCount > 0) {
            if (!hasChunks(profileId, operationId, chunkCount)) error("Incomplete staged upload")
            val inputs = (0 until chunkCount).map { index -> openEncrypted(profileId, chunkTarget(profileId, operationId, index) ?: error("Invalid upload operation")) }
            return SequenceInputStream(Collections.enumeration(inputs))
        }
        return openEncrypted(profileId, target(profileId, operationId) ?: error("Invalid upload operation"))
    }

    private fun openEncrypted(profileId: String, file: File): InputStream {
        val key = ReplicaKeyStore.key(profileId) ?: error("Replica key unavailable")
        val input = FileInputStream(file)
        val iv = input.readNBytes(IV_BYTES)
        if (iv.size != IV_BYTES) { input.close(); error("Corrupt staged upload") }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv)) }
        return CipherInputStream(input, cipher)
    }

    fun remove(profileId: String, operationId: String) {
        val file = target(profileId, operationId) ?: return
        file.delete()
        file.parentFile?.listFiles { candidate -> candidate.name.startsWith("$operationId.part-") && candidate.name.endsWith(".bin") }?.forEach(File::delete)
    }
    fun exists(profileId: String, operationId: String): Boolean = target(profileId, operationId)?.isFile == true
    fun hasChunks(profileId: String, operationId: String, chunkCount: Int): Boolean =
        chunkCount in 1..100_000 && (0 until chunkCount).all { chunkTarget(profileId, operationId, it)?.isFile == true }

    private fun openSource(value: String): InputStream {
        val uri = Uri.parse(value)
        return if (uri.scheme == "content") context.contentResolver.openInputStream(uri) ?: error("Source is unavailable")
        else FileInputStream(File(uri.path ?: error("Source is unavailable")))
    }

    private fun target(profileId: String, operationId: String): File? {
        val profile = ReplicaKeyStore.profileDigest(profileId) ?: return null
        if (!operationId.matches(Regex("[A-Za-z0-9._-]{1,200}"))) return null
        return File(File(context.filesDir, "transfers/$profile"), "$operationId.bin")
    }

    private fun chunkTarget(profileId: String, operationId: String, index: Int): File? {
        if (index !in 0..99_999) return null
        val original = target(profileId, operationId) ?: return null
        return File(original.parentFile, "$operationId.part-$index.bin")
    }
}
