# Android Login and Space Setup Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Android sign-in and space setup with compact auth actions and a dedicated, safe QR server-confirmation screen.

**Architecture:** Keep the current login and server setup routes. Add a small shared Android QR confirmation component, keep the passkey action in the click handler that starts WebAuthn, and reuse the existing QR parser, redemption API, server registry, auth context, and design tokens.

**Tech Stack:** React, TypeScript, Capacitor, Vitest, Playwright, CSS design tokens, English/Russian string catalogs.

**Spec:** `docs/superpowers/specs/2026-10-26-android-login-flow-redesign.md` (SHA-256 `3a01f929221040dd0f3c5f028020e6686a1c59e3c15dac8a32051f18239587c3`)

## Global Constraints

- Use short Android action labels “Passkey” and “Scan QR” with localized Russian equivalents.
- Show the QR server host and full address before redemption; change the active server only after successful redemption.
- The server setup Passkey action uses the normalized URL entered on that screen and starts from the same user tap.
- The server setup QR action uses the QR's embedded server address and requires confirmation before redemption.
- Use the existing API, passkey, QR scanner, localization, and shared design-token behavior; do not weaken URL validation or alter the browser QR flow.

## Review Focus

- **Blank or malformed setup URL:** Passkey must not start. Pin in `ServerSetupPage.android-auth.test.tsx`.
- **Passkey cancellation or WebAuthn unavailable:** Keep setup usable and preserve QR/Connect. Pin cancellation and unsupported states in `ServerSetupPage.android-auth.test.tsx`.
- **QR cancellation, invalid payload, or failed redemption:** Do not create a session or change the selected server. Pin in login and setup component tests.
- **QR server differs from text field:** Confirm the QR address and redeem against that address; never substitute the typed URL. Pin in `ServerSetupPage.android-auth.test.tsx`.
- **Long host/address on a narrow screen:** Wrap the address without horizontal overflow and keep both actions visible. Pin with a 390×844 Playwright visual scenario.

---

### Task 1: Android login actions and QR confirmation view

**Files:**
- Create: `frontend/src/components/AndroidQrConfirmation.tsx`
- Modify: `frontend/src/pages/LoginPage.tsx`
- Test: `frontend/src/pages/LoginPage.android-qr.test.tsx`
- Modify: `frontend/src/config/strings/english.ts`
- Modify: `frontend/src/config/strings/russian.ts`
- Modify: `frontend/src/styles/app-shell.css`

**Interfaces:**
- `AndroidQrConfirmation` consumes `{ apiUrl: string; isSubmitting: boolean; onConfirm: () => void; onCancel: () => void }` and renders the existing localized confirmation title, host, full address, and one-row Sign in/Cancel actions.
- `LoginPage` continues to own scanning, redemption, server selection, and auth acceptance.

- [ ] **Step 1: Add failing login assertions**

Update `LoginPage.android-qr.test.tsx` to assert that after scanning: the password form and Passkey/Scan QR actions are absent; a separately labelled confirmation region contains the QR host and full URL; Sign in and Cancel are siblings in a two-action row; no redemption or server change occurs before Sign in. Keep the existing cancel, success, failure, malformed payload, and scanner error assertions.

- [ ] **Step 2: Run the Android QR component test and confirm the expected failures**

Run from `frontend`: `npm test -- --run src/pages/LoginPage.android-qr.test.tsx`

Expected: the new separate-view and action-row assertions fail against the inline confirmation.

- [ ] **Step 3: Implement the shared confirmation view and Android-specific labels/styles**

Create `AndroidQrConfirmation` with semantic region/heading, hostname, full address, and a shared `.auth-action-row`. In `LoginPage`, render it instead of the password form and auth methods while an Android QR is awaiting confirmation. Keep the existing rule that `setApiUrlOverride` runs only after successful redemption. Add short localized Android labels while preserving browser labels. Apply `--radius-control`, shared typography tokens, and a 12px vertical gap to Android secondary actions.

- [ ] **Step 4: Run login component tests**

Run from `frontend`: `npm test -- --run src/pages/LoginPage.android-qr.test.tsx src/pages/LoginPage.auth-methods.test.tsx`

Expected: all Android QR safety/recovery tests and existing browser/passkey method tests pass.

- [ ] **Step 5: Commit Task 1**

Commit as `[Feature] separate Android QR sign-in confirmation`.

### Task 2: Passkey and QR entry from space setup

**Files:**
- Modify: `frontend/src/pages/ServerSetupPage.tsx`
- Create: `frontend/src/pages/ServerSetupPage.android-auth.test.tsx`
- Reuse: `frontend/src/components/AndroidQrConfirmation.tsx`
- Modify: `frontend/src/config/strings/english.ts`
- Modify: `frontend/src/config/strings/russian.ts`
- Modify: `frontend/src/styles/app-shell.css`

**Interfaces:**
- Setup Passkey uses existing `beginPasskeyAuthentication`, `startAuthentication`, and `finishPasskeyAuthentication` calls after `normalizeUrl` and `setApiUrlOverride`; success calls `acceptAuthResponse` and navigates to chats.
- Setup QR uses existing `scanAndroidLoginQR`, `parseAndroidLoginQR`, and `redeemAndroidQRLogin`; confirmation uses the shared component and the parsed QR's `apiUrl`.

- [ ] **Step 1: Add failing setup authentication tests**

Create `ServerSetupPage.android-auth.test.tsx` covering: valid URL starts Passkey against that normalized server on the button tap; successful Passkey accepts auth and navigates; blank/malformed URL does not start Passkey; unsupported WebAuthn leaves Connect and QR usable; QR opens the scanner without requiring the typed URL; a QR URL that differs from the input is shown and used for redemption; cancel and failed redemption do not change the active server or accept auth.

- [ ] **Step 2: Run the setup component test and confirm the expected failures**

Run from `frontend`: `npm test -- --run src/pages/ServerSetupPage.android-auth.test.tsx`

Expected: the current setup screen has no Passkey/QR actions or authentication flow.

- [ ] **Step 3: Implement Android setup authentication actions**

Show the actions only on Android. Start Passkey directly inside the click handler after validating and selecting the normalized entered URL. Keep Connect unchanged. Add the scanner and parsed QR confirmation path; redeem against `androidQR.apiUrl`, and select it only after redemption succeeds. On passkey cancellation, retain the setup screen without a false error. Show retryable localized errors for unsupported WebAuthn, invalid URL, scan, and redemption failures.

- [ ] **Step 4: Update space address guidance in both catalogs**

Change the helper to say `https://` is for domain names or IP addresses. Remove the “For local network” / “Для локальной сети” label and its standalone local-network-only hint from the setup view.

- [ ] **Step 5: Run setup and localization tests**

Run from `frontend`: `npm test -- --run src/pages/ServerSetupPage.android-auth.test.tsx src/pages/LoginPage.android-qr.test.tsx` and `npm run check:i18n`.

Expected: setup behavior, QR safety, and English/Russian catalog parity pass.

- [ ] **Step 6: Commit Task 2**

Commit as `[Feature] add Android auth methods to space setup`.

### Task 3: Android visual evidence and focused verification

**Files:**
- Create: `e2e/visual/android-auth.spec.ts`
- Evidence output: `artifacts/agent-workflows/android-connection-auth/`

- [ ] **Step 1: Add visual scenarios for login, QR confirmation, and space setup**

Use the visual Playwright fixture with a synthetic Android Capacitor platform and a mocked barcode scanner. Capture all three states at 390×844, dark theme, Russian locale; include an English/light setup capture to check localization and theme behavior. The QR confirmation scenario uses a long synthetic domain and verifies there is no horizontal page overflow.

- [ ] **Step 2: Run the focused visual scenario and capture evidence**

Run from the repository root: `npm --prefix e2e run test:visual -- --grep "Android auth"` and then `node e2e/tools/capture-evidence.mjs --task android-connection-auth --output artifacts/agent-workflows/android-connection-auth --grep "Android auth"`.

Expected: each scenario passes and emits screenshots with viewport, theme, locale, interaction, and source metadata. Do not enable pixel comparison against a newly generated reference.

- [ ] **Step 3: Run the required shared-style and production build checks**

Run from `frontend`: `npm test -- --run src/design-system/tokens.test.ts` and `npm run build`.

Expected: shared token constraints and the production frontend build pass.

- [ ] **Step 4: Review the patch and commit Task 3 evidence test**

Confirm only the approved Android login/setup behavior, tests, localization, visual scenario, and evidence changed. Commit as `[Test] capture Android authentication states`.

## Acceptance coverage

| Acceptance ID | Plan task |
| --- | --- |
| AC-01 | Tasks 1 and 3 |
| AC-02 | Tasks 1 and 3 |
| AC-03 | Tasks 1 and 2 |
| AC-04 | Task 2 |
| AC-05 | Tasks 1 and 2 |
| AC-06 | Tasks 1 and 2 |
| AC-07 | Task 2 |
