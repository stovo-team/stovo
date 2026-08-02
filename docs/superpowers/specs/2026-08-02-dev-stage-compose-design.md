# Development and Staging Compose Environments Design

## Goal

Keep the existing Docker Compose configuration as the production deployment path while adding dedicated development and staging configurations.

## Environment Contract

| Environment | Start command | Purpose | Public endpoint |
| --- | --- | --- | --- |
| Production | `docker compose up -d --build` | Production-style deployment | Existing `http://localhost` / configured domain |
| Development | `docker compose -p stovo-dev -f docker-compose.yml -f docker-compose.dev.yml up --build` | Interactive work with immediate frontend and backend updates | `http://localhost:8080` |
| Staging | `docker compose -p stovo-stage -f docker-compose.yml -f docker-compose.stage.yml up -d --build` | Stable black-box target for host/CI automation | `http://localhost:8081` |

The separate Compose project names isolate named volumes and container names. Production data and services are not reused by development or staging.

## Architecture

`docker-compose.yml` remains the production base and is not repurposed as a development default. It continues to build immutable frontend and backend images and serves them through Caddy.

`docker-compose.dev.yml` overrides only runtime behavior needed for interactive work:

- The frontend uses the Vite development server with host binding and HMR enabled.
- The frontend source and dependency cache are mounted so edits appear immediately without rebuilding the image.
- The backend source is mounted and a Go watcher recompiles/restarts the server when Go source or configuration changes.
- A development Caddy configuration routes `/api/*` and Socket.IO to the backend and all other requests to Vite, preserving same-origin browser behavior.
- Development publishes Caddy on host port `8080`; it does not claim production ports `80` or `443`.

`docker-compose.stage.yml` supplies a stable target for tests:

- It retains the production-built frontend and backend images and does not mount application source.
- HMR and file watchers are disabled.
- Stage publishes Caddy on host port `8081`. Web UI, REST API, and Socket.IO are all accessible under that single origin, including `http://localhost:8081/api/health`.
- Playwright, Selenium, and Appium run from the host or CI; no test-runner container is part of the staging stack.

## Components and Responsibilities

| Component | Development | Staging |
| --- | --- | --- |
| Frontend | Vite dev server, HMR, source mount | Built static bundle served by nginx |
| Backend | Go live-reload process, source mount | Immutable compiled binary |
| Caddy | Dev proxy for Vite/API/socket traffic on `8080` | Production-equivalent proxy on `8081` |
| PostgreSQL, Redis, MinIO, ntfy, coturn | Existing services with dev-scoped volumes | Existing services with stage-scoped volumes |
| Test tools | Run externally against dev only when needed | Run externally against the stable stage origin |

## Operational Behavior

- `down` commands use the same `-p` and `-f` arguments as their corresponding start command.
- Rebuilds use `--build`; source edits in development do not require rebuilding.
- Staging is the supported target for browser and mobile E2E runs because its URLs, assets, and service processes stay stable during a test run.
- Health checks continue to gate backend startup on its backing services. The stage verification target is `GET /api/health` through Caddy.

## Documentation and Verification

The README will document all three commands, URLs, stop/reset commands, and the intended use of stage for external automation.

Automated configuration checks will verify that:

- Production remains the default Compose configuration.
- Dev runs Vite HMR and a backend file watcher with source mounts.
- Stage exposes the stable Caddy endpoint and does not configure source mounts or HMR.
- The environment-specific ports and Compose project names do not overlap.

## Non-Goals

- Bundling Playwright, Selenium, or Appium into Docker.
- Altering production ports, deployment workflow, or production volumes.
- Creating mobile emulator/device infrastructure; Appium clients connect from the host or CI to the stage environment.
