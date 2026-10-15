---
title: "Self-host on Kubernetes with Helm"
type: operations
---

# Self-host on Kubernetes with Helm

Stovo's Helm chart lives in `deploy/charts/stovo`. It creates the backend and frontend workloads, their ClusterIP Services, an optional HTTP Ingress, the Atlas migration Job, and an optional uploads PVC. It does not install PostgreSQL, Redis, S3/MinIO, ntfy, LiveKit, or Coturn; configure these dependencies separately. Read the chart's values and templates as the authoritative contract for values, probes, storage classes, and ingress fields:

```sh
helm show values deploy/charts/stovo
```

The chart expects external PostgreSQL, Redis-compatible cache/presence and Redis Streams services, and ntfy/LiveKit/TURN integrations when enabled. Its default `STORAGE_PROVIDER` is `local`: uploaded files are stored on the chart's uploads PVC. Supply chart runtime credentials through a Kubernetes Secret; do not commit secret values in a values file or pass them in a recorded shell history.

## Prerequisites

- A Kubernetes cluster with an available StorageClass for persistent claims and an ingress controller or another supported way to expose HTTP(S).
- Reachable PostgreSQL, Redis-compatible cache/presence and Redis Streams services. The chart expects them as external services.
- If using S3 instead of the default local uploads storage: an S3-compatible endpoint, credentials, and buckets for file, log, and call objects. The chart does not deploy object storage.
- A DNS name and TLS certificate/issuer. The public URLs used by backend and clients must match the ingress and call-media endpoints.

The chart does not deploy media or notification services. Operate LiveKit, Coturn and ntfy separately when these features are required. Configure their public URLs, credentials, firewall rules, and TURN relay range. `deploy/livekit.yaml` uses development credentials and is only a local reference.

## Inspect and validate the chart

Run these commands from the repository root:

```sh
helm lint deploy/charts/stovo --values my-values.yaml
helm template stovo deploy/charts/stovo --values my-values.yaml
helm template stovo deploy/charts/stovo --namespace stovo --values my-values.yaml
```

Before installing, review the rendered manifests for the target namespace and cluster, especially Secret references, PVC sizes/storage classes, ingress host/TLS, service ports, probes and resource requests/limits. `helm template` renders locally; it does not validate cluster-specific admission policies or availability of storage classes.

## Configure secrets

Create the Secret named by `existingSecret` (default `stovo-secrets`). The backend and migration Job read credential fields from this pre-existing Secret, using the exact key names listed in `deploy/charts/stovo/values.yaml` and templates. Required database, Redis, and auth keys are individual Secret references, so missing required keys prevent the pod/job from starting. The backend requires `DATABASE_URL`, `REDIS_URL`, `REDIS_JOBS_URL`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `INVITE_TOKEN_SECRET`, and `MESSAGE_ENCRYPTION_KEY`; the encryption key must be a base64 encoding of exactly 32 random bytes. `DATABASE_URL` should include the provider's required TLS mode; keep URLs containing embedded credentials in the Secret.

For the default local storage provider, S3 credentials are not needed. If switching to S3, set `STORAGE_PROVIDER`, `MINIO_ENDPOINT`, `MINIO_SECURE`, and bucket names in `backend.env`; put `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` in the Secret. If `TURN_ENABLED` is true, also provide `TURN_USERNAME` and `TURN_PASSWORD`. Set `app.livekitUrl` when a public LiveKit endpoint is configured; the chart then requires `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in the Secret. For other integration credentials such as `GROQ_API_KEY` or `NTFY_PUBLISH_TOKEN`, add their names to `secrets.additionalKeys`. Keep connection URLs and credentials in Secret keys rather than a checked-in values file.

```sh
kubectl create namespace stovo
kubectl -n stovo create secret generic stovo-runtime --from-literal=DATABASE_URL='REPLACE_WITH_DATABASE_URL' --from-literal=REDIS_URL='REPLACE_WITH_CACHE_REDIS_URL' --from-literal=REDIS_JOBS_URL='REPLACE_WITH_JOBS_REDIS_URL' --from-literal=JWT_SECRET='REPLACE_WITH_RANDOM_VALUE' --from-literal=REFRESH_TOKEN_SECRET='REPLACE_WITH_RANDOM_VALUE' --from-literal=INVITE_TOKEN_SECRET='REPLACE_WITH_RANDOM_VALUE' --from-literal=MESSAGE_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

Replace the Secret name in the example with the value set for `existingSecret` (or retain `stovo-runtime` and set that value accordingly). Add storage credentials, and TURN/LiveKit integration credentials when enabled. TURN defaults off in the chart; configure `app.turnEnabled` as needed and supply its credentials only when enabling it. Treat the message encryption key as durable data: preserve it securely and restore the same key with backups. Encrypt Kubernetes Secret objects at rest in the cluster and restrict RBAC access; a Kubernetes Secret is not encrypted merely because it is base64 encoded.

Avoid putting secrets in `--set`, a checked-in values file, CI logs, terminal transcripts, or generated rendered manifests. The chart should consume a pre-existing Secret, and a normal render should contain references rather than credential values.

## Install and operate

The chart requires backend and frontend image repositories and immutable tags; this repository does not currently publish release images. Build and push the images to a registry you control, or use images supplied by your release process. For example, from the repository root:

```sh
docker build -t registry.example.com/stovo/backend:v1.2.3 -f backend/Dockerfile backend
docker build -t registry.example.com/stovo/frontend:v1.2.3 -f frontend/Dockerfile frontend
docker push registry.example.com/stovo/backend:v1.2.3
docker push registry.example.com/stovo/frontend:v1.2.3
```

Replace the example registry and version with your registry and an immutable release tag. Prepare `my-values.yaml` with those image fields, the public hostname, ingress TLS, optional media endpoints, and other settings supported by the chart. For example:

```yaml
backend:
  image:
    repository: registry.example.com/stovo/backend
    tag: "REPLACE_WITH_IMMUTABLE_TAG"
frontend:
  image:
    repository: registry.example.com/stovo/frontend
    tag: "REPLACE_WITH_IMMUTABLE_TAG"
existingSecret: stovo-runtime
app:
  domain: stovo.example.com
  url: https://stovo.example.com
  frontendOrigin: https://stovo.example.com
  corsAllowedOrigins: https://stovo.example.com
  livekitUrl: ""
  turnEnabled: false
ingress:
  enabled: true
  className: nginx
  tls:
    - hosts:
        - stovo.example.com
      secretName: stovo-tls
```

Replace the example registry, immutable tags, host, and ingress class with values for your cluster. Add `imagePullSecrets` if the registry is private. The example leaves calls disabled; set the media URLs and credentials separately if you operate LiveKit and TURN.

```sh
helm upgrade --install stovo deploy/charts/stovo --namespace stovo --create-namespace --values my-values.yaml
kubectl -n stovo get deploy,svc,pvc,pods
```

With the default release name, inspect workloads and migration logs with:

```sh
kubectl -n stovo rollout status deployment/stovo-stovo-backend
kubectl -n stovo logs deployment/stovo-stovo-backend --tail=200
```

Replace names if `nameOverride`, `fullnameOverride`, or the release name changes. Validate the public application and the backend's `/api/health`, `/api/health/db`, and `/api/health/redis` endpoints. Confirm that ingress routes WebSocket traffic, request bodies are sized for the configured upload limit, and any direct/presigned object URLs are reachable from clients. Ingress sends `/api` and `/socket.io` to the backend service and all other paths to the frontend service; TLS termination comes from the cluster's ingress setup, configured with the chart's TLS fields.

The migration Job is a Helm pre-install/pre-upgrade hook when `migrations.enabled` is true. Helm deletes successful hook Jobs, so migration logs may only be available while a job is failing. The backend readiness probe checks `/api/health/db` and therefore gates on PostgreSQL; liveness checks `/api/health`. Redis health is available at `/api/health/redis` but is not part of the readiness probe, so monitor that dependency separately. The frontend has no readiness or liveness probe in the current chart.

The chart persists `/app/uploads` in a PVC by default (10 GiB, `ReadWriteOnce`); this is where files are stored with the default local provider. Logs use ephemeral storage. Select an appropriate StorageClass and capacity. If you configure S3, uploaded object bytes go to the configured buckets instead; the PVC remains mounted for legacy/local files. Include either the uploads PVC contents or the S3 buckets in backups as applicable. Before increasing backend replicas, ensure uploads storage is safe to mount and use from the resulting pods; `ReadWriteOnce` storage typically constrains multi-node shared access.

### Storage, backup and restore

Back up PostgreSQL and the file data path in use, together with a secure copy of runtime secrets, particularly `MESSAGE_ENCRYPTION_KEY`. The chart's default local provider stores files in the uploads PVC; snapshot or copy that claim using the cluster storage provider's supported procedure. If switched to S3, back up/replicate the configured buckets separately; a PVC snapshot does not include those objects. Logs use ephemeral storage. Test restoration to an isolated namespace or environment before relying on backups.

Before restore or an incompatible upgrade, stop or scale down application writes according to the chart's workload contract, restore the database and object data, restore the matching secrets, then bring workloads back and verify database health, sign-in, and file reads.

### Upgrades and migrations

Review release notes and create verified database/object backups. Inspect changes, lint, and render before upgrading:

```sh
helm lint deploy/charts/stovo --values my-values.yaml
helm template stovo deploy/charts/stovo --namespace stovo --values my-values.yaml
helm upgrade stovo deploy/charts/stovo --namespace stovo --values my-values.yaml
kubectl -n stovo rollout status deployment/stovo-stovo-backend
kubectl -n stovo rollout status deployment/stovo-stovo-frontend
```

Database changes are managed as versioned Atlas migrations in the backend image. Confirm how the current chart orders the migration job and backend rollout by inspecting rendered output; do not independently replay migrations or assume an atomic rollback reverses a database migration. If upgrade fails, collect job and pod logs before deciding whether to roll back the release. Database rollback may require restoring the pre-upgrade backup.

## Resource sizing

No benchmark-derived sizing or capacity guarantee is available. The chart's current unbenchmarked starting requests/limits are backend 250m CPU/512 MiB with limits of 1 CPU/1 GiB, and frontend 50m CPU/64 MiB with limits of 250m CPU/256 MiB. Treat these and the default 10 GiB uploads claim as estimates only. Observe CPU, memory, database connections, Redis memory/stream backlog, local PVC or object growth, and media bandwidth under your own workload. Video calls, transcription, large uploads, and concurrent clients can dominate resource use. Increase capacity based on measured saturation and latency; retain headroom for database migrations and object-store maintenance. Backend and frontend resource settings are separate in chart values. The Compose file does not define total host resource requests or limits; no tested host sizing profile is available for it either, so provision disk and compute based on measured workload.

## Troubleshooting

- Pods pending: inspect PVC events, StorageClass availability, and node resource pressure.
- CrashLoopBackOff: inspect pod logs and events; verify Secret name/key references and connectivity to external services.
- Ingress works for pages but not realtime: check WebSocket forwarding and ingress timeouts.
- Uploads fail after ingress: compare ingress body-size/time limits with the app upload setting; check S3 endpoint reachability, credentials, and bucket permissions.
- Calls fail from outside the cluster: media services are external to this chart. Verify the public LiveKit URL, UDP routing and TURN relay configuration independently from HTTP ingress.
- Helm output exposes credentials: do not apply it; use an external Secret and chart `existingSecret` reference, then render and inspect again.
