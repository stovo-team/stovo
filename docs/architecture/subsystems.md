---
title: "Backend and frontend subsystem map"
type: architecture
---

# Backend and frontend subsystem map

This is a navigation guide to the main feature boundaries in the current source tree, not a promise that each directory is an independently deployable service. The backend is built and deployed as one Go application. The frontend is a single React app.

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
