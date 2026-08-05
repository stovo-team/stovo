package com.stakhovivan.stovo

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AppLockPlugin")
class AppLockPlugin : Plugin() {
    private val authenticators =
        BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val manager = BiometricManager.from(context)
        val status = manager.canAuthenticate(authenticators)
        val biometrics =
            manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) ==
                BiometricManager.BIOMETRIC_SUCCESS
        val deviceCredential =
            manager.canAuthenticate(BiometricManager.Authenticators.DEVICE_CREDENTIAL) ==
                BiometricManager.BIOMETRIC_SUCCESS
        val available = status == BiometricManager.BIOMETRIC_SUCCESS
        call.resolve(
            JSObject()
                .put("available", available)
                .put("biometrics", biometrics)
                .put("deviceCredential", deviceCredential || available)
        )
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val activity = activity as? FragmentActivity
        if (activity == null) {
            call.reject("App lock requires an active activity")
            return
        }

        val manager = BiometricManager.from(context)
        if (manager.canAuthenticate(authenticators) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("No device PIN, pattern, password, or biometric is set up")
            return
        }

        val reason = call.getString("reason") ?: "Unlock Stovo"
        activity.runOnUiThread {
            val executor = ContextCompat.getMainExecutor(activity)
            val prompt = BiometricPrompt(
                activity,
                executor,
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        call.resolve(JSObject().put("authenticated", true))
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (
                            errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                            errorCode == BiometricPrompt.ERROR_CANCELED
                        ) {
                            call.resolve(JSObject().put("authenticated", false))
                            return
                        }
                        call.reject(errString.toString())
                    }

                    override fun onAuthenticationFailed() {
                        // Keep the prompt open for another attempt; resolve only on success/cancel.
                    }
                }
            )

            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Stovo")
                .setSubtitle(reason)
                .setAllowedAuthenticators(authenticators)
                .build()

            try {
                prompt.authenticate(promptInfo)
            } catch (error: Exception) {
                call.reject(error.message ?: "Could not start app lock")
            }
        }
    }
}
