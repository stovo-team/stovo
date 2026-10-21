#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Copy every bucket in the production MinIO service to same-named Cloud.ru S3 buckets.

Usage:
  deploy/scripts/copy-minio-to-cloud-s3.sh [--dry-run | --apply]

By default the script performs a dry run. Pass --apply to copy objects. It never
deletes objects from either service. Create all same-named target buckets in
Cloud.ru before running it.

Required environment variables:
  MINIO_ROOT_USER        MinIO root/access user
  MINIO_ROOT_PASSWORD    MinIO root/secret password
  MINIO_ACCESS_KEY       Cloud.ru S3 access key
  MINIO_SECRET_KEY       Cloud.ru S3 secret key

Optional environment variables:
  MINIO_SOURCE_CONTAINER MinIO container name (default: stovo-master-minio)
  MINIO_SOURCE_ENDPOINT  MinIO endpoint inside its container network namespace
                         (default: http://127.0.0.1:9000)
  MINIO_MC_IMAGE         MinIO Client image (default: pinned release below)
  S3_ENDPOINT            Cloud.ru S3 endpoint (default: s3.cloud.ru)
  S3_SECURE              Use HTTPS when S3_ENDPOINT has no scheme (default: true)

Example (from the repo root, after setting Cloud.ru credentials in the shell):
  set -a; . ./.env; set +a
  export MINIO_ACCESS_KEY='<Cloud.ru tenant_id:key_id>'
  export MINIO_SECRET_KEY='<Cloud.ru secret key>'
  deploy/scripts/copy-minio-to-cloud-s3.sh        # review planned actions
  deploy/scripts/copy-minio-to-cloud-s3.sh --apply

For a consistent final copy, stop application writes before the --apply run.
This transfers current objects only; it does not copy historical object versions,
bucket policies, lifecycle rules, or other bucket configuration. Keep MinIO and
its volume intact until the Cloud.ru copy is verified and the app is switched.
EOF
}

MODE=dry-run
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry-run ;;
  --apply) MODE=apply ;;
  --help|-h) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac
if [[ "$#" -gt 1 ]]; then
  usage >&2
  exit 2
fi

required_vars=(MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_ACCESS_KEY MINIO_SECRET_KEY)
for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    printf 'Required environment variable is not set: %s\n' "$var_name" >&2
    exit 2
  fi
done

command -v docker >/dev/null 2>&1 || { echo 'docker is required' >&2; exit 2; }
command -v python3 >/dev/null 2>&1 || { echo 'python3 is required' >&2; exit 2; }

SOURCE_CONTAINER="${MINIO_SOURCE_CONTAINER:-stovo-master-minio}"
SOURCE_ENDPOINT="${MINIO_SOURCE_ENDPOINT:-http://127.0.0.1:9000}"
MC_IMAGE="${MINIO_MC_IMAGE:-minio/mc:RELEASE.2025-04-16T18-13-26Z}"
S3_ENDPOINT="${S3_ENDPOINT:-s3.cloud.ru}"
S3_SECURE="${S3_SECURE:-true}"

case "$S3_ENDPOINT" in
  http://*|https://*) TARGET_ENDPOINT="$S3_ENDPOINT" ;;
  *)
    if [[ "$S3_SECURE" == "true" ]]; then
      TARGET_ENDPOINT="https://${S3_ENDPOINT}"
    else
      TARGET_ENDPOINT="http://${S3_ENDPOINT}"
    fi
    ;;
esac
TARGET_ENDPOINT="${TARGET_ENDPOINT%/}"

MC_CONFIG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/stovo-minio-copy.XXXXXX")"
chmod 700 "$MC_CONFIG_DIR"
cleanup() { rm -rf "$MC_CONFIG_DIR"; }
trap cleanup EXIT

mc() {
  docker run --rm \
    --network "container:${SOURCE_CONTAINER}" \
    --volume "${MC_CONFIG_DIR}:/root/.mc" \
    "$MC_IMAGE" "$@"
}

echo "Connecting to source MinIO in container '${SOURCE_CONTAINER}'..."
mc alias set --api S3v4 minio "$SOURCE_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc alias set --api S3v4 --path on cloud "$TARGET_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null

bucket_listing="$(mc ls --json minio/)"
bucket_names="$(printf '%s\n' "$bucket_listing" | python3 -c '
import json
import sys

for line in sys.stdin:
    if not line.strip():
        continue
    item = json.loads(line)
    key = item.get("key", "")
    if item.get("type") == "folder" and key:
        print(key.rstrip("/"))
')"

if [[ -z "$bucket_names" ]]; then
  echo 'No MinIO buckets found; refusing to continue.' >&2
  exit 1
fi
mapfile -t buckets <<< "$bucket_names"

printf 'Found %s source bucket(s).\n' "${#buckets[@]}"
for bucket in "${buckets[@]}"; do
  if ! mc ls "cloud/${bucket}/" >/dev/null; then
    printf 'Target bucket is missing or not accessible: %s\n' "$bucket" >&2
    printf 'Create the same-named bucket in Cloud.ru and grant list/read/write access, then retry.\n' >&2
    exit 1
  fi
done

if [[ "$MODE" == "dry-run" ]]; then
  echo 'Dry run only. Review the output; pass --apply to copy objects.'
fi

for bucket in "${buckets[@]}"; do
  printf '\n%s bucket: %s\n' "$MODE" "$bucket"
  if [[ "$MODE" == "dry-run" ]]; then
    mc mirror --dry-run --overwrite --md5 --summary "minio/${bucket}/" "cloud/${bucket}/"
  else
    mc mirror --overwrite --md5 --summary "minio/${bucket}/" "cloud/${bucket}/"
  fi
done

echo 'Copy run completed. MinIO source buckets and volume were left unchanged.'
