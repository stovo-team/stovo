# Android QR and Passkey Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let desktop users create a one-time QR that signs in a fresh Android install, and enable Android passkey sign-in and enrollment when supported.

**Architecture:** Keep the existing Android-to-desktop QR approval state machine separate. Add a short-lived, single-use backend grant bound to its user and family; the Android app scans and redeems it against the QR's validated server URL, then adopts that server only after success. Enable WebAuthn in supported Android System WebViews and map the trusted Capacitor request origin to the app credential origin published through Digital Asset Links.

**Tech Stack:** Go, PostgreSQL migrations, chi HTTP routes, React/TypeScript, Capacitor 8, Capacitor ML Kit Barcode Scanning, `@simplewebauthn/browser`, AndroidX WebKit and Credential Manager.

**Spec:** [2026-10-09-android-qr-passkey-login-design.md](../specs/2026-10-09-android-qr-passkey-login-design.md)

## Global Constraints

- Keep the existing browser QR approval flow and its five-minute lifetime unchanged.
- Android QR grants expire after two minutes, are bound to user and family, store only a keyed hash, and are consumed atomically once.
- Limit Android QR creation and redemption to eight requests per client IP per minute.
- QR payloads contain no access or refresh tokens; do not log or persist their raw bearer code.
- Accept HTTPS server URLs in production and HTTP only for localhost development; show the host before redemption and change the selected server only after success.
- Keep the configured `APP_URL` as the passkey RP ID; allow only the app credential origin for the published Android signing certificate.
- Preserve native-session refresh-token responses only for configured native client origins.
- Keep password sign-in available when scanning or passkeys are cancelled, unavailable, or fail.

## Review Focus

- A malformed, unsupported-version, non-HTTPS, credential-bearing, or non-local HTTP server URL must not be contacted or adopted; cover in Task 3 parsing tests.
- Cancelling the camera or rejecting the displayed host must not redeem a grant or change the selected server; cover in Task 3 login tests.
- Concurrent redemption must create exactly one session; cover in Task 1 PostgreSQL integration coverage.
- A blocked receiving IP or inactive bound account must not receive a session; cover in Task 1 redemption integration coverage.
- A forged Android credential origin or unlisted signing certificate must fail while the existing configured browser origins continue to work; cover in Task 4 WebAuthn origin tests.

---

### Task 1: Backend Android QR grant lifecycle

**Files:**
- Modify: `backend/internal/features/identity/auth_methods.go`
- Modify: `backend/internal/adapters/authmethods/postgres.go`
- Create: `backend/migrations/20261009120000_add_android_qr_login_grants.sql`
- Modify: `backend/internal/transport/http/auth_routes.go`
- Modify: `backend/internal/app/routes.go`
- Modify: `backend/internal/app/qr_login.go`
- Test: `backend/internal/app/android_qr_login_test.go`

**Interfaces:**
- Produce `identity.AndroidQRLoginGrant{FamilyID, UserID string; ExpiresAt time.Time}`.
- Produce `AuthMethodsStore.CreateAndroidQRLoginGrant(ctx, idHash, familyID, userID string, expiresAt time.Time) error` and `ConsumeAndroidQRLoginGrant(ctx, idHash string) (AndroidQRLoginGrant, error)`. The PostgreSQL consume operation must atomically set `consumed_at` only for an unconsumed, unexpired row and return the bound user and family.
- Add authenticated `POST /api/auth/android-qr-login` returning `{requestId, expiresAt}` and unauthenticated bearer `POST /api/auth/android-qr-login/{requestID}/redeem` returning the existing `AuthSuccess` shape.

- [ ] **Step 1: Write failing route and lifecycle integration tests**

Add tests asserting unauthenticated creation is rejected; authenticated creation returns a code and a two-minute expiry; both endpoints enforce 8/minute limits; successful redemption creates a native session for the bound user; browser-origin redemption omits the refresh token from JSON; expired, reused, inactive-user, blocked-IP, wrong-family, and unknown-on-another-server grants fail; and two concurrent redemptions yield exactly one success. Use the existing `newTestServer` PostgreSQL/Redis integration setup.

- [ ] **Step 2: Run the focused tests and verify the new route/behavior is missing**

Run from `backend`: `go test ./internal/app -run 'TestAndroidQRLogin' -count=1` with `TEST_DATABASE_URL` and `TEST_REDIS_URL` configured.
Expected: the tests fail to compile or fail because the Android QR routes and grant lifecycle are not implemented.

- [ ] **Step 3: Implement the Android grant storage and routes**

Add a purpose-specific table with hashed ID, user/family foreign keys, expiry and consumed timestamp. Generate the raw ID with `randomToken`, store `tokenHash(s.cfg.RefreshTokenSecret, rawID)`, set expiry to `time.Now().Add(2*time.Minute)`, and enforce 8/minute creation and redemption limits. On redemption atomically consume first, reload and validate the active account and family, reject a blocked receiving IP, create the normal refresh/access session, and call `writeAuthSuccess`.

- [ ] **Step 4: Run focused backend tests and verify the lifecycle contract**

Run: `go test ./internal/app -run 'TestAndroidQRLogin' -count=1` with the integration databases configured.
Expected: all Android QR lifecycle tests pass, including the exactly-one concurrent redemption assertion.

- [ ] **Step 5: Run the backend package suite and commit**

Run: `go test ./...` from `backend`.
Expected: all backend tests pass; integration tests may skip only when their documented database services are unavailable.
Commit the task as `[Feature] add one-time Android QR login grants`.

### Task 2: Desktop QR creation in Profile Settings

**Files:**
- Modify: `frontend/src/api/auth.ts`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Test: `frontend/src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`

**Interfaces:**
- Produce `createAndroidQRLogin(accessToken: string): Promise<{ requestId: string; expiresAt: string }>`.
- The settings panel builds `stovo://auth/android-login?version=1&apiUrl=<encoded-api-url>&code=<encoded-request-id>` in memory from the returned request ID and `getApiUrl()`, renders it with the existing `qrcode` package, shows its expiry, and regenerates only after an explicit user action.

- [ ] **Step 1: Write failing Profile Settings tests**

Cover initial hidden state, explicit QR creation, rendered QR content encoding the current API URL and returned code, expiry display, regeneration, API failure feedback, and hiding this Android-specific panel in a native app.

- [ ] **Step 2: Run the focused test and verify the panel is missing**

Run from `frontend`: `npm test -- src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`.
Expected: FAIL because the Android QR creation UI and API method are not present.

- [ ] **Step 3: Implement the desktop QR settings panel**

Add the authenticated API method and the web-only Profile Settings panel. Keep the generated QR code in component state only; the payload must contain `version=1`, the current `getApiUrl()` value, and the raw request ID, with no session credentials.

- [ ] **Step 4: Run the focused test and verify settings behavior**

Run: `npm test -- src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`.
Expected: PASS for creation, expiry, regeneration, failure, and native-hidden states.

- [ ] **Step 5: Run frontend type/build checks and commit**

Run: `npm run build` from `frontend`.
Expected: TypeScript and Vite build complete successfully.
Commit the task as `[Feature] show Android sign-in QR in profile settings`.

### Task 3: Android QR scan, host confirmation, and server adoption

**Files:**
- Modify: `frontend/package.json` and `frontend/package-lock.json`
- Modify/generated by Capacitor sync when needed: `frontend/android/capacitor.settings.gradle`, `frontend/android/app/capacitor.build.gradle`, and `frontend/android/app/src/main/AndroidManifest.xml`
- Create: `frontend/src/native/androidQrScanner.ts`
- Create: `frontend/src/native/androidQrLogin.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/auth.ts`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Test: `frontend/src/native/androidQrLogin.test.ts`
- Test: `frontend/src/pages/LoginPage.android-qr.test.tsx`

**Interfaces:**
- Produce `scanAndroidLoginQR(): Promise<string | null>` for Android only; it uses the ML Kit scanner for QR codes only and returns `null` on cancellation. The scanner action is not shown on iOS.
- Produce `parseAndroidLoginQR(value: string): { apiUrl: string; requestId: string }`. It accepts only `stovo://auth/android-login?version=1&apiUrl=...&code=...`, the established opaque request-ID shape, HTTPS URLs, and HTTP localhost URLs; reject URL credentials and all other protocols/hosts.
- Extend `ApiRequestOptions` with `apiBaseUrl?: string`; `apiRequest` uses this normalized per-call base URL without mutating the active server or forwarding the option to `fetch`.
- Produce `redeemAndroidQRLogin(apiUrl: string, requestId: string): Promise<AuthResponse>`.

- [ ] **Step 1: Write failing parser, API-targeting, and login-flow tests**

Parser tests cover the valid desktop payload plus wrong scheme/path/version, malformed code, HTTPS public URL, localhost HTTP, public HTTP, non-HTTP protocol, and URL credentials. API tests assert redemption calls the scanned base URL. Login tests cover scanner cancellation/failure, displayed host confirmation, rejection without redemption, successful redemption followed by server adoption and `acceptAuthResponse`, and redemption failure without server adoption.

- [ ] **Step 2: Run focused tests and verify scanner/redemption behavior is missing**

Run from `frontend`: `npm test -- src/native/androidQrLogin.test.ts src/pages/LoginPage.android-qr.test.tsx`.
Expected: FAIL because no QR parser, native scanner, explicit-base API call, or Android login flow exists.

- [ ] **Step 3: Add the native QR scanner and strict payload parser**

Install the Capacitor-compatible `@capacitor-mlkit/barcode-scanning` package, configure Android through the repository's Capacitor sync workflow, and implement the scanner wrapper and parser. Configure a single QR scan. Keep cancellation and scanner errors recoverable on the login page.

- [ ] **Step 4: Implement explicit-server redemption and login adoption**

Add the per-call `apiBaseUrl` option and redemption method. In `LoginPage`, show the parsed host and require confirmation before redemption. Only after a successful `AuthResponse`, call `setApiUrlOverride(apiUrl)` and `acceptAuthResponse(response)`; every rejection and failure leaves the selected server unchanged.

- [ ] **Step 5: Run focused tests and frontend build**

Run: `npm test -- src/native/androidQrLogin.test.ts src/pages/LoginPage.android-qr.test.tsx` and `npm run build` from `frontend`.
Expected: all parser and login-flow assertions pass and the build completes successfully.

- [ ] **Step 6: Commit the Android QR client flow**

Commit as `[Feature] scan desktop sign-in QR on Android`.

### Task 4: Android passkey origin trust and Digital Asset Links

**Files:**
- Modify: `backend/internal/app/passkeys.go`
- Modify: `backend/internal/transport/http/core_handlers.go`
- Test: `backend/internal/app/passkeys_test.go`
- Test: `backend/internal/transport/http/core_handlers_test.go`

**Interfaces:**
- Map only the configured native request origin (default `capacitor://localhost`, subject to `NativeClientOrigins`) to WebAuthn credential origin `android:apk-key-hash:<base64url SHA-256 fingerprint>` for the existing published signing certificate. Expose a small predicate for tests that accepts this one credential origin and rejects a different fingerprint.
- Keep `RPID` equal to the hostname in configured `APP_URL`; keep the current configured secure browser origins; never derive it from request `Host` or QR content.
- `GET /.well-known/assetlinks.json` keeps the current URL-handling relation and adds `delegate_permission/common.get_login_creds` for the same package and certificate.

- [ ] **Step 1: Write failing origin and assetlinks tests**

Add `TestWebAuthnAllowsConfiguredAndroidClientOrigin`, `TestWebAuthnRejectsUnconfiguredAndroidClientOrigin`, and `TestAssetLinksIncludesCredentialSharing` asserting both relations carry the existing package name and signing fingerprint. Retain the current configured browser-origin and insecure-origin cases.

- [ ] **Step 2: Run focused tests and verify Android trust is not configured**

Run from `backend`: `go test ./internal/app ./internal/transport/http -run 'TestWebAuthn|TestAssetLinks' -count=1`.
Expected: FAIL because native requests are rejected by WebAuthn origin checks and the credential-sharing relation is absent.

- [ ] **Step 3: Implement native request-to-credential-origin mapping and assetlinks relation**

Keep HTTP request origin validation separate from WebAuthn credential-origin validation. Add the fixed credential origin only for configured native client origins and the published certificate fingerprint. Add the credential-sharing relation without removing the existing URL-handling relation.

- [ ] **Step 4: Run focused backend tests and verify origin boundaries**

Run: `go test ./internal/app ./internal/transport/http -run 'TestWebAuthn|TestAssetLinks' -count=1`.
Expected: configured Android origin and existing browser origins pass; unconfigured Capacitor origins and other signing certificates fail.

- [ ] **Step 5: Run backend suite and commit**

Run: `go test ./...` from `backend`.
Expected: all backend tests pass, with existing integration skips only when services are unavailable.
Commit as `[Feature] trust Android passkey origin and asset links`.

### Task 5: Enable Android WebAuthn and expose passkeys in the app

**Files:**
- Modify: `frontend/android/app/build.gradle`
- Modify: `frontend/android/app/src/main/java/com/stakhovivan/stovo/MainActivity.kt`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Test: `frontend/src/pages/LoginPage.auth-methods.test.tsx`
- Test: `frontend/src/pages/SettingsPage.profile.test.tsx` or a focused Profile Settings auth-method test

**Interfaces:**
- Android enables `WebAuthnSupport.WEB_AUTHENTICATION_SUPPORT_FOR_APP` only when `WebViewFeature.WEB_AUTHENTICATION` is supported.
- Existing `beginPasskeyAuthentication`, `finishPasskeyAuthentication`, `beginPasskeyRegistration`, `finishPasskeyRegistration`, and `@simplewebauthn/browser` ceremonies remain the frontend/backend interface.
- Passkey UI is available in browsers and Android only when the context is secure and runtime WebAuthn support exists; unsupported Android WebViews show the reason and retain password and QR options. iOS behavior remains unchanged.

- [ ] **Step 1: Write failing Android-availability and UI tests**

Update login tests to cover Android passkey sign-in when the runtime API is available, its absence with password and QR still available, silent cancellation, and retryable non-cancellation errors. Update Profile Settings coverage to allow enrollment on supported Android WebView and show an unavailable explanation when WebAuthn is absent, while confirming iOS remains unavailable.

- [ ] **Step 2: Run the focused tests and verify native passkeys remain disabled**

Run from `frontend`: `npm test -- src/pages/LoginPage.auth-methods.test.tsx src/pages/SettingsPage.profile.test.tsx`.
Expected: FAIL because the login and settings code currently disables passkeys on native platforms.

- [ ] **Step 3: Enable WebAuthn in supported Android System WebViews**

Add the AndroidX WebKit and Credential Manager dependencies required by the official WebView integration. After `BridgeActivity` initialization, check `WebViewFeature.WEB_AUTHENTICATION` and set `WEB_AUTHENTICATION_SUPPORT_FOR_APP` only when supported. Keep unsupported devices operational without passkeys.

- [ ] **Step 4: Enable guarded passkey UI in Android login and Profile Settings**

Remove the blanket native-platform exclusion for Android only; gate the existing ceremonies on secure context and runtime `PublicKeyCredential` availability. Keep iOS unavailable, passkey cancellation silent, show retryable errors for other failures, and leave password and QR sign-in accessible.

- [ ] **Step 5: Run frontend tests/build and assemble the Android debug app**

Run from `frontend`: `npm test -- src/pages/LoginPage.auth-methods.test.tsx src/pages/SettingsPage.profile.test.tsx` and `npm run build`. Then run `./gradlew assembleDebug` from `frontend/android`.
Expected: focused UI tests pass, the frontend builds, and the Android debug APK assembles. On a supported WebView with the published signing certificate and HTTPS `APP_URL`, manually verify passkey enrollment and sign-in; on an unsupported WebView, verify password and QR remain available.

- [ ] **Step 6: Commit Android WebAuthn support**

Commit as `[Feature] enable passkeys in Android WebView`.

## Final verification

- [ ] Run `go test ./...` from `backend`.
- [ ] Run `npm test`, `npm run lint`, and `npm run build` from `frontend`.
- [ ] Run `./gradlew assembleDebug` from `frontend/android` and complete the supported-device passkey check from Task 5.
- [ ] Review the final diff against the approved spec, especially that browser QR behavior and existing browser WebAuthn origins are unchanged.
