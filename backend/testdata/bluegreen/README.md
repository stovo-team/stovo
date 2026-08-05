# Blue/green cutover acceptance

Short checklist for validating REST, Socket.IO, and live call-state across an
`ACTIVE_BACKEND` switch (`backend-blue` ↔ `backend-green`).

## Preconditions

- Stack is up with postgres, redis, minio, caddy, frontend, and at least the
  active backend color. Local compose only starts `backend-blue`; start the
  inactive color with `docker compose --profile bluegreen up -d --no-deps <inactive>`.
- `.env` has `ACTIVE_BACKEND=backend-blue` (or green).
- Caddyfile uses `reverse_proxy {$ACTIVE_BACKEND:backend-blue}:8000` for `/api/*`
  and `/socket.io*`.

## Cutover (same shape as deploy)

1. Note active color from `.env` (`ACTIVE_BACKEND`). Inactive is the other color.
2. `docker compose up -d --build --no-deps <inactive>`
3. Health-check inactive only (do not flip yet):
   `docker compose exec caddy wget -qO- http://<inactive>:8000/api/health`
4. Set `ACTIVE_BACKEND=<inactive>` in `.env`, then
   `docker compose up -d --no-deps --force-recreate caddy`
5. Wait ~15s, then `docker compose stop <old-active>`
6. Confirm postgres/redis/minio stayed up the whole time (no full `compose down`).

## Acceptance checks

### REST

- `GET /api/health` through the public hostname returns 200 before and after flip.
- Authenticated `GET /api/chats` (or any stable read) succeeds on the new color
  with the same session cookie/JWT issued before cutover.

### Socket.IO

- Open a client Socket.IO connection before flip; after flip the client should
  reconnect (transport close is expected when the old color drains).
- After reconnect, emit a lightweight event (e.g. presence/heartbeat) and confirm
  the server acknowledges without auth errors.

### Call-state (Redis authority)

Live call sessions are write-through to Redis (`call:session:*`). After cutover
the new backend has an empty in-memory map and must hydrate via
`resolveCallSession` → `loadCallSessionFromRedis`.

1. Start a 1:1 call on the active color; leave it ringing or connected.
2. Perform cutover (steps above) without ending the call.
3. On the new color, accept/signal/leave using the same `chatId`/`roomId`.
4. Confirm the session is found (no `session_gone` / “Call not available”) and
   participant actions complete.
5. End the call; confirm Redis keys for that room/chat are removed and a second
   resolve does not resurrect the session.

### Failure path

- If inactive `/api/health` fails, do **not** change `ACTIVE_BACKEND`.
- Active color and shared deps remain serving traffic.
