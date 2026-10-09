# Local Frontend Mock Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer open the real Stovo chats route locally with a deterministic synthetic session and chat data, without starting backend services.

**Architecture:** Vite's `mock` mode starts on loopback port 5174 and sets the frontend API URL to that same origin. Before mounting the existing `App`, a dev-only browser fetch handler serves synthetic API responses and seeds the server registry with a demo account. Mock mutations live only in page memory and reset on reload; ordinary Vite development and production builds retain their current API behavior.

**Tech Stack:** Vite, React, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-frontend-mock-mode-design.md`

## Global Constraints

- Preserve the current `npm run dev` target and normal API routing.
- Bind mock mode only to `127.0.0.1:5174` and fail if that port is occupied.
- Only install mock behavior when Vite is in development and `MODE === "mock"`.
- Use synthetic fixtures only; never proxy unknown mock API calls to another host.
- Keep mock state in browser memory so a full reload restores fixture baseline.
- Keep the actual `App`, auth provider, routes, chat page, and styles in the render path.

## Review Focus

- Stored server state from the mock origin must select the demo user without overwriting the normal dev origin's account.
- A refresh request must return the exact `AuthResponse` shape expected by the current auth provider.
- Every initial chat route request must receive the existing API type shape, including empty auxiliary data where appropriate.
- Unknown API requests must fail locally and never invoke the original fetch implementation.
- Vite HMR must not stack multiple fetch interceptors.

---

### Task 1: Write the contract tests first

**Files:**
- Create: `frontend/src/dev/mockApi.test.ts`
- Create: `frontend/src/dev/mockBootstrap.test.ts`
- Create: `e2e/tests/local-mock-mode.spec.ts`

**Interfaces:**
- `installMockApi(options?: { origin?: string }): () => void` will install same-origin API responses and return a cleanup function.
- `seedMockSession(origin: string): void` will store the synthetic active account for the mock origin only.
- `isMockMode(dev: boolean, mode: string): boolean` will return true only for Vite development mode named `mock`.

- [ ] **Step 1: Write unit tests for refresh, overview, chat detail/history, pins, config, send, unknown routes, session isolation, mode gating, and cleanup.**
  - Verify refresh returns an `AuthResponse` for the named demo user.
  - Verify fixture responses match the `Family`, `User[]`, `Chat[]`, `MessageHistoryPage`, and `PinnedMessage[]` contracts.
  - Verify sending appends a message in memory and resetting restores baseline.
  - Verify unknown API requests return a local 501 response without calling the previous fetch.
  - Verify cleanup restores the previous fetch implementation.
  - Verify session seeding uses the mock origin and does not overwrite another origin's state.
  - Verify mode gating is false in normal dev and production builds.
- [ ] **Step 2: Write a Playwright test for the real `/app/chats` route.**
  - Visit `/app/chats` without manual login/setup.
  - Assert the app navigation, `Stovo Demo` workspace, `Planning Team` group, and a selected conversation's messages render.
  - Use the real composer to send a synthetic message, assert it appears, reload, and assert the initial fixture is restored.
- [ ] **Step 3: Run the unit tests and confirm they fail for the missing mock modules.**
  - Run: `cd frontend && npm test -- src/dev/mockApi.test.ts src/dev/mockBootstrap.test.ts`
  - Expected: missing module or unimplemented behavior failures.
- [ ] **Step 4: Run the Playwright test against an ordinary Vite dev server on port 5174 with `VITE_API_URL=http://127.0.0.1:5174`.**
  - Start: `cd frontend && VITE_API_URL=http://127.0.0.1:5174 npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`
  - Run: `cd e2e && E2E_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/local-mock-mode.spec.ts`
  - Expected: it fails because no synthetic session or fixture workspace is installed.
- [ ] **Step 5: Commit the red contract tests.**
  - Commit message: `[Test] specify local mock frontend behavior`

### Task 2: Implement typed fixtures and browser API mocks

**Files:**
- Create: `frontend/src/dev/mockFixtures.ts`
- Create: `frontend/src/dev/mockApi.ts`
- Create: `frontend/src/dev/mockBootstrap.ts`
- Test: `frontend/src/dev/mockApi.test.ts`
- Test: `frontend/src/dev/mockBootstrap.test.ts`

**Interfaces:**
- Implement the three interfaces defined in Task 1.
- `resetMockData(): void` restores mutable state from immutable fixture data.

- [ ] **Step 1: Add synthetic users, a family, direct/group/channel chats, and dated representative messages using the existing API types.**
  - Include incoming and outgoing messages, unread counts, reactions, and read statuses.
- [ ] **Step 2: Implement same-origin API routing and the mock session seed.**
  - Serve refresh, setup-status, family, members, chat list/details, message history, pins, config manifest, read updates, and message creation needed by the real route.
  - Unknown `/api/**` requests return a clear local error and never fall through to network fetch.
  - Keep sent messages in module memory and restore fixture state on module reload/reset.
  - Ensure duplicate initialization during HMR does not wrap fetch repeatedly.
- [ ] **Step 3: Run focused unit tests and confirm the initial route contracts pass.**
  - Run: `cd frontend && npm test -- src/dev/mockApi.test.ts src/dev/mockBootstrap.test.ts`
  - Expected: all unit tests pass.
- [ ] **Step 4: Commit the mock API implementation and fixtures.**
  - Commit message: `[Feature] add local mock chat API`

### Task 3: Add the one-command startup and browser verification

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/.env.mock`
- Modify: `frontend/src/main.tsx`
- Test: `e2e/tests/local-mock-mode.spec.ts`
- Modify: `README.md`

**Interfaces:**
- `npm run dev:mock` starts Vite in mode `mock` at `http://127.0.0.1:5174` with strict port binding.
- In mock mode, the existing `App` is rendered after mock API installation and demo-session seeding.

- [ ] **Step 1: Add the `dev:mock` script and `.env.mock` API origin.**
  - Use `vite --mode mock --host 127.0.0.1 --port 5174 --strictPort`.
  - Set `VITE_API_URL=http://127.0.0.1:5174` in `.env.mock`.
- [ ] **Step 2: Install mock bootstrap before the existing React tree mounts.**
  - Leave normal `npm run dev` unchanged.
  - Gate initialization with `import.meta.env.DEV` and `MODE === "mock"`.
- [ ] **Step 3: Start the mock mode and run the browser scenario.**
  - Run: `cd frontend && npm run dev:mock`
  - Run: `cd e2e && E2E_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/local-mock-mode.spec.ts`
  - Expected: actual chat route, composer send, and reload reset pass.
- [ ] **Step 4: Document install-once and launch steps in the README development section.**
  - Include `npm ci`, `npm run dev:mock`, URL, synthetic data note, and reload reset behavior.
- [ ] **Step 5: Run focused checks and inspect the complete diff.**
  - Run: `cd frontend && npm test -- src/dev/mockApi.test.ts src/dev/mockBootstrap.test.ts`
  - Run: `cd frontend && npm run build`
  - Run: `cd e2e && E2E_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/local-mock-mode.spec.ts`
  - Run: `git diff --check`
  - Expected: all focused checks pass and the diff is clean.
- [ ] **Step 6: Commit startup, browser test, and documentation.**
  - Commit message: `[Feature] add one-command mock frontend mode`

## Execution handoff

Implement directly in this feature worktree. Do not start Docker or connect to dev/stage; run the mock Vite server and targeted frontend/browser checks only.
