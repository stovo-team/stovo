# Self-host with Docker Compose

This guide covers the production single-host stack in `docker-compose.yml`. It builds the Go backend and React frontend locally, runs a PostgreSQL database and Redis Streams service, initializes MinIO buckets, and serves the application through Caddy. A domain with DNS pointing to the host is required for automatic HTTPS. Do not use the development or staging Compose files as production deployment instructions.

## Requirements and network

- Linux host with Docker Engine and Docker Compose plugin **2.24.4 or newer**. The external overlay uses Compose's `!reset` tag, which requires this version. The Compose `coturn` service uses host networking, which is important for correct TURN relay behavior.
- Public DNS A/AAAA records for `APP_DOMAIN`, with TCP 80 and 443 open to the host. Caddy obtains and renews the TLS certificate.
- For WebRTC calls, expose TCP and UDP 3478 and UDP 49160–49200 for Coturn. Set `PUBLIC_IP` to the host's public IPv4 address and `TURN_HOST` to the address clients can resolve and reach.
- LiveKit publishes TCP 7880 and 7881, UDP 7882, and UDP 50000–50100. Configure its public client URL to a reachable `wss://` endpoint when using a TLS-terminating proxy, or to another endpoint where TLS is configured. Compose port 7880 is not itself configured with TLS. The Compose default `ws://livekit:7880` is internal service discovery, not a browser-reachable public URL.
- Reserve disk for the PostgreSQL and Redis Streams volumes, MinIO objects, Caddy certificates, and logs. Set upload limits deliberately.

The web entry point is Caddy on host ports 80 and 443. Backend port 8000, frontend port 8080, Redis 6379, PostgreSQL 5432, MinIO 9000, and ntfy 80 are internal Compose service ports and are not published to the host by the production file. LiveKit and Coturn are published separately as described above.

## Configure and start

From the repository root:

```sh
cp .env.example .env
```

Edit `.env` and set at least:

| Setting | Guidance |
| --- | --- |
| `APP_DOMAIN` | Public hostname without scheme or trailing slash. |
| `APP_URL`, `API_URL`, `FRONTEND_ORIGIN`, `PUBLIC_TUNNEL_ORIGIN` | Public origin with `https://` and the same host for a single-domain deployment. |
| `PUBLIC_IP`, `TURN_HOST`, `TURN_REALM` | Public TURN address and matching realm. `PUBLIC_IP` is the host IPv4 used for relay candidates. |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `INVITE_TOKEN_SECRET` | Replace examples with unique, strong values. |
| `MESSAGE_ENCRYPTION_KEY` | A base64 encoding of exactly 32 random bytes. Generate with `openssl rand -base64 32`. Preserve this key: changing it can make encrypted message data unreadable. |
| `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `TURN_PASSWORD`, `LIVEKIT_API_SECRET` | Set unique strong credentials; keep the LiveKit key map and backend credentials aligned. |
| `GROQ_API_KEY` | Optional; needed for the configured Groq-based transcription features. |

The full set of supported Compose variables and example values is in `.env.example`. Keep `.env` out of source control and limit access to it. The template's values are examples, not production secrets.

Validate interpolation before startup and launch:

```sh
docker compose --profile disabled --env-file .env config --quiet
docker compose --profile disabled --env-file .env up -d --build
docker compose ps
docker compose logs --tail=100 backend-migrate backend-blue caddy
```

Visit `https://<APP_DOMAIN>` and finish the one-time owner setup. Registration after first setup is invite-based. `backend-migrate` applies versioned Atlas migrations. In the bundled production Compose file, the backend is configured to wait for that one-shot service and required dependencies.

### Redis services

Production Compose starts `redis-jobs` for durable worker streams with append-only persistence and a `noeviction` policy. The separate `redis` cache/presence service is assigned to Compose's `disabled` profile and is omitted by plain `docker compose up`. The backend's `REDIS_URL` falls back to the `redis` service name unless configured otherwise, so either enable the bundled cache service as shown above or configure `REDIS_URL` to a reachable external Redis instance. The `/api/health/redis` endpoint checks this cache/presence connection. Do not confuse `redis` with `redis-jobs`, and do not point the durable jobs URL at an eviction-prone cache.

### Optional external PostgreSQL and S3 storage

`docker-compose.external.yml` disables the bundled PostgreSQL and MinIO services while keeping Redis, Redis Streams, ntfy, the application, and Caddy local. Set `DATABASE_URL` to the external PostgreSQL URL, including the provider's required TLS mode. The startup command below enables the `disabled` profile, which activates bundled cache/presence Redis even though it is disabled in a plain Compose invocation. To use external cache Redis instead, set `REDIS_URL` to its reachable URL; the local Redis container will still start with this profile but will not be used by the backend. Set `STORAGE_PROVIDER=s3`, `S3_ENDPOINT`, `S3_SECURE`, S3 credentials in `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`, and the target bucket names. The buckets must already exist and credentials must allow the required object operations. For generated presigned upload/download URLs, `MINIO_PUBLIC_ENDPOINT` must be reachable by clients; it is distinct from the private backend endpoint.

Validate and start the overlay with:

```sh
docker compose --profile disabled --env-file .env -f docker-compose.yml -f docker-compose.external.yml config --quiet
docker compose --profile disabled --env-file .env -f docker-compose.yml -f docker-compose.external.yml up -d --build
```

The external overlay removes the bundled database and MinIO; `redis-jobs` remains bundled. When the `disabled` profile is active, the cache Redis service is also started. External database and cache Redis endpoints must be reachable from the Compose network. Back them up using the provider procedures.

**Known limitation:** the current external overlay resets the backend's Compose `depends_on` list, and the installed Compose CLI drops the replacement dependency map during config resolution. In this mode Compose therefore does not guarantee that migrations, Redis Streams, or ntfy are ready before the backend starts. Check service health and migration logs, and restart the backend if it started before its dependencies. Do not rely on the bundled-mode startup ordering described above for this overlay.

### Calls and public access

Calls depend on reachable client-facing LiveKit and/or TURN endpoints. The port ranges above must be open through both the host firewall and any cloud firewall. Set `LIVEKIT_URL` to the public `ws://` or `wss://` endpoint clients should dial; the default value is an internal Docker hostname. Use `wss://` when a TLS endpoint or TLS-terminating proxy is configured; port 7880 in Compose is not itself configured with TLS. `deploy/livekit.yaml` contains development credentials and is a local reference only; production Compose renders LiveKit's config from `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

Do not expose the MinIO API, PostgreSQL, Redis, ntfy, or backend ports directly to the internet. Use the Caddy front door or a deliberately configured trusted proxy. If deploying behind another proxy, set the trusted proxy CIDRs in the Compose environment and verify forwarded client IP handling.

## Persistent data and backups

Production Compose stores data in named volumes:

| Data | Compose volume |
| --- | --- |
| PostgreSQL | `postgres-data` |
| Durable worker streams | `redis-jobs-data` |
| MinIO objects (uploads, logs, call media) | `minio-data` |
| Caddy certificate/state and config | `caddy-data`, `caddy-config` |
| ntfy state/cache | `ntfy-auth`, `ntfy-cache` |

The backend also bind-mounts `./uploads` and `./logs` for legacy local files and application logs. Include them in the backup if you use local file storage or need those logs. The default object storage is MinIO, so object data resides in `minio-data`; database metadata alone does not back up the underlying objects.

Take a consistent database dump and object/volume backup before upgrades. Example logical PostgreSQL backup:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > stovo-postgres.dump
```

Store the dump outside the host and test restoring it to a disposable database. Back up MinIO using an S3 client or a quiesced volume-level snapshot; include all configured buckets, especially the files and calls buckets. Also preserve the encryption key, secrets, and deployment configuration in a secure secrets backup separate from the data backup.

For a restore, stop writes by stopping the application first, restore PostgreSQL and objects, then start the stack and verify health and representative file/message reads. Do not restore a database without its matching object data or encryption key. Follow provider-specific restore procedures for managed services.

## Upgrades and schema migrations

1. Read release notes and check whether a release calls out a manual migration or incompatibility.
2. Make and verify database and object-store backups. Preserve `MESSAGE_ENCRYPTION_KEY` and auth secrets.
3. Pull the intended code/tag or checkout and rebuild images with Compose:

   ```sh
   docker compose --env-file .env pull
   docker compose --env-file .env build
   docker compose --env-file .env up -d
   docker compose ps
   docker compose logs --tail=200 backend-migrate backend-blue
   ```

   The Compose services for backend and frontend use local build contexts, so `pull` refreshes pinned infrastructure images; rebuild application images from the checked-out revision. If your deployment process uses an explicit image tag or CI-built images, use that process instead.
4. Confirm `/api/health`, `/api/health/db`, and `/api/health/redis` respond through the public origin; then validate sign-in, realtime messaging, and file access.

`backend-migrate` runs Atlas versioned migrations before the backend starts. Do not edit migration history or manually baseline a live database unless following the [Atlas baseline procedure](../../backend/migrations/BASELINE.md) and verifying schema parity first. Schema baselining is a cutover operation for a database already matching the baseline, not a routine upgrade step.

The Compose file includes an opt-in `backend-green` service with the `bluegreen` profile for the project's blue/green deployment flow. Ordinary `up` starts only `backend-blue`; use the deployment's documented cutover procedure rather than casually starting both services or changing `ACTIVE_BACKEND` by hand.

## Health checks and troubleshooting

The HTTP health endpoints are:

- `/api/health` — backend process/application health.
- `/api/health/db` — database connectivity.
- `/api/health/redis` — Redis connectivity.

Production Compose defines health checks for PostgreSQL, `redis-jobs`, ntfy, MinIO, and Caddy. It does **not** define Compose health checks for the backend or frontend. Use the HTTP endpoints to inspect backend dependencies; `docker compose ps` alone does not prove those app processes are healthy.

Useful diagnostics:

```sh
docker compose ps
docker compose logs --tail=200 backend-migrate backend-blue frontend caddy postgres redis-jobs minio
curl -fsS "https://${APP_DOMAIN}/api/health"
curl -fsS "https://${APP_DOMAIN}/api/health/db"
curl -fsS "https://${APP_DOMAIN}/api/health/redis"
```

| Symptom | Checks |
| --- | --- |
| Compose exits during config | Confirm required values in `.env`; run `docker compose --env-file .env config --quiet` to validate without printing interpolated secrets. |
| TLS certificate unavailable | Verify DNS points to the host, inbound TCP 80/443 are open, and Caddy can write its named state volumes. |
| Backend does not start | Inspect `backend-migrate` and `backend-blue` logs; confirm PostgreSQL, `redis-jobs`, ntfy and MinIO initialization completed. |
| DB health fails | Check the database URL/credentials, managed database network access and TLS mode, or the bundled `postgres` health check. |
| Redis health fails or jobs stall | Check `redis-jobs` logs, password consistency, volume capacity, and that `REDIS_JOBS_URL` points at the durable stream service. |
| Uploads fail | Check storage credentials, endpoint, bucket names, object-store reachability and any public endpoint used for presigned URLs. For MinIO inspect `minio` and `minio-init`. |
| Calls connect only on some networks | Check the public LiveKit URL plus TCP/UDP firewall rules and Coturn public IP/relay range. NAT and UDP filtering may require TURN. |
| Existing files disappear after storage change | Verify that object data was migrated and checksummed before switching the configured provider; DB metadata and object bytes are separate. |

## Migrating legacy local uploads to object storage

For an installation that still has local files in `./uploads`, take a backup and stop writes first. Configure and initialize the target MinIO/S3 endpoint and buckets, verify the backend can access both source files and target, then run the bundled migration executable against the same Compose environment:

```sh
docker compose --profile disabled --env-file .env run --rm backend-blue /usr/local/bin/storage-migrate
```

The tool checks existing checksums where present, copies each file object, updates its storage provider metadata, and writes a migration manifest to the logs bucket. Review the command's exit status and manifest for failures before removing or unmounting the original `uploads` directory. This operation is for local-to-MinIO/S3 migration; do not use it as a general database migration command.
