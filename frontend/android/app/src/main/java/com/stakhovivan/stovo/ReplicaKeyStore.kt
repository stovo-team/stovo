package com.stakhovivan.stovo

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * Owns only the key-encryption-key for the future encrypted replica database.
 *
 * The database itself deliberately is not introduced in this change: the web
 * cache remains the active source until the Room/SQLCipher migration has its
 * schema, migration, and data-reconciliation code. Keeping this small piece
 * native lets that later migration use an account-scoped Android Keystore key
 * without ever exposing a replica passphrase to the WebView.
 */
internal object ReplicaKeyStore {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS_PREFIX = "com.stakhovivan.stovo.replica."

    fun prepare(profileId: String): Boolean {
        val alias = aliasFor(profileId) ?: return false
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        if (keyStore.containsAlias(alias)) return true

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // Replica background workers will need access while the device is
                // unlocked. App-lock remains a UI gate, not a key requirement.
                .setUserAuthenticationRequired(false)
                .build()
        )
        generator.generateKey()
        return true
    }

    fun exists(profileId: String): Boolean {
        val alias = aliasFor(profileId) ?: return false
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        return keyStore.containsAlias(alias)
    }

    fun clear(profileId: String): Boolean {
        val alias = aliasFor(profileId) ?: return false
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
        return true
    }

    fun key(profileId: String): SecretKey? {
        val alias = aliasFor(profileId) ?: return null
        if (!prepare(profileId)) return null
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        return keyStore.getKey(alias, null) as? SecretKey
    }

    fun profileDigest(profileId: String): String? {
        val normalized = profileId.trim()
        if (normalized.isEmpty() || normalized.length > 512) return null
        return MessageDigest.getInstance("SHA-256")
            .digest(normalized.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    private fun aliasFor(profileId: String): String? {
        val digest = profileDigest(profileId) ?: return null
        return KEY_ALIAS_PREFIX + digest
    }
}
