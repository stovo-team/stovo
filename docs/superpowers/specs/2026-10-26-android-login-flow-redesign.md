---
title: "Android Login and Space Setup Flow"
type: specification
status: awaiting-approval
---

# Android Login and Space Setup Flow

## Intent

Make Android sign-in and server selection easier to scan and understand. Keep password login available while making Passkey and QR actions short, clearly separated, and consistent with the app's shared control styling.

## Scope and observable behavior

- On the Android login screen, label the secondary actions “Passkey” and “Scan QR” (localized in English and Russian), give them a visible, consistent gap, and use the shared control radius instead of pill-shaped buttons.
- Scanning a desktop sign-in QR replaces the login form with a dedicated server-confirmation view. It shows the server host and full space address before redemption. “Sign in” and “Cancel” appear side by side. Cancel returns to the usable login screen. The selected server changes only after successful redemption.
- The Android space setup screen explains that `https://` is for domain names and IP addresses, and offers Passkey and QR actions alongside Connect.
- Passkey from space setup uses the normalized URL currently entered there and starts the existing passkey ceremony immediately. QR scanning uses the server address embedded in the scanned QR and still requires the dedicated server-confirmation step before redemption.
- Preserve password login, existing browser QR approval, scanner error/cancel recovery, and the current server-selection security boundary.

## Approaches considered

1. Keep QR confirmation inline and adjust spacing. This is the smallest change but leaves confirmation mixed with the login form and does not meet the requested separate-view behavior.
2. Add a dedicated QR confirmation view and place the authentication actions on both Android entry screens. This makes the confirmation and address source clear while preserving the existing authentication APIs. **Selected**, based on the user's request and choice to use the entered server immediately for Passkey and QR entry.

## Constraints and implementation outline

- Reuse existing API, passkey, QR scanner, localization, and shared design-token behavior; add matching English and Russian catalog keys where needed.
- Keep Passkey invocation tied to the tap on the action so Android WebView user-activation requirements continue to work.
- Validate/normalize the entered URL using the existing setup rules before starting Passkey. The setup screen QR path does not use the typed address; the QR's own address is shown and confirmed before redemption.
- Do not weaken URL validation or change when an Android QR can replace the active server.

## Acceptance and test plan

| Acceptance ID | Scenario | Expected result | Proof layer / check |
| --- | --- | --- | --- |
| AC-01 | Android login, English and Russian | Short Passkey/QR labels render; controls have a clear gap and shared non-pill radius; password login remains available. | Component assertions, shared style contract, visual capture at Android mobile viewport in light/dark and both locales. |
| AC-02 | Scan a valid Android desktop-login QR | A separate confirmation view shows host and full address; Sign in and Cancel share one row; no redemption happens before Sign in. | `LoginPage.android-qr.test.tsx`; visual capture of confirmation state. |
| AC-03 | Cancel or fail QR confirmation/redemption | Cancel returns to login without server change; failed redemption retains the prior server and usable login. | `LoginPage.android-qr.test.tsx` regression and failure-path scenarios. |
| AC-04 | Choose Passkey from setup with a valid URL | Authentication starts against the normalized entered server on the same user action; success completes normal sign-in. | `ServerSetupPage` component test with mocked API and WebAuthn ceremony. |
| AC-05 | Choose QR from setup | Scanner opens; the address from the QR is shown for confirmation; only successful redemption selects that server. | Setup/login flow component coverage using existing scanner and redemption mocks. |
| AC-06 | Setup URL is invalid or scanner is cancelled/invalid | Passkey does not start for an invalid URL; setup remains usable; a cancelled/invalid QR does not change the server. | `ServerSetupPage` component tests and existing Android QR parsing tests. |
| AC-07 | Setup address guidance and localization | English and Russian explain HTTPS for domain names and IP addresses and no longer describe the example only as a local-network address. | String-catalog parity check and setup component assertions. |

## Visual evidence

Capture Android-sized mobile states for the login screen, QR confirmation view, and space setup screen. Record viewport, theme, locale, source revision, and interaction. Use synthetic fixtures. Provide before/after screenshots when a matching baseline state can be captured safely; do not treat generated images as design approval.

## Out of scope

- Changing backend passkey or QR protocols.
- Changing desktop/browser authentication layouts or the browser QR approval flow.
- Changing iOS authentication behavior.
