---
title: "Backend and frontend subsystem map"
type: architecture
---

# Backend and frontend subsystem map

This is a navigation guide to the main feature boundaries in the current source tree, not a promise that each directory is an independently deployable service. The backend is built and deployed as one Go application. The frontend is a single React app.

## Task navigation

For a bug or feature, choose the matching entry below, then trace the concrete symbol through its callers. Confirm each path with `rg --files` before editing; this map describes boundaries, while source defines current ownership.

| Reported interaction | First boundary | Follow when affected |
| --- | --- | --- |
| Messages, composer, attachments, chat settings | `frontend/src/features/chats`, `frontend/src/api/chats.ts` | `backend/internal/features/chats`, `messages`, `files`; HTTP/realtime transport |
| Calls, microphone, camera, connection state | `frontend/src/realtime/call`, `frontend/src/realtime/CallController.ts` | `backend/internal/features/calls`, `backend/internal/transport/http/call_routes.go` |
| Login, registration, session refresh | `frontend/src/auth`, `frontend/src/api/auth.ts` | `backend/internal/features/identity`, HTTP login/setup handlers |
| Polls and plans | `frontend/src/api/polls.ts`, `frontend/src/features/plans` | `backend/internal/features/polls`, `plans` |
| Popups, shared styles, translated copy | `frontend/src/components`, `frontend/src/design-system`, `frontend/src/config/strings` | [UI conventions](../engineering/frontend-ui-conventions.md), [popup standards](../ui/popup-standards.md) |
| Persistence, object access, background effects | `backend/internal/ports`, `backend/internal/repository`, `backend/internal/storage` | Actual callers in `backend/internal/app`, feature packages and adapters |
| Deployment or configuration | `deploy/compose`, `deploy/charts/stovo`, `.env.example` | [Compose](../self-hosting/docker-compose.md), [Kubernetes](../self-hosting/kubernetes.md), bootstrap consumers |
| Agent workflow or delivery tooling | `.agents/skills`, `scripts/agent-workflows` | [Program entry](../engineering/agent-workflow-program.md) and the applicable workflow |

Start with a visible label, endpoint, event name or failing test. Search its matching area with `rg -n -F '<literal>' <area>`, then search the discovered symbol's callers across the next boundary. Use neighboring `*.test.ts(x)` or `*_test.go` and transport contracts to identify the smallest regression or acceptance check. Consult `CONTRIBUTING.md` for its command and prerequisites.

Before editing, record the behavior, entry symbol, responsible implementation, affected callers, existing helper/component/dependency to reuse, and focused proof command. Expand the search when a call or contract crosses an area. For broad documentation questions, use the optional docs search in root `AGENTS.md`; source search remains necessary for code ownership.

For a compacted chat or authorized transfer, use the [task handoff](../agent-workflows/task-handoff.md) so the next agent starts with concrete paths and evidence.

## Backend

### Application composition and transport

- `backend/cmd/server`: executable entry point.
- `backend/internal/bootstrap`: constructs persistence, storage, cache, realtime and feature dependencies.
- `backend/internal/app`: application orchestration, use-case wiring, request coordination, and the composition boundary.
- `backend/internal/transport/http`: HTTP handlers, route groups, presenters, middleware, and API contracts.
- `backend/internal/transport/realtime`: Socket.IO event broker, payloads, and realtime delivery contracts.
- `backend/internal/transport/mcp`: Model Context Protocol server and tools.
- `backend/internal/orchestrator`: multi-tenant/master orchestration executable and tenant lifecycle; this is distinct from the single-family Compose application path.

### Feature packages

Feature behavior and business rules are grouped under `backend/internal/features`:

| Package | Responsibility |
| --- | --- |
| `identity` | Initial owner setup, login and registration policy. |
| `family` | Family profile, membership, invites, defaults and family-level queries. |
| `roles` | Role and permission rules. |
| `chats` | Chat creation, membership queries, settings and archives. |
| `messages` | Message persistence operations, history, delivery, read state, search and reactions. |
| `files` | File metadata, listing, validation, access and clone operations. |
| `calls` | Call service rules and participant/session lifecycle. |
| `transcription` | Call transcription session behavior. |
| `plans` | Shared family plans and attendee behavior. |
| `polls` | Poll creation, voting and closure. |
| `privacy` | Privacy controls and related policy. |
| `preferences` | Member and application preferences. |
| `administration` | Instance and public-access administrative settings. |
| `mcp` | Connector and MCP integration behavior. |
| `sync` | Client synchronization and pagination behavior. |

Additional application use cases and transports may exist outside these packages; use `rg --files backend/internal` to find a concrete implementation before extending a feature.

### Persistence and infrastructure

- `backend/internal/domain`: core entities and domain events.
- `backend/internal/ports`: interfaces for persistence, storage, cache, jobs, and other dependencies.
- `backend/internal/repository`: PostgreSQL/Ent-backed repository behavior.
- `backend/internal/adapters`: integrations such as database health, identity setup/status, and external service adapters.
- `backend/internal/infrastructure`: concrete runtime infrastructure wiring and clients.
- `backend/ent` and `backend/migrations`: generated Ent schema/client and Atlas versioned SQL migrations. Production database migration history is managed by Atlas; do not edit a live schema manually.
- `backend/internal/storage` and `backend/cmd/storage-migrate`: local/S3-compatible object access and the legacy local-upload migration utility.

The backend uses PostgreSQL for durable relational state. Redis cache/presence and Redis Streams jobs are separate services in the production Compose topology. The object store holds user media and other file payloads, so its backup and access rules must be managed alongside the database.

## Frontend

The web client is under `frontend/src`:

- `api`: HTTP client functions and API response models.
- `realtime`: Socket.IO connections, calls, and related live transport.
- `features/chats`: chat workspace, message composer/history, attachments, calls, polls, shared content and guest meetings.
- `features/plans`: plan-related UI and workflows.
- `pages`: route-level views.
- `components`: reusable interface components.
- `appearance`, `config`, `settings`, `i18n`: appearance, app configuration, preferences and localization.
- `auth`: client authentication and session handling.
- `native`: Capacitor/native integrations.
- `plugins`: plugin-facing UI and feature configuration; server-side plugin execution is not implied.
- `hooks`, `utils`, `motion`, `shortcuts`: cross-cutting client utilities and interaction behavior.

Some UI features call into several backend feature and transport packages. Trace from the frontend API function through the HTTP/realtime route and backend feature boundary before making cross-layer changes.

## Finding tests and contracts

- Backend package tests live beside their Go sources as `*_test.go`; integration tests are under `backend/internal/app` and may require explicit test database/Redis settings.
- Frontend unit/component tests live beside their sources as `*.test.ts` and `*.test.tsx`.
- HTTP route and Socket.IO contract definitions live under `backend/internal/transport`.
- Database migration guidance is in `backend/migrations/BASELINE.md`.
