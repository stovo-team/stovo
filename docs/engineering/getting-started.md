---
title: "Developer getting started"
type: engineering
---

# Developer getting started

Stovo has a Go backend and a React/TypeScript frontend. The backend is built as one application; the [subsystem map](../architecture/subsystems.md) identifies the major code areas. The repository's build images use Go 1.25.5 and Node.js 22.

## Explore the UI without a backend

From the repository root:

```sh
cd frontend
npm ci
npm run dev:mock
```

Open <http://127.0.0.1:5174/app/chats>. This is the real frontend using synthetic data; it is not a production instance. The [contributor guide](../../CONTRIBUTING.md#fast-frontend-preview-with-synthetic-data) explains mock users, simulated calls, uploaded files and reset behavior.

## Build the components

From the repository root:

```sh
cd backend
go build -o stovo-server ./cmd/server

cd ../frontend
npm ci
npm run build
```

These commands build components, but do not configure their backing services. For a running self-hosted instance, follow the [Compose guide](../self-hosting/docker-compose.md); its production stack builds the app images from the checked-out source. The [Kubernetes guide](../self-hosting/kubernetes.md) explains the external dependencies required by the chart.

## Verify and contribute

Use [CONTRIBUTING.md](../../CONTRIBUTING.md#development-checks) for backend, frontend, integration and deployment checks, and [e2e/README.md](../../e2e/README.md) for the mock visual suite. Some backend integration checks require disposable PostgreSQL and Redis services. The [contributor guide](../../CONTRIBUTING.md#propose-a-change) also explains how to propose changes; [SECURITY.md](../../SECURITY.md) describes private vulnerability reporting.
