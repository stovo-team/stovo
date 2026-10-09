# Local mock mode: multi-user calls and files

## User problem

The current local mock mode opens the real chats page and supports synthetic chat data, but it suppresses Socket.IO without replacing call signaling. Calls therefore cannot be exercised. The mock session also starts as one fixed user, so it cannot represent two people interacting in separate tabs. File upload and retrieval still depend on backend routes.

## Scope

Expand the local-only mock mode so a developer can:

- Open separate tabs as different seeded demo users on the same mock origin.
- Start, receive, accept, decline, and end audio or video calls through the real call interface.
- See call participants and the production call layout without using microphones, cameras, speakers, LiveKit, or backend signaling.
- Upload a file through the app, attach it to a message, list/download/delete it, and retain it across reloads using browser-local storage.

The normal development mode and production behavior remain unchanged.

## Observable behavior

### Demo identities

- The default identity remains Stovo Demo.
- The query parameter ?mockUser=<fixture-user-id> selects a fixture user for the current tab. The selection is held in sessionStorage, so another tab can select a different user.
- The mock refresh endpoint returns the selected user, and sent mock messages use that tab's identity.
- Unknown IDs fall back to Stovo Demo with a visible mock-mode notice rather than contacting a backend.

### Calls

- Calls use the existing call popup, controls, participant tiles, and chat/member fixtures.
- The mock call broker synchronizes ringing, accept, decline, participant changes, and hangup across tabs on the same origin.
- Video calls render synthetic avatar tiles. Mic, camera, and speaker controls only update local UI state.
- A mock call never requests device permissions, plays call audio, opens Socket.IO, or connects to WebRTC/LiveKit.
- Call state is scoped to the local mock origin and is cleared when participants leave or the mock session is reset.

### Files

- The mock API accepts the existing file upload flow, stores bytes in IndexedDB, and serves the existing list, metadata, preference, download, and delete calls.
- Uploaded files and chat attachments remain available to every mock user on that origin after reload.
- Existing file preview and attachment components are used; the mock mode does not add a separate file UI.

## Design decisions

- Same-origin browser tabs are the coordination boundary. Use a typed BroadcastChannel for prompt call events and a small local-storage snapshot for active-room recovery and deterministic cleanup.
- Store each tab's chosen user in sessionStorage; do not add multiple app accounts to or switch the shared server registry as a side effect of tab identity.
- Keep the existing CallSessionApi and rendered call UI. Add a mock-only signaling path at the call-session boundary, leaving production signaling and media engines unchanged.
- Store file metadata and binary content in IndexedDB behind mock-only route handlers. Reuse the production API contracts, including the direct-upload reservation/complete flow.
- Keep synthetic call behavior and file storage isolated behind DEV && MODE === "mock". Unknown /api/** calls continue to fail locally with a useful error.

## Out of scope

- Real audio, camera, screen capture, WebRTC, LiveKit, push notifications, call recording, transcription, guest links, and calls between different devices or browser profiles.
- Reproducing features that require external AI, storage, or notification providers. Those remain locally unavailable with a clear mock API response.

## Important risks

- The current call UI assumes real media controllers in several handlers; mock-specific branches must not fall through to device acquisition or cleanup.
- Browser tabs share IndexedDB and localStorage but not sessionStorage. Tests must prove identity isolation and shared file contents together.
- The current shared server registry is localStorage-backed. Tab identity must stay independent of active-server account mutation.
- Stored binary data can fill browser storage; this is a local development dataset and can be removed through the browser's site-data controls.
