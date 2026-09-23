#!/usr/bin/env bash
set -euo pipefail

workflow=".github/workflows/pipeline.yml"

job_block() {
  awk -v target="$1" '
    $0 == "  " target ":" { inside = 1; next }
    inside && /^  [a-zA-Z0-9_-]+:/ { exit }
    inside { print }
  ' "$workflow"
}

job_if() {
  job_block "$1" | awk '
    /^    if:/ {
      sub(/^    if:[[:space:]]*/, "")
      print
      found = 1
    }
    END { if (!found) exit 1 }
  '
}

job_permissions() {
  job_block "$1" | awk '
    /^    permissions:/ { inside = 1; next }
    inside && /^    [a-zA-Z0-9_-]+:/ { exit }
    inside { print }
  '
}

pull_request_trigger="$(awk '
  /^  pull_request:/ { inside = 1; next }
  inside && /^  [a-zA-Z0-9_-]+:/ { exit }
  inside { print }
' "$workflow")"
grep -q '^    branches:' <<<"$pull_request_trigger" && grep -q '^      - master$' <<<"$pull_request_trigger" || {
  echo "Pull requests targeting master must trigger the pipeline." >&2
  exit 1
}

global_permissions="$(awk '
  /^permissions:/ { inside = 1; next }
  inside && /^jobs:/ { exit }
  inside { print }
' "$workflow")"
grep -q '^  contents: read$' <<<"$global_permissions" || {
  echo "The workflow token must have read-only contents access by default." >&2
  exit 1
}
if grep -q 'pull-requests:' <<<"$global_permissions"; then
  echo "Pull request API access must be scoped to the change detection job." >&2
  exit 1
fi

changes_permissions="$(job_permissions changes)"
grep -q 'pull-requests: read' <<<"$changes_permissions" || {
  echo "The changes job needs read-only pull request access for paths-filter." >&2
  exit 1
}
pull_request_permission_count="$(grep -c 'pull-requests:' "$workflow")"
[[ "$pull_request_permission_count" -eq 1 ]] || {
  echo "Only the changes job may receive pull request API access." >&2
  exit 1
}
grep -q 'contents: read' <<<"$changes_permissions" || {
  echo "The changes job must retain read-only contents access." >&2
  exit 1
}
grep -q 'dorny/paths-filter@v4' "$workflow" || {
  echo "The pipeline must use the Node.js 24-compatible paths-filter release." >&2
  exit 1
}
if grep -q 'ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION' "$workflow"; then
  echo "The pipeline must not enable the insecure Node.js runtime override." >&2
  exit 1
fi

frontend_if="$(job_if frontend-ci)"
backend_if="$(job_if backend-ci)"
[[ "$frontend_if" == *"needs.changes.outputs.frontend == 'true'"* ]] || {
  echo "Frontend CI must run only when frontend paths changed." >&2
  exit 1
}
[[ "$backend_if" == *"needs.changes.outputs.backend == 'true'"* ]] || {
  echo "Backend CI must run only when backend paths changed." >&2
  exit 1
}

for deploy_job in deploy-frontend-web deploy-backend-web deploy-android; do
  deploy_if="$(job_if "$deploy_job")"
  case "$deploy_job" in
    deploy-backend-web)
      expected_if="github.ref == 'refs/heads/master' && github.event_name != 'pull_request' && needs.changes.outputs.backend == 'true'"
      ;;
    *)
      expected_if="github.ref == 'refs/heads/master' && github.event_name != 'pull_request' && needs.changes.outputs.frontend == 'true'"
      ;;
  esac
  [[ "$deploy_if" == "$expected_if" ]] || {
    echo "$deploy_job must require a master push and its matching CI path filter." >&2
    exit 1
  }
done

android_permissions="$(job_permissions deploy-android)"
grep -q 'contents: write' <<<"$android_permissions" || {
  echo "Android release publishing must retain permission to push its release tag." >&2
  exit 1
}
