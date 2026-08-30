# Family Messenger

This project is a self-hosted family messenger that provides real-time private communication, invite-based access, role-based permissions, MinIO-backed private file sharing, and modular infrastructure abstractions. The system uses PostgreSQL for persistent data, Redis for message brokering and caching, and MinIO for file objects and durable structured log archives.

The backend is a Go modular monolith built with Chi and Ent. It uses feature-owned application services and infrastructure ports so business rules remain separate from Redis, object storage, and transport concerns.

## Handoff Snapshot

This repository is in a good handoff state for review and presentation:

- the current product is runnable locally with Docker Compose
- the backend/frontend contract has been frozen in `docs/contracts/rewrite-freeze`
- the repository now includes focused architecture and demo notes for walkthroughs and rewrite review

Start with these documents:

- `docs/architecture.md` for the current runtime shape, module boundaries, and rewrite-sensitive seams
- `docs/demo-guide.md` for a concise demo script, review flow, and presentation talking points
- `docs/contracts/rewrite-freeze/README.md` for the contract-freeze artifact index
- `docs/contracts/rewrite-freeze/parity-checklist.md` for the later parity/stabilization checklist

## Implemented Scope

This repository currently implements the project foundation through Phase 7:

- Go backend (Chi + Ent)
- React + Vite + TypeScript frontend
- PostgreSQL service
- Redis service
- Docker Compose orchestration
- Atlas versioned migration system
- health endpoints for backend, database, and Redis
- Socket.IO health stub
- infrastructure abstractions for broker, cache, storage, and encryption
- initial owner setup
- Argon2id password hashing
- access JWTs and HttpOnly refresh-token cookies
- refresh-token rotation and logout revocation
- family profile and member list
- invite creation, preview, acceptance, and revocation foundation
- role changes and soft member removal
- default General Family Chat creation
- direct 1-on-1 chat creation and chat membership access checks
- chat list/detail frontend shell
- text message history and sending
- authenticated Socket.IO message, read, and typing events
- pragmatic message statuses: sent, delivered, read
- Redis-backed broker/cache access through internal providers and test fakes
- presence, typing, login, and message-send rate-limit services
- local file uploads with MIME and size validation
- SHA-256 checksums and safe local object keys
- authorized file downloads and soft deletion
- message attachments with image/video/file/mixed message types
- family file gallery UI
- admin monitoring page with protected backend log visibility
- rotating backend log file plus in-memory log buffer for the admin panel

The project does not yet include message encryption-at-rest behavior, MinIO/S3, audio/video calls, push notifications, backup management, or full server statistics.

## Architecture

```text
bootstrap
  -> outer adapters / HTTP and realtime transports / runtime workers
  -> feature services and feature-owned ports
  -> domain
```

The backend is being migrated incrementally to this feature-first Onion
Architecture. `internal/domain` is framework-free. `internal/features` owns
application commands, queries, results, and the narrow ports it consumes.
Ent, PostgreSQL, Redis, object storage, Socket.IO, configuration, and external
providers are outer concerns composed by `internal/bootstrap`.

This is intentionally a compatibility-preserving migration: the HTTP paths,
JSON payloads, status codes, cookies, Socket.IO events/acks, MCP behavior, and
Atlas schema remain stable. `internal/app` is still the compatibility façade
for routes, Socket.IO callbacks, and some worker supervision while the
remaining slices are cut over feature by feature. It is not yet valid to call
the migration complete.

The enforced dependency rules and a current ownership/cutover inventory live
in `backend/architecture_test.go` and `backend/MIGRATION_INVENTORY.md`.

For a review-friendly narrative of the current system and the rewrite constraints, see `docs/architecture.md`.

## Demo Flow At A Glance

For a live walkthrough, the most presentation-friendly path is:

1. Start from a clean stack and complete owner setup.
2. Show login persistence and the main family chat shell.
3. Create or accept an invite to demonstrate family membership growth.
4. Open chats, send a message, and point out realtime typing/read behavior.
5. Upload a file and open the gallery/download flow.
6. Finish on the admin page to show logs and public-access sharing controls.

The detailed presenter script and fallback talking points live in `docs/demo-guide.md`.

## Run With Docker

Prerequisite: Docker Desktop (or another local Docker engine) must be running.

Copy the environment example only if you want to override the defaults:

```bash
cp .env.example .env
```

Start the full stack from the repository root:

```bash
docker compose up --build
```

Local compose starts a single backend (`backend-blue`). The second color
(`backend-green`, profile `bluegreen`) is only started by deploy cutovers.

### Migrating Existing Local Uploads

After MinIO starts and before removing the legacy `uploads` directory, run the checksum-verified migration while uploads are paused:

```bash
docker compose run --rm backend /usr/local/bin/storage-migrate
```

The command writes a JSON manifest to the private `stovo-logs/migrations/` prefix and exits non-zero if any referenced object cannot be copied and verified. Keep the legacy directory for rollback until the manifest and production smoke test are accepted.

What happens on startup:

- PostgreSQL and Redis start first.
- The one-shot `backend-migrate` service applies the checked-in Atlas migration directory before either backend color starts.
- The Go/Chi backend then starts without performing DDL at runtime.
- The frontend container builds once and serves the Vite preview build on port `5173`.

Open the app:

```text
http://localhost
```

The backend API is available at:

```text
http://localhost/api
```

Direct container ports are still exposed for debugging:

```text
http://localhost:5173
http://localhost:8000
```

Quick verification endpoints:

```text
http://localhost/api/health
http://localhost/api/health/db
http://localhost/api/health/redis
```

To stop the stack:

```bash
docker compose down
```

To reset the local Docker database/cache volumes and start from a clean baseline:

```bash
docker compose down -v
docker compose up --build
```

Use the reset command only when you want to discard local dev data.

### Troubleshooting Docker Startup

If `backend-migrate` reports an Atlas checksum or dirty-database error, your local
Postgres volume was created from an older branch or migration history. For disposable
local data, reset the local Docker volumes and start again:

```bash
docker compose down -v
docker compose up --build
```

This repository's clean-checkout path expects a fresh local database volume.

For an existing non-disposable database, do not reset or let the migration service
guess. Follow [the Atlas baseline procedure](backend/migrations/BASELINE.md) to back
up, check for drift, and stamp the existing baseline before deployment.

## Frontend Build Check

If you want to verify the frontend production bundle outside Docker:

```bash
cd frontend
npm ci
npm run build
```

The build output is written to `frontend/dist`.

### Sharing Invite Links On Another Device

Owners and admins can set reachable invite-link URLs from:

```text
http://localhost:5173/app/admin
```

Use the Public access panel to save the frontend URL and backend API URL that another
device can reach. For same-network testing, use your computer's LAN IP, for example:

```text
App URL: http://192.168.1.25:5173
API URL: http://192.168.1.25:8000
```

For tunnel-based testing, use a single backend-edge public URL (`:8000`) for both App URL and API URL.
New invite links will use the saved App URL and include the saved API URL so invited devices can connect.
The Admin page also includes buttons to fill URLs from the current LAN host, apply
detected address candidates, and check whether the saved frontend/API URLs respond.
For easiest public sharing, use **Start public tunnel**. The backend starts a
Cloudflare Quick Tunnel, saves the generated HTTPS URL for both the app and API,
and new invite links become reachable from outside the local network.

LocalTunnel notes:

- Use LocalTunnel only through backend-edge routing (`loca.lt` URL points to backend `:8000`).
- If LocalTunnel starts returning repeated `502` errors, the backend now marks tunnel health as degraded and auto-restarts LocalTunnel.
- Quick diagnostic: open `<public-url>/assets/<bundle>.js` and verify it returns JavaScript (not an HTML warning/interstitial page).

## Health Endpoints

```text
GET /api/health
GET /api/health/db
GET /api/health/redis
```

## Auth And Invite Endpoints

```text
GET  /api/auth/setup-status
POST /api/auth/setup
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me

GET    /api/family
PATCH  /api/family
GET    /api/family/members
PATCH  /api/family/members/:userId/role
DELETE /api/family/members/:userId

POST   /api/invites
GET    /api/invites/:token
POST   /api/invites/:token/accept
DELETE /api/invites/:inviteId

GET  /api/chats
POST /api/chats/direct
GET  /api/chats/:chatId

GET   /api/chats/:chatId/messages
POST  /api/chats/:chatId/messages
PATCH /api/messages/:messageId/read

POST   /api/files/upload
GET    /api/files
GET    /api/files/:fileId
GET    /api/files/:fileId/download
DELETE /api/files/:fileId

GET /api/admin/logs
```

Frontend routes:

```text
/setup
/login
/invite/:token
/app/chats
/app/chats/:chatId
/app/files
/app/members
/app/admin
```

Socket.IO events:

```text
client -> server: message:send, message:read, typing:start, typing:stop
server -> client: message:new, message:delivered, message:read, typing:update, error
```

Admin log monitoring:

```text
GET /api/admin/logs?level=INFO&logger=app.modules&search=message&limit=200
```

Only owners and admins can access the endpoint and `/app/admin`.

Expected local URLs:

```text
http://localhost:8000/api/health
http://localhost:8000/api/health/db
http://localhost:8000/api/health/redis
```
