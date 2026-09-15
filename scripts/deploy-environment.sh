#!/usr/bin/env bash
set -euo pipefail

# Deploy the checked-out GitHub Actions revision to one isolated LXC stack.
# The environment host never needs GitHub credentials: CI sends the checked-out
# source through SSH instead of asking the host to pull a private repository.

ENVIRONMENT="${1:?Usage: deploy-environment.sh <dev|stage>}"
case "$ENVIRONMENT" in
  dev)
    DEPLOY_PATH="${DEV_PATH:-/opt/stovo/dev}"
    COMPOSE_FILE="docker-compose.dev.yml"
    PROJECT_NAME="stovo-dev"
    HEALTH_URL="${DEV_URL:-http://10.29.106.221:9080}"
    ;;
  stage)
    DEPLOY_PATH="${STAGE_PATH:-/opt/stovo/stage}"
    COMPOSE_FILE="docker-compose.stage.yml"
    PROJECT_NAME="stovo-stage"
    HEALTH_URL="${STAGE_URL:-http://10.29.106.221:9081}"
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT (expected dev or stage)" >&2
    exit 2
    ;;
esac

DEPLOY_HOST="${DEPLOY_HOST:-10.29.106.221}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

command -v rsync >/dev/null || { echo "rsync is required on the CI runner" >&2; exit 1; }
command -v ssh >/dev/null || { echo "ssh is required on the CI runner" >&2; exit 1; }

ssh "$SSH_TARGET" "mkdir -p '$DEPLOY_PATH'"

# Keep a manually provisioned .env on the environment host.  It may contain
# local-only secrets and must not be replaced by a CI checkout.
rsync -az --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'node_modules/' \
  --exclude 'playwright-report/' \
  ./ "$SSH_TARGET:$DEPLOY_PATH/"

ssh "$SSH_TARGET" \
  "cd '$DEPLOY_PATH' && \
    docker compose -p '$PROJECT_NAME' -f '$COMPOSE_FILE' up -d postgres && \
    for attempt in \$(seq 1 30); do \
      if docker compose -p '$PROJECT_NAME' -f '$COMPOSE_FILE' exec -T postgres sh -ec 'pg_isready -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'; then break; fi; \
      if [ \"\$attempt\" -eq 30 ]; then echo 'PostgreSQL did not become ready for migrations.' >&2; exit 1; fi; \
      sleep 2; \
    done && \
    docker compose -p '$PROJECT_NAME' -f '$COMPOSE_FILE' build backend && \
    docker compose -p '$PROJECT_NAME' -f '$COMPOSE_FILE' run --rm --no-deps backend sh -ec 'database_url=\"\$(stovo-database-url)\"; atlas migrate apply --dir file:///app/migrations --url \"\$database_url\"' && \
    docker compose -p '$PROJECT_NAME' -f '$COMPOSE_FILE' up -d --build"

echo "Waiting for $ENVIRONMENT health check at $HEALTH_URL/api/health"
for attempt in $(seq 1 45); do
  if curl --fail --silent --show-error "$HEALTH_URL/api/health" | grep -q '"status":"ok"'; then
    echo "$ENVIRONMENT is healthy."
    exit 0
  fi
  sleep 2
done

echo "$ENVIRONMENT did not become healthy at $HEALTH_URL/api/health" >&2
exit 1
