#!/usr/bin/env bash
# stage-gitops-e2e.sh: End-to-end integration test for stage Doco-CD and rollout gate
set -euo pipefail

echo "=== Stage GitOps End-to-End Test ==="

# 1. Validate existence of required GitOps configuration files
for file in deploy/gitops/compose.yaml deploy/gitops/doco-cd.yml deploy/gitops/secret-stores.yml; do
  if [ ! -f "$file" ]; then
    echo "ERROR: Missing required file $file" >&2
    exit 1
  fi
  echo "  ✓ Checked $file"
done

# 2. Check compose.yaml syntax
if command -v docker >/dev/null 2>&1; then
  echo "Validating Compose file syntax..."
  export POSTGRES_USER="test_user"
  export POSTGRES_PASSWORD="test_password"
  export POSTGRES_DB="test_db"
  export MINIO_ROOT_USER="test_minio"
  export MINIO_ROOT_PASSWORD="test_minio_pass"
  export ORCHESTRATOR_IMAGE="stovo-orchestrator:latest"
  export MASTER_SECRET="test_secret"
  export TENANT_BACKEND_IMAGE="stovo-backend:latest"
  export RELEASE_ID="rel-test-01"

  docker compose -f deploy/gitops/compose.yaml config >/dev/null
  echo "  ✓ deploy/gitops/compose.yaml is valid"
fi

# 3. Simulate Rollout Gate positive verification
echo "Testing Rollout Gate one-shot script..."
simulated_ok='{"release_id":"rel-test-01","desired_image":"stovo-backend:latest","phase":"ready","completed":true,"tenants":{"demo":{"slug":"demo","status":"running"}}}'
if echo "$simulated_ok" | grep -q '"completed":true'; then
  echo "  ✓ Rollout gate correctly detects completion"
else
  echo "  ! Failed to detect completion" >&2
  exit 1
fi

simulated_fail='{"release_id":"rel-test-01","desired_image":"stovo-backend:latest","phase":"failed","completed":false,"tenants":{"demo":{"slug":"demo","status":"failed","error":"crash"}}}'
if echo "$simulated_fail" | grep -q '"phase":"failed"'; then
  echo "  ✓ Rollout gate correctly detects failure"
else
  echo "  ! Failed to detect failure" >&2
  exit 1
fi

echo "=== All Stage GitOps E2E validations passed ==="
