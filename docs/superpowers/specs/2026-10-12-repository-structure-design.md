---
title: "Repository Structure Design"
type: design
---

# Repository Structure Design

## Goal

Reduce unexplained repository-root clutter by grouping deployment configuration and deployment tooling under `deploy/`, keeping end-to-end fixtures with `e2e/`, and placing frontend style checks beside frontend source. Preserve runtime behavior and existing service data paths.

## Current Structure and Rationale

The repository already has clear application package boundaries. `backend/` is a Go module with conventional `cmd/`, `internal/`, `ent/`, `migrations/`, and `testdata/` directories. Its Atlas migrations belong with the backend image and remain at `backend/migrations/`.

The root `migrations/master/` directory is a separate set of SQL scripts used by the multi-server deployment workflow to initialize the orchestrator's master database. It is deployment-specific and is distinct from the backend's Atlas migration history.

`charts/` is the Helm deployment chart, `ntfy/server.yml` configures the Compose notification service, and five root scripts support deployment. The remaining root scripts check frontend/backend architecture boundaries and update their baselines.

`frontend/` is an npm/Vite package. Its package manifest, Vite and TypeScript configuration, Dockerfile, nginx configuration, Capacitor configuration, and the two HTML entrypoints belong at the package root. The three root-level CSS contract tests fit beside the existing style tests under `frontend/src/`.

`testdata/chat-transfer/v1/single-chat.json` is a canonical fixture described by the chat import/export plan and belongs under the end-to-end package as requested. The top-level `e2e/` directory remains in place.

Compose mounts the root `./uploads` path for legacy local file storage, and the self-hosting guide documents that data path. Keep `uploads/.gitkeep` and the mount unchanged to avoid changing existing storage and backup locations.

## Target Layout

```text
backend/
  cmd/
  ent/
  internal/
  migrations/                 # Atlas migrations for backend databases
  testdata/

deploy/
  charts/stovo/               # Helm chart
  compose/
  caddy/
  migrations/master/          # orchestrator master database SQL
  ntfy/server.yml             # Compose ntfy configuration
  scripts/                    # deployment and Docker Buildx helpers

e2e/
  fixtures/chat-transfer/v1/single-chat.json
  tests/

frontend/
  src/
    styles.emoji-picker.test.ts
    styles.scrollbar.test.ts
    styles.voice-channel.test.ts
  call-ui-preview.html        # separate Vite entrypoint, unchanged
  ...                         # package and build configuration

scripts/                      # architecture checks and baseline tooling
uploads/                       # legacy local storage mount placeholder
```

## Changes in Scope

1. Move `charts/stovo/` to `deploy/charts/stovo/`.
2. Move root `migrations/master/` to `deploy/migrations/master/`. Leave `backend/migrations/` unchanged.
3. Move `ntfy/server.yml` to `deploy/ntfy/server.yml` and update Compose mounts and ignore rules for its local state directories.
4. Move `deploy-environment.sh`, `deploy-environment.test.ps1`, `deploy-stage.sh`, `ensure-docker-buildx.sh`, and `ensure-docker-buildx.test.sh` from root `scripts/` to `deploy/scripts/`. Keep SOLID boundary checks and baseline tooling in root `scripts/`.
5. Move `testdata/chat-transfer/v1/single-chat.json` to `e2e/fixtures/chat-transfer/v1/single-chat.json` and update the chat import/export plan's fixture path.
6. Move the three root-level frontend style contract tests into `frontend/src/` alongside existing style tests.
7. Update all maintained documentation, workflow path filters, workflow commands, static workflow checks, Helm validation paths, and `.gitignore` exceptions to match the new paths.

## Constraints and Non-Goals

- Do not change application behavior, deployment service definitions, migration contents, chart contents, or fixture contents.
- Keep `e2e/` at repository root.
- Keep `backend/` package structure and `backend/migrations/` unchanged.
- Keep the frontend package/build configuration and standalone call UI preview entrypoint at the frontend root.
- Keep the root `uploads/` mount path and placeholder unchanged.
- Do not move general architecture-check scripts into `deploy/`.
- Do not publish, push, merge, or open a pull request as part of this work.

## Acceptance Criteria

- The target paths above exist and their old tracked paths no longer exist.
- No maintained workflow, test, command, or operator guide refers to the old chart, master migration, ntfy configuration, or moved deployment-script paths.
- CI still runs when any moved deployment path changes.
- The production Compose configuration and external overlay still resolve successfully.
- Helm linting/rendering and documentation/deployment validation still succeed at the new chart path.
- Frontend tests, lint, and build succeed after the style test moves.
- The fixture contents, SQL histories, generated app assets, and `uploads/` data path remain unchanged.
