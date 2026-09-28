# Stovo

Stovo is a self-hosted communication and collaboration app for families and other trusted groups. It brings messaging, voice and video calls, private file sharing, shared plans, checklists, collaborative canvas, notifications, and administration into one private instance.

## Get started

The quickest supported deployment path is Docker Compose on a Linux host. You need Docker Engine with the Compose plugin, a domain pointed at the host, and TCP ports 80 and 443 reachable. For calls through TURN, UDP 3478 and UDP 49160–49200 must also be reachable. See the [Compose self-hosting guide](docs/self-hosting/docker-compose.md) before exposing an instance to the internet.

```sh
cp .env.example .env
```

Edit `.env` before starting: set the public domain and matching application URLs, replace every example credential, generate `MESSAGE_ENCRYPTION_KEY` as 32 random bytes encoded in base64 (`openssl rand -base64 32`), and set the public IP and TURN hostname for a public server. Keep `.env` private.

```sh
docker compose --profile disabled --env-file .env config --quiet
docker compose --profile disabled --env-file .env up -d --build
docker compose ps
```

Open `https://<APP_DOMAIN>` and complete the one-time initial owner setup. Compose runs the `backend-migrate` one-shot service before the `backend-blue` application service. The production topology uses `redis-jobs` for durable worker streams. The separate `redis` cache/presence service is in Compose's `disabled` profile, so the command above explicitly enables it; for an external cache Redis, configure `REDIS_URL` instead. Caddy publishes ports 80 and 443. The backend and frontend are internal services and do not publish host ports.

## Deployment guides

- [Documentation index](docs/README.md) — guides, subsystem map, and project references.
- [Docker Compose self-hosting](docs/self-hosting/docker-compose.md) — configuration, external PostgreSQL/S3, operations, upgrades, backup and restore, and troubleshooting.
- [Kubernetes and Helm](docs/self-hosting/kubernetes.md) — chart installation, secrets, storage, ingress, media networking, upgrades, and chart validation.
- [Backend and frontend subsystem map](docs/architecture/subsystems.md) — what each major package and frontend feature owns.
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) · [Issue templates](.github/ISSUE_TEMPLATE/)

## Architecture at a glance

The backend is a Go modular monolith with HTTP and Socket.IO transports, PostgreSQL persistence, Redis for cache/presence and a separate Redis Streams worker outbox, and S3-compatible object storage. The web client is a React and TypeScript single-page app served behind Caddy. LiveKit provides SFU media for group calls; Coturn provides STUN/TURN relay. Optional AI transcription uses the configured Groq API.

See the [subsystem map](docs/architecture/subsystems.md) for package ownership and [self-hosting documentation](docs/README.md) for supported deployment and operating procedures.

## Development

- Backend: Go `1.25.5`; see [backend/Makefile](backend/Makefile) for available development and test targets.
- Frontend: Node.js `22` as pinned by [frontend/Dockerfile](frontend/Dockerfile); run `npm ci` and `npm run` from `frontend/` to see package scripts.
- Local development stack: `docker compose -f docker-compose.dev.yml up -d --build`.

See [Contributing](CONTRIBUTING.md) for the contribution workflow. This repository does not yet state a software license; do not assume reuse or redistribution rights from the presence of source code.
