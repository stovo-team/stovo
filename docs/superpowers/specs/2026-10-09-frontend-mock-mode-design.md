---
title: "Local Frontend Mock Mode Design"
type: specification
---

# Local Frontend Mock Mode Design

**Status:** Approved
**Date:** 2026-10-09

## User problem

Starting the full Stovo stack is slow and currently blocked by unavailable MinIO image references. A standalone component preview does not let the user inspect the real application route. The user needs to open the actual Stovo interface locally with deterministic synthetic data so small frontend changes can be checked quickly in a browser.

## Goals and observable behavior

- A developer can start a local mock mode with one command after the frontend dependencies are installed.
- Opening `http://127.0.0.1:5174/app/chats` renders the existing `App`, `AuthProvider`, route, `ChatsPage`, and production CSS.
- The mock session signs in a synthetic user automatically; no setup or login form is needed.
- The chat screen shows a repeatable family workspace with several users and direct, group, and channel conversations, including representative messages and unread state.
- Selecting a conversation loads its fixture messages. Common composer interactions can show local optimistic state without saving to a backend.
- Reloading the page restores the original fixture state. No Docker services, database, stage deployment, production credentials, or production data are used.
- The regular `npm run dev` path and production build keep using the real API configuration.

## Proposed approach

Add an opt-in Vite mock mode for the frontend. A `dev:mock` script starts Vite on loopback port `5174` with a strict port and loads a mock-mode environment file. The separate port gives the mode its own browser origin and local storage, avoiding collisions with a normal frontend session. Vite's existing source transform and hot reload still serve the actual application.

In mock mode only, a small browser-side mock API module is loaded before React mounts. It intercepts same-origin `/api/**` fetch requests and returns typed deterministic fixtures. It provides the initial refresh session and the family, member, chat, selected-chat, message-history, pins, and configuration responses needed by the real chat route. Unknown API paths return a clear local mock error; they are never proxied to another server. The mock module owns an in-memory copy of fixture data so a sent message may appear during the current page session and a full reload starts clean.

Before rendering, mock bootstrap seeds the server registry with a synthetic account pointing to the mock origin. This lets the existing auth provider perform its normal refresh flow and keep the production route guards in place. The mock bootstrap must only run under Vite development with the explicit mock mode selected. Production builds must not initialize or expose it.

Fixtures should be defined in a focused frontend module and use the app's existing `User`, `Family`, `Chat`, and `Message` data shapes. The initial dataset should include one signed-in member, several other members, at least one direct chat, one group, one channel, and enough dated messages to show incoming/outgoing, read/unread, and varied message states. Fixture text and files are synthetic.

## Scope and constraints

- First version covers the real chats route and its first-screen dependencies; it is a local frontend aid, not a replacement backend.
- UI state changes needed for a visual check may be simulated in memory. Real realtime delivery, calls, push notifications, durable uploads, and backend authorization are not claimed to work.
- Mock mode binds to `127.0.0.1:5174`, fails if that port is occupied, and makes no API proxy requests. Fixture data must never include real user content or credentials.
- Normal frontend development remains unchanged. No mock behavior is included in production builds.

## Test plan

| Scenario / risk | Proof layer |
| --- | --- |
| Mock mode seeds an isolated synthetic session and restores the real chat route without login/setup | Playwright smoke test against the mock Vite mode |
| The actual chat page renders the fixture family, chat list, and selected conversation messages | Playwright browser test using the configured mock URL |
| Fixture API returns the expected shapes for overview, chat details, history, pins, and auth refresh | Frontend unit tests for mock handlers |
| A send interaction appears locally, while a full page reload returns to the deterministic baseline | Playwright browser test |
| Unknown mock API paths fail locally rather than reaching a backend; regular dev and production mode do not install the mock handler | Frontend unit tests for handler selection and mode guard |
| Existing unrelated local edits and browser origin data remain isolated | Manual check with the mock server on its dedicated loopback port |

## Important design decision

Use the browser-side mock at the existing fetch boundary rather than a separate mock UI or a second application server. This keeps the real app component tree and route behavior under test, avoids Docker and extra service dependencies, and ensures mock writes disappear on reload. It does not prove backend or realtime correctness; those remain the job of the existing integration and E2E environments.
