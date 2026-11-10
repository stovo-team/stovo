---
title: "Android QR and Passkey Sign-in Design"
type: specification
---

# Android QR and Passkey Sign-in Design

## Problem and goal

Android users currently sign in with a username and password. The existing QR flow is for a signed-in Android device to approve a pending desktop login, which does not help a new Android install. Passkey enrollment and sign-in are also disabled in the Capacitor app. This change lets a signed-in desktop establish a one-time Android sign-in QR, lets Android scan and redeem it, and enables the existing passkey ceremonies in the Android WebView.

## Scope and observable behavior

- A signed-in desktop user can open Profile Settings, create a short-lived Android sign-in QR, see its expiry, and replace it with a fresh code.
- A signed-out Android user can start a QR scanner from the login page. A recognized Stovo QR shows its server host before redemption. A successful redemption selects that server, stores the returned native session through the existing auth context, and opens chats.
- Invalid, expired, already-used, unsupported-server, or cancelled scans leave the user on a usable login screen and never change the active server or create a session.
- Android shows passkey sign-in and enrollment when the system WebView supports WebAuthn. Unsupported WebView versions keep password and QR sign-in available and explain why passkeys are unavailable.
- The existing browser QR login, password login, invite flows, and session response contract remain compatible.

## Design decisions

### Android QR grant

Keep the current browser QR approval state machine unchanged. Add a purpose-specific Android QR grant record and routes so the two directions cannot claim each other's request state.

The authenticated desktop creation operation binds a random opaque code to the active user's ID and space, stores only a keyed hash, and expires it after two minutes. The displayed QR contains a versioned `stovo:` payload with that code and the API base URL used by the desktop. Android validates the scheme, code shape, and server URL (HTTPS in production; HTTP only for localhost development), then shows the hostname for confirmation. It redeems the code against that exact API base. The server atomically consumes the grant once, rechecks that the bound account is active and the receiving IP is not blocked, and issues a normal native Stovo session. The QR never contains an access or refresh token. The Android app changes its selected server only after successful redemption.

The creation and redemption routes are `POST /api/auth/android-qr-login` (authenticated) and `POST /api/auth/android-qr-login/{requestID}/redeem` (one-time code bearer). Both routes are rate limited. The Android response uses the existing `AuthSuccess` writer, which returns the refresh token in the response body only to configured native client origins.

Use the native ML Kit Barcode Scanning plugin's single-scan API for QR-only scanning. This gives Android a dedicated scanner flow; cancellation returns to login, and camera or Google Play Services errors preserve the password fallback.

### Android passkeys

Use AndroidX WebKit's WebAuthn support for the Capacitor WebView and retain the existing `@simplewebauthn/browser` and backend ceremony APIs. Enable `WebAuthnSupport.WEB_AUTHENTICATION_SUPPORT_FOR_APP` only when the WebView feature is supported. Android's `capacitor://localhost` HTTP request origin remains subject to the existing native-client and CORS configuration; it is not the WebAuthn credential origin. The WebAuthn verifier accepts only the app origin formed as `android:apk-key-hash:` followed by the base64url-encoded SHA-256 signing-certificate fingerprint already published by the server's assetlinks handler. It must not accept a caller-supplied app origin. Keep the RP ID tied to the configured public `APP_URL`.

Add `delegate_permission/common.get_login_creds` to the existing assetlinks relation so credential providers can share passkeys between the Android app and its associated site. Do not accept arbitrary Android origins or derive the RP ID from request `Host` or user-provided QR data.

Android registration is enabled in Profile Settings when WebAuthn is supported. Android sign-in exposes the existing passkey ceremony on the login page when supported. Cancellation remains silent and recoverable; other failures show a retryable message.

### Security and compatibility constraints

- The Android QR code is short-lived (two minutes), space- and user-bound, stored as a keyed hash, and atomically single-use. Creation and redemption are each limited to eight requests per client IP per minute.
- Do not log or persist the raw QR code or refresh token in the QR flow.
- The Android client displays the QR's server host before sending the bearer code and updates the active server only after success.
- Preserve the current five-minute browser QR flow and its approve/reject confirmation UI.
- Do not expose Android passkey support for a signing certificate not covered by the published assetlinks response and server-side WebAuthn origin allowlist.
- A public HTTPS `APP_URL` and a supported Android System WebView are required for production passkeys.

## Test plan

### Backend

- Authenticated creation binds the grant to the current user and space and returns a two-minute expiry; unauthenticated creation is rejected.
- Redemption creates a native session for the bound user, rejects inactive users and blocked receiving IPs, and does not expose the grant's refresh token to browser origins.
- The same grant cannot be redeemed twice, after expiration, or against another server/space; concurrent redemption produces exactly one session.
- Passkey option generation and verification accept the configured Android app origin and reject a different certificate origin while retaining existing secure browser-origin checks.
- The assetlinks response includes both the existing URL-handling relation and the passkey credential-sharing relation for the existing Android package and signing certificate.

### Frontend and Android

- Desktop Profile Settings creates and displays a QR only after user action, shows expiry, supports regeneration, and handles creation failure.
- Android login starts QR-only scanning, confirms the host before redemption, stores the selected server only on successful authentication, and keeps login usable after cancellation, invalid QR, expired QR, or scanner failure.
- Android login exposes passkey sign-in only when the runtime WebAuthn API is available; Android Profile Settings similarly enables enrollment only when available.
- Component tests cover passkey cancellation, retryable errors, and the existing password fallback. Android verification checks WebAuthn feature setup and successful enrollment/sign-in on a supported device with the configured signing certificate and HTTPS server.

## Out of scope

- Changing or removing the existing Android-to-desktop QR approval flow.
- iOS QR scanning or passkey enablement.
- Passkey revocation/rename management, password recovery redesign, or changing passkey behavior in invite acceptance.

## Platform references

- Android WebView Credential Manager integration: https://developer.android.com/identity/sign-in/credential-manager-webview
- Android Digital Asset Links prerequisites: https://developer.android.com/identity/credential-manager/prerequisites
- Capacitor ML Kit Barcode Scanning plugin: https://github.com/capawesome-team/capacitor-mlkit/tree/main/packages/barcode-scanning
