# Stovo

> A private, self-hosted family communication and collaboration platform designed for trusted groups.

Stovo provides a secure, calm, and private home for family communication. Built from the ground up for trusted spaces rather than public feeds, Stovo combines real-time messaging, WebRTC voice and video calls with LiveKit SFU, AI-powered transcription and summaries, S3-compatible private file sharing, shared family coordination tools (Plans, Collaborative Canvas, and Checklists), push notifications, and extensive administration controls with built-in zero-config public tunneling.

---

## Table of Contents

- [Brand Identity & Design Philosophy](#brand-identity--design-philosophy)
- [System Architecture & Realization](#system-architecture--realization)
- [Core Business Logic & Features](#core-business-logic--features)
  - [Identity, Access & Family Structure](#identity-access--family-structure)
  - [Real-Time Messaging & Chat Topologies](#real-time-messaging--chat-topologies)
  - [Voice & Video Calling (WebRTC + LiveKit SFU)](#voice--video-calling-webrtc--livekit-sfu)
  - [Private File Sharing & Media Gallery](#private-file-sharing--media-gallery)
  - [Family Collaboration Tools](#family-collaboration-tools)
  - [Push Notifications & Native Apps](#push-notifications--native-apps)
  - [Extensibility, Plugins & Model Context Protocol (MCP)](#extensibility-plugins--model-context-protocol-mcp)
  - [Administration & Operations](#administration--operations)
- [Quick Start with Docker](#quick-start-with-docker)
  - [Prerequisites](#prerequisites)
  - [Environment Configuration](#environment-configuration)
  - [Starting the Full Stack](#starting-the-full-stack)
  - [Zero-Downtime Blue/Green Architecture](#zero-downtime-bluegreen-architecture)
  - [Migrating Existing Local Uploads to S3/MinIO](#migrating-existing-local-uploads-to-s3minio)
  - [Troubleshooting & Database Baselining](#troubleshooting--database-baselining)
- [Remote Access & Sharing](#remote-access--sharing)
- [Frontend Development & Build](#frontend-development--build)
- [API & Realtime Contract Reference](#api--realtime-contract-reference)
  - [HTTP API Endpoints](#http-api-endpoints)
  - [Frontend Route Index](#frontend-route-index)
  - [Realtime Socket.IO Events](#realtime-socketio-events)
- [Repository & Documentation Index](#repository--documentation-index)

---

## Brand Identity & Design Philosophy

Stovo is built for families and close-knit groups. The interface is intentionally cleaner than a noisy social media app and warmer than a corporate enterprise tool.

- **Calm & Trustworthy:** No aggressive colors, infinite feeds, algorithmic notifications, or visual clutter. Surfaces rely on clear contrast, soft borders, and an intentional 8px grid.
- **Brand Mark:** Three rounded rectangles rotated ~45° in an overlapping diagonal arrangement, signifying motion, connection, and flow. The signature gradient transitions from **Rose** (`#e11d48`) to **Orange** (`#fb923c`).
- **Dynamic Theming:** Native support for **Light**, **Dark**, **AMOLED** (pure black for OLED screens), and **System** modes. Users can select from 6 curated accent colors (Blue, Green, Purple, Rose, Amber) or specify a custom hex code.
- **Surface Customization:** Adjustable chat wallpaper textures (Dots, Paper, Aurora, Plain, and custom image upload), configurable message bubble corner radii (Rounded 18px, Soft 12px, Square 6px), font scaling, and density settings.
- **Cross-Platform:** Responsive desktop three-panel layout and mobile-optimized views, alongside native Android and iOS client wrappers built with Capacitor (including full-screen incoming call intents).

---

## System Architecture & Realization

Stovo is implemented as a modern, resilient modular monolith designed for effortless self-hosting and zero-downtime upgrades.

```mermaid
flowchart TD
    Client[Web Browser / Capacitor Mobile] -->|HTTP / WebSocket| Caddy[Caddy Edge Reverse Proxy (:80, :443)]
    
    subgraph Frontend Tier
        Caddy -->|Static Assets / SPA Routing| Frontend[React 19 + TypeScript + Vite (:8080)]
    end

    subgraph Backend Services
        Caddy -->|/api/* & /socket.io| BackendBlue[Go Backend - Active 'backend-blue' (:8000)]
        Caddy -.->|Deploy Cutover| BackendGreen[Go Backend - Standby 'backend-green']
    end

    subgraph Realtime & Media
        Client -->|WebRTC Media & Signaling| LiveKit[LiveKit SFU Server (:7880, UDP 50000-50100)]
        Client -.->|STUN / TURN Relay| Coturn[Coturn Server (:3478, UDP 49160-49200)]
        BackendBlue <-->|SFU Tokens & Webhooks| LiveKit
    end

    subgraph Data & Storage Tier
        BackendBlue --> Postgres[(PostgreSQL 16)]
        BackendBlue --> RedisPubSub[(Redis - Cache, Presence & Pub/Sub)]
        BackendBlue --> RedisJobs[(Redis Streams - Durable Job Outbox)]
        BackendBlue --> MinIO[(MinIO / S3 Object Storage)]
    end

    subgraph Intelligence & Notifications
        BackendBlue -->|STT / Whisper & Summary| GroqAPI[Groq AI Cloud API]
        BackendBlue -->|Unified Push Notifications| Ntfy[ntfy Server / Firebase FCM]
    end
```

### Backend Realization (Go 1.22+)
- **Framework & Routing:** Built with Chi v5 for lightweight, high-performance HTTP dispatch and middleware composition.
- **Data Layer:** PostgreSQL accessed via Ent ORM and the pgx driver. Versioned database migrations are managed with Atlas via an isolated one-shot container (`backend-migrate`) on startup—ensuring zero runtime DDL.
- **Architecture Pattern:** Feature-first Onion Architecture. Business rules are encapsulated within `internal/domain` and `internal/features`, consuming narrow infrastructure ports. Outer infrastructure adapters (`internal/infrastructure`) handle Postgres, Redis, MinIO, Socket.IO, Groq, and LiveKit, composed cleanly at startup in `internal/bootstrap`.
- **Durable Event Outbox:** Employs a transactional outbox pattern via Redis Streams (`redis-jobs` with `noeviction` policy) to separate durable background asynchronous worker jobs from ephemeral cache, presence, and pub/sub data.
- **Security Hardening:** Passwords hashed with Argon2id; authentication powered by rotating short-lived JWT access tokens and secure HttpOnly refresh cookies; cross-site request forgery (CSRF) mitigation; and configurable AES-GCM encryption-at-rest for message payloads.

### Frontend Realization (React 19 + TypeScript)
- **Tooling:** Vite, React 19, TypeScript, and Lucide React.
- **Styling Architecture:** Single-bundle CSS custom properties (`styles.css`) driven by a runtime `AppearanceContext`, enabling instant, zero-reload theme switching and live customization preview without heavy CSS-in-JS runtimes.
- **Realtime Integration:** Socket.IO client v4, LiveKit client SDK, and native browser WebRTC APIs.
- **Productivity & Navigation:** Built-in global Quick Switcher (Cmd+K / Ctrl+K) and full keyboard navigation.
- **Mobile Packaging:** Capacitor integration enabling native build outputs for Android and iOS with native push, haptics, and full-screen call ringing screens.

---

## Core Business Logic & Features

### Identity, Access & Family Structure
- **Invite-Only Access Model:** Open registration is strictly disabled. The initial instance setup claims the Owner account (`/setup`). All subsequent accounts are created exclusively through cryptographically signed invite tokens (`/invite/:token`).
- **Role-Based Access Control (RBAC):** Built-in roles (Owner, Admin, Member) with granular permissions covering chat creation, member removal, role assignment, invite generation, call management, and guest link issuance.
- **Multi-Device Pairing:** Secondary devices can log in by scanning a secure dynamic QR code from an authenticated device (`/api/auth/device-login/*`) without re-entering credentials.
- **App Lock Gate:** In-app PIN lock gate and biometric support to keep family communications private on shared household tablets and phones.
- **Member Defaults:** Global admin controls for default notification rules, quiet hours, and privacy preferences for newly joined family members.

### Real-Time Messaging & Chat Topologies
- **Chat Types:** 
  - **Direct Messages (1:1):** Private, encrypted two-party conversations.
  - **Group Chats:** General family channels and custom topic groups.
  - **Announcement Channels:** Read-only broadcast spaces for family organizers.
  - **Voice Chats:** Persistent audio rooms for drop-in communication.
- **Realtime Lifecycle:** Optimistic sending with reliable status transitions: `sent` (server received) → `delivered` (recipient socket received) → `read` (recipient viewed).
- **Message Operations:** In-place message editing, soft-deletion (tombstones), message pinning, forwarding across conversations, and message archiving with group filters.
- **Interactive Elements:** Emoji reactions with live tally updates, automated link unfurling (`/api/unfurl`) with OpenGraph card rendering, and interactive family polls with real-time voting and multi-option support.
- **Encryption at Rest:** Configurable server-side AES-GCM envelope encryption for message bodies using `MESSAGE_ENCRYPTION_KEY`.

### Voice & Video Calling (WebRTC + LiveKit SFU)
- **Hybrid Calling Engine:** 1:1 calls utilize direct peer-to-peer WebRTC mesh for minimal latency; multi-party group calls automatically route through the bundled LiveKit SFU.
- **STUN/TURN Integration:** Integrated Coturn server ensures reliable NAT traversal across mobile networks and restrictive home firewalls.
- **Temporary Guest Meetings:** Members can generate time-limited guest meeting links (`/meet/:token`) with optional waiting-room admission, allowing non-registered relatives, doctors, or friends to join calls via any modern browser.
- **In-Call Recordings:** Audio and video calls can be recorded directly to S3/MinIO storage.
- **AI-Powered Intelligence (Groq):**
  - Real-time speech-to-text transcription powered by Whisper large-v3-turbo.
  - Post-call transcript generation, automated summaries, and extracted action items.
  - Live closed captions with real-time multilingual translation during calls.

### Private File Sharing & Media Gallery
- **Object Storage Support:** Full S3 compatibility supporting the bundled MinIO instance or external object stores (Cloud.ru, AWS S3, Wasabi).
- **Direct Presigned Uploads:** Fast, authenticated direct uploads with MIME type detection, file size limits, and SHA-256 checksum verification.
- **Family Media Gallery (`/app/files`):** Chronological, month-grouped media browser with dedicated tabs for Images, Videos, Audio waveforms, and Documents.
- **Media Streaming:** Secure HTTP Range-request streaming for video and audio playback backed by short-lived playback tokens (`/api/media/{fileId}`).
- **Media Transcriptions:** Voice notes and uploaded video files can be automatically transcribed into text.
- **Collections:** Organize family media into curated albums and collections (`/api/collections`).

### Family Collaboration Tools
- **Shared Family Plans (`/app/plans`):** Calendar events and family milestones with RSVP tracking (Accepted, Declined, Tentative).
- **Collaborative Canvas (`/app/canvas/:canvasId`):** In-app whiteboard for sketching, diagrams, and collaborative family notes.
- **Shared Checklists (`/app/checklist/:checklistId`):** Real-time collaborative checklists for groceries, packing, and household chores.

### Push Notifications & Native Apps
- **Dual-Engine Notification Architecture:** Supports self-hosted ntfy servers for lightweight, account-free push notifications, alongside Firebase Cloud Messaging (FCM) for native mobile push.
- **Full-Screen Call Ringing:** Native Capacitor integration triggers system-level full-screen incoming call intents on Android devices.

### Extensibility, Plugins & Model Context Protocol (MCP)
- **Model Context Protocol (MCP) Endpoint (`/mcp`):** Native streamable MCP server enabling AI agents (e.g. Claude, Antigravity, custom agents) to securely query and interact with chats, messages, and files. Includes admin token management, granular permission scoping, and full audit logging.
- **In-Process Plugin Engine (`internal/plugins`):** Event-driven extensibility model with built-in plugins:
  - `stats_plugin`: Real-time system health and resource metrics.
  - `canvas_plugin`: Shared collaborative canvas backend.
  - `checklist_plugin`: Family checklists and todo synchronization.
  - `theme_plugin`: Custom community theme distribution.
  - `bot_plugin`: Interactive chat bots and event hooks.

### Administration & Operations
- **One-Click Public Access:** Integrated Cloudflare Quick Tunnel and LocalTunnel management directly from the Admin UI. Launching a tunnel automatically provisions a public HTTPS domain, updates API routing, and allows sharing invite and guest links outside the local network with zero router port forwarding.
- **Structured Log Monitoring:** In-memory ring buffer and rolling log file viewer (`/api/admin/logs`) in the admin console with live search and level filtering (DEBUG, INFO, WARN, ERROR).
- **Role & Permission Customization:** Create, modify, and assign granular permissions across family roles.
- **Instance Branding & Appearance Defaults:** Set default themes, accents, and logos for all family members.
- **Multi-Server Management:** Multi-admin cluster dashboard (`/multi-admin`, `/s/:slug/*`) for managing multiple Stovo nodes or family branches.

---

## Quick Start with Docker

### Prerequisites
- Docker Engine 24+ and Docker Compose v2.
- A running Docker daemon (e.g. Docker Desktop, OrbStack, or standard Linux Docker CE).

### Environment Configuration
Copy the provided environment template:

```bash
cp .env.example .env
```

Review `.env` and configure your required secrets:
- `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `INVITE_TOKEN_SECRET`
- `MESSAGE_ENCRYPTION_KEY` (32-byte hex key for AES-GCM at-rest encryption)
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`
- `TURN_USERNAME`, `TURN_PASSWORD`, `TURN_REALM`
- Optional: `GROQ_API_KEY` for AI call transcription and summaries.

### Starting the Full Stack

Launch the production-grade stack from the repository root:

```bash
docker compose up --build -d
```

#### Startup Orchestration Flow
1. `postgres`, `redis-jobs`, `ntfy`, and `minio` start and pass health checks.
2. `minio-init` provisions buckets (`stovo-files`, `stovo-logs`, `stovo-calls`) and bucket access policies.
3. `backend-migrate` executes Atlas versioned migrations against PostgreSQL.
4. `backend-blue` (active Go modular monolith) boots and verifies database/redis connections.
5. `frontend` builds the optimized production bundle and serves it via nginx/vite.
6. `caddy` binds ports `80` and `443`, routing `/api` and `/socket.io` to `backend-blue` and all other routes to `frontend`.
7. `coturn` and `livekit` initialize WebRTC media routing.

Open the web application:
```text
http://localhost
```

The first user visiting `/` is automatically redirected to `/setup` to initialize the Owner account.

### Zero-Downtime Blue/Green Architecture
The compose setup includes `backend-blue` and `backend-green`. By default, only `backend-blue` runs. During deployment:
1. The inactive color (`backend-green`, profile `bluegreen`) is built and health-checked.
2. Caddy flips its upstream pointer (`ACTIVE_BACKEND`).
3. The old container is gracefully stopped without dropping active client connections.

If you override `BACKEND_UPSTREAMS` in `.env` or deployment configuration, use the proxy-only aliases (`backend-blue-proxy:8000` and/or `backend-green-proxy:8000`). The plain `backend-blue:8000` and `backend-green:8000` names resolve over the default network and bypass the trusted Caddy interface.

### Migrating Existing Local Uploads to S3/MinIO
If upgrading from an earlier version that used local filesystem storage (`uploads/`), run the verified migration tool while uploads are idle:

```bash
docker compose run --rm backend /usr/local/bin/storage-migrate
```
This utility copies objects to MinIO, calculates SHA-256 checksums, logs an audit manifest to `stovo-logs/migrations/`, and ensures zero data loss before local files are unmounted.

### Troubleshooting & Database Baselining
- **Resetting Disposable Data:** To wipe local test databases and start clean:
  ```bash
  docker compose down -v
  docker compose up --build
  ```
- **Atlas Migration Checksum Mismatch:** If working with an existing database volume created across divergent branches, follow the [Atlas Baseline Procedure](backend/migrations/BASELINE.md) to inspect drift and baseline schema versions.

---

## Remote Access & Sharing

To share invite links or video calls with family members on mobile devices or outside your home Wi-Fi network:

1. Open **Admin** (`/app/admin`) → **Public Access**.
2. **Cloudflare Quick Tunnel (Easiest):** Click **Start public tunnel**. The backend starts a secure Cloudflare Quick Tunnel, generates a trusted HTTPS domain, and synchronizes your invite link URLs automatically.
3. **Same-Network / LAN IP:** Use **Fill from host** to configure your computer's local IP (e.g. `http://192.168.1.50`).
4. **Custom Domain:** Point your DNS to your server and configure `APP_DOMAIN` in `.env` for automatic Let's Encrypt TLS certificates via Caddy.

---

## Frontend Development & Build

To develop or build the frontend independently outside Docker:

```bash
cd frontend
npm ci
npm run build
```

Production build artifacts are generated in `frontend/dist`.

For local frontend development with hot-module reload (HMR):
```bash
npm run dev
```

---

## API & Realtime Contract Reference

### HTTP API Endpoints

#### Core & Health
- `GET /.well-known/assetlinks.json` — Android native app deep-link verification
- `GET /api/health` — Overall backend liveness probe
- `GET /api/health/db` — PostgreSQL connectivity probe
- `GET /api/health/redis` — Redis cache & stream readiness probe
- `GET /api/sync` — Incremental delta synchronization for mobile clients
- `GET /api/v1/config/manifest` — Client configuration manifest

#### Authentication & Account
- `GET /api/auth/setup-status` — Check if initial instance setup is required
- `POST /api/auth/setup` — Initial instance owner account creation
- `POST /api/auth/login` — Account sign-in (returns access token & sets refresh cookie)
- `POST /api/auth/device-login/request` — Initiate QR-code cross-device authentication
- `POST /api/auth/device-login/verify` — Confirm secondary device authentication
- `POST /api/auth/refresh` — Rotate access token using HttpOnly cookie
- `POST /api/auth/logout` — Revoke session and invalidate refresh token
- `GET /api/auth/me` / `PATCH /api/auth/me` — Current user profile and settings
- `POST /api/auth/change-password` — Password update
- `GET /api/privacy/blocks` — List blocked accounts
- `POST /api/privacy/blocks/:userId` / `DELETE /api/privacy/blocks/:userId` — Block or unblock users
- `GET /api/auth/audio-settings` / `PUT /api/auth/audio-settings` — User audio & call preferences
- `GET /api/notifications/topic` — Retrieve user push notification topic
- `POST /api/notifications/device-token` / `DELETE /api/notifications/device-token` — Register/unregister FCM device tokens

#### Family, Roles & Plans
- `GET /api/family` / `PATCH /api/family` — Family profile and name
- `GET /api/family/members` — List all family members
- `GET /api/family/roles` / `POST /api/family/roles` — Role definitions and permissions
- `PATCH /api/family/roles/:roleId` / `DELETE /api/family/roles/:roleId` — Update or remove roles
- `PATCH /api/family/members/:userId/role` — Change a member's role
- `DELETE /api/family/members/:userId` — Soft-remove a member from the family
- `GET /api/plans` / `POST /api/plans` — Shared family calendar events
- `POST /api/plans/:planId/rsvp` — RSVP to a family plan

#### Invites & Guest Meetings
- `POST /api/invites` — Create a family invitation token
- `GET /api/invites/:token` — Preview invite details (family name, invited role)
- `POST /api/invites/:token/accept` — Accept invitation and create member account
- `DELETE /api/invites/:inviteId` — Revoke an active invitation
- `POST /api/guest-meetings` — Create a time-limited guest video meeting
- `GET /api/guest-meetings/:meetingID` — Host management view for guest meetings
- `POST /api/guest-meetings/:meetingID/host-token` — Mint host LiveKit SFU token
- `POST /api/guest-meetings/:meetingID/sessions/:sessionID/admit` — Admit guest from waiting room
- `POST /api/guest-meetings/:meetingID/sessions/:sessionID/remove` — Eject guest from meeting
- `POST /api/guest-meetings/:meetingID/revoke` — Invalidate guest meeting link
- `GET /api/guest-meetings/public/:token` — Guest meeting preview (unauthenticated)
- `POST /api/guest-meetings/public/:token/sessions` — Request guest session admission
- `GET /api/guest-meetings/public/:token/status` — Poll guest admission status
- `POST /api/guest-meetings/public/:token/token` — Mint admitted guest LiveKit SFU token
- `GET /api/guest-meetings/public/:token/intelligence` — Query guest call transcription/recording status
- `POST /api/guest-meetings/public/:token/captions/translate` — Translate live captions for guests

#### Chats, Messages & Polls
- `GET /api/chats` — List conversations
- `POST /api/chats/direct` — Create or open 1:1 direct chat
- `POST /api/chats/group` — Create family group chat
- `POST /api/chats/channel` — Create announcement broadcast channel
- `POST /api/chats/voice` — Create persistent voice room
- `GET /api/chats/:chatId` / `PATCH /api/chats/:chatId` — Conversation metadata and settings
- `POST /api/chats/:chatId/members` — Add members to chat
- `PATCH /api/chats/:chatId/preferences` — Mute, pin, or customize chat notifications
- `GET /api/chats/:chatId/messages` — Fetch paginated message history
- `POST /api/chats/:chatId/messages` — Send message
- `GET /api/messages/:messageId` / `PATCH /api/messages/:messageId` / `DELETE /api/messages/:messageId` — Inspect, edit, or delete message
- `POST /api/messages/:messageId/attachments` — Attach uploaded files to message
- `GET /api/chats/:chatId/pins` — List pinned messages
- `POST /api/chats/:chatId/pins/:messageId` / `DELETE /api/chats/:chatId/pins/:messageId` — Pin or unpin message
- `PATCH /api/messages/:messageId/read` — Mark message as read
- `POST /api/messages/:messageId/forward` — Forward message to target chat
- `GET /api/message-archive` / `GET /api/message-archive/groups` — Search message archive
- `POST /api/messages/:messageId/archive` — Archive message
- `POST /api/messages/:messageId/reactions` / `DELETE /api/messages/:messageId/reactions/:emoji` — Add or remove emoji reactions
- `GET /api/unfurl` — OpenGraph link preview metadata scraper
- `POST /api/chats/:chatId/polls` — Create interactive poll
- `POST /api/polls/:pollId/vote` — Cast poll vote
- `POST /api/polls/:pollId/close` — Close poll
- `GET /api/polls/:pollId/voters` — List poll participants and votes

#### Files, Media & Collections
- `POST /api/files/upload` — Direct multipart file upload
- `POST /api/files/uploads` — Reserve presigned S3 upload
- `GET /api/files/uploads/:uploadId` — Query upload reservation
- `POST /api/files/uploads/:uploadId/complete` — Finalize direct S3 upload
- `GET /api/files` — List files with type, date, and search filters
- `GET /api/files/:fileId` — Inspect file metadata
- `POST /api/files/:fileId/access` — Generate temporary direct access URL
- `GET /api/files/:fileId/download` — Download file
- `GET /api/files/:fileId/thumbnail` — Retrieve generated image/video thumbnail
- `POST /api/files/:fileId/playback-token` — Request short-lived token for media streaming
- `PATCH /api/files/:fileId/preferences` — Rename or update file metadata
- `POST /api/files/:fileId/transcribe` — Request AI transcription of media file
- `GET /api/files/:fileId/transcript` — Retrieve media transcript
- `DELETE /api/files/:fileId` — Soft-delete file
- `GET /api/media/:fileId` / `HEAD /api/media/:fileId` — Stream audio/video with HTTP Range support
- `GET|POST|DELETE /api/collections/*` — Curate and manage media collections

#### WebRTC Calls & Transcription
- `GET /api/calls/ice-servers` — Fetch Coturn STUN/TURN configuration and credentials
- `POST /api/calls/:roomId/sfu-token` — Mint LiveKit SFU participant token
- `POST /api/calls/:roomId/transcription/start` / `stop` — Control real-time Whisper transcription
- `GET /api/calls/:roomId/transcription/status` — Check active transcription status
- `GET /api/calls/:roomId/transcript` — Get live/completed call transcript
- `POST /api/calls/:roomId/transcription/uploads` — Chunked audio upload for transcription
- `GET /api/calls/:roomId/transcript/artifacts/:artifactType` — Fetch AI summary and action items
- `POST /api/calls/:roomId/recording/start` / `stop` — In-call recording control
- `GET /api/calls/:roomId/recording/status` — Check recording progress
- `POST /api/calls/:roomId/captions/translate` — Real-time caption translation

#### Administration, MCP & Plugins
- `GET /api/admin/logs` — Query backend log stream
- `GET /api/admin/public-access` / `PUT /api/admin/public-access` — Manage Cloudflare tunnel and URLs
- `GET /api/admin/public-access/suggestions` — Local LAN IP address auto-detection
- `GET /api/admin/public-access/check` — Verify reachability of configured URLs
- `GET|POST /api/admin/public-access/tunnel/*` — Start, stop, or query Cloudflare Quick Tunnel
- `GET /api/admin/encryption-settings` / `PUT /api/admin/encryption-settings` — Manage encryption-at-rest keys
- `GET|POST /api/admin/mcp-connectors` — List or register Model Context Protocol connectors
- `GET|PATCH|POST /api/admin/mcp-connectors/:connectorId/*` — Manage connector tokens, scopes, and audits
- `GET /api/admin/plugins` / `PATCH /api/admin/plugins/:pluginId` — Inspect and configure in-process plugins
- `ALL /mcp` — Model Context Protocol streamable HTTP interface for AI agents
- `ALL /api/v1/plugins/*` — Plugin-mounted routes (Canvas, Checklists, Server Stats)

---

### Frontend Route Index

| Route | Description |
|---|---|
| `/setup` | First-run setup: initial owner account creation |
| `/login` | Member sign-in with username, password, or device pairing |
| `/invite/:token` | Invitation acceptance and new member onboarding |
| `/meet/:token` | Guest video meeting interface (no account required) |
| `/app/chats/:chatId?` | Main messaging interface (direct messages, group chats, channels, voice rooms) |
| `/app/files` | Family media gallery, document store, and collections |
| `/app/plans` | Shared family plans, calendar events, and RSVPs |
| `/app/canvas/:canvasId` | Collaborative whiteboard canvas |
| `/app/checklist/:checklistId` | Shared real-time family checklist |
| `/app/settings` | Personal profile, appearance customizer, and audio preferences |
| `/app/settings/statistics` | System statistics and server monitoring dashboard |
| `/app/admin` | Server administration: tunnels, public access, and live system logs |
| `/app/admin/appearance` | Instance-wide default branding and theme preferences |
| `/app/admin/encryption` | Message encryption-at-rest settings and key management |
| `/app/admin/mcp` | Model Context Protocol AI connectors and audit logs |
| `/app/admin/members` | Member roster, invite creation, and account deactivation |
| `/app/admin/roles` | Granular role and permission management |
| `/app/admin/defaults` | System-wide new member defaults |
| `/app/admin/plugins` | In-process plugin store and configuration |
| `/multi-admin` | Multi-node cluster administration |
| `/legal/:document?` | Privacy policy, terms of service, and release notes |

---

### Realtime Socket.IO Events

#### Client → Server
| Event | Payload / Description |
|---|---|
| `message:send` | Send text or attachment message to chat |
| `message:read` | Acknowledge reading a message up to a timestamp |
| `typing:start` | Notify conversation participants that user is typing |
| `typing:stop` | Cancel active typing indicator |
| `call:start` | Initiate 1:1 or group WebRTC call |
| `call:join` | Join an ongoing voice or video call room |
| `call:accept` | Accept an incoming call invitation |
| `call:decline` | Decline an incoming call invitation |
| `call:cancel` | Cancel an outgoing ringing call |
| `call:leave` | Disconnect from an active call session |
| `call:signal` | Exchange WebRTC SDP offer/answer or ICE candidates (mesh calls) |

#### Server → Client
| Event | Payload / Description |
|---|---|
| `message:new` | Broadcast new message to conversation members |
| `message:delivered` | Confirm message delivery receipt |
| `message:read` | Update read status receipt across devices |
| `message:edit` | Broadcast edited message content |
| `message:delete` | Broadcast deleted message tombstone |
| `message:reaction` | Update emoji reaction counts |
| `typing:update` | Current typing users within a chat |
| `presence:update` | Online / offline status transitions |
| `call:ringing` | Alert recipient device of an incoming call |
| `call:accepted` | Notify caller that call was answered |
| `call:declined` | Notify caller that call was rejected |
| `call:ended` | Call termination notice with duration and reason |
| `call:topology` | Announce call topology switch (P2P mesh vs. LiveKit SFU) |
| `call:participant-updated`| Participant state changes (audio mute, video toggle, screen share) |
| `call:transcription:update`| Real-time speech transcript segment updates |
| `call:error` | Signaling or rate-limit error notice |

---

## Repository & Documentation Index

- [`DESIGN.md`](DESIGN.md) — Comprehensive design system: typography, palettes, layout geometry, component patterns, and UI rules.
- [`docs/architecture.md`](docs/architecture.md) — Deep dive into backend module boundaries, dependency rules, and runtime composition.
- [`docs/demo-guide.md`](docs/demo-guide.md) — Step-by-step walkthrough script and presentation talking points.
- [`docs/plugins-guide.md`](docs/plugins-guide.md) — Developer guide for creating Go backend plugins and React frontend extensions.
- [`docs/mcp/`](docs/mcp/) — Documentation for integrating AI assistants via the Model Context Protocol.
- [`backend/migrations/BASELINE.md`](backend/migrations/BASELINE.md) — Database schema baseline and Atlas migration guide.
