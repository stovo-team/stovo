#!/usr/bin/env bash
set -euo pipefail

awk '
  function fail(message) {
    print message > "/dev/stderr"
    failed = 1
  }

  /^jobs:$/ {
    in_jobs = 1
    in_global_permissions = 0
    next
  }

  !in_jobs {
    if ($0 == "  pull_request:") fail("Untrusted pull requests must not run on self-hosted pipeline runners.")

    if ($0 == "permissions:") {
      in_global_permissions = 1
      next
    }
    if (in_global_permissions && $0 == "  contents: read") {
      global_contents_read = 1
    }
    next
  }

  /^  [[:alnum:]_-]+:$/ {
    job = $0
    sub(/^  /, "", job)
    sub(/:$/, "", job)
    in_job_permissions = 0
    next
  }

  /^    permissions:$/ {
    in_job_permissions = 1
    next
  }
  in_job_permissions && /^    [[:alnum:]_-]+:/ {
    in_job_permissions = 0
  }
  in_job_permissions && job == "changes" && $0 == "      contents: read" {
    changes_contents_read = 1
  }
  in_job_permissions && job == "deploy-android" && $0 == "      contents: write" {
    android_contents_write = 1
  }

  /^    if:/ {
    condition = $0
    sub(/^    if:[[:space:]]*/, "", condition)
    job_condition[job] = condition
  }
  /^    runs-on:/ {
    runner = $0
    sub(/^    runs-on:[[:space:]]*/, "", runner)
    job_runner[job] = runner
  }
  job == "backend-ci" && /^[[:space:]]+cache:[[:space:]]+false$/ { go_cache_disabled = 1 }
  (job == "frontend-ci" || job == "deploy-android") && /^[[:space:]]+cache:[[:space:]]+npm$/ { npm_remote_cache_enabled = 1 }
  job == "frontend-ci" && /actions\/upload-artifact@v4/ { frontend_artifact_uploaded = 1 }
  job == "deploy-android" && /actions\/download-artifact@v4/ { frontend_artifact_downloaded = 1 }
  job == "deploy-android" && /^      - name: Build frontend for Android release$/ { android_builds_frontend = 1 }
  job == "deploy-android" && /git fetch --tags/ { android_fetches_tags = 1 }
  /dorny\/paths-filter@v4/ || /dorny\/paths-filter@[[:xdigit:]]{40}[[:space:]]+# v4/ { paths_filter_v4 = 1 }
  /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/ { insecure_node_override = 1 }

  END {
    if (!global_contents_read) fail("The workflow token must have read-only contents access by default.")
    if (!changes_contents_read) fail("The changes job must retain contents: read permission.")
    if (!paths_filter_v4) fail("The pipeline must use the Node.js 24-compatible paths-filter release.")
    if (insecure_node_override) fail("The pipeline must not enable the insecure Node.js runtime override.")
    if (job_condition["frontend-ci"] != "needs.changes.outputs.frontend == '\''true'\''") {
      fail("Frontend CI must run only when frontend paths changed.")
    }
    if (job_condition["backend-ci"] != "needs.changes.outputs.backend == '\''true'\''") {
      fail("Backend CI must run only when backend paths changed.")
    }
    if (job_runner["frontend-ci"] != "[self-hosted, e2e]") {
      fail("Frontend CI must stay on the frontend runner labeled e2e.")
    }
    if (job_runner["backend-ci"] != "[self-hosted, tests]") {
      fail("Backend CI must stay on the backend CI runner labeled tests.")
    }
    if (job_runner["deploy-android"] != "[self-hosted, e2e]") {
      fail("Android release must stay on the frontend runner labeled e2e.")
    }
    if (!go_cache_disabled) fail("Backend CI must avoid the oversized remote Go cache on persistent self-hosted runners.")
    if (npm_remote_cache_enabled) fail("Frontend and Android jobs must use the runner-local npm cache, not restore the oversized remote archive.")
    if (frontend_artifact_uploaded || frontend_artifact_downloaded || !android_builds_frontend) {
      fail("Android release must build frontend assets locally instead of transferring a workflow artifact.")
    }
    if (android_fetches_tags) {
      fail("Android release must use tags already fetched by checkout instead of fetching them again.")
    }

    expected_frontend = "github.ref == '\''refs/heads/master'\'' && github.event_name != '\''pull_request'\'' && needs.changes.outputs.frontend == '\''true'\''"
    expected_backend = "github.ref == '\''refs/heads/master'\'' && github.event_name != '\''pull_request'\'' && needs.changes.outputs.backend == '\''true'\''"
    if (job_condition["deploy-frontend-web"] != expected_frontend) {
      fail("Frontend deploy must require a master push and the frontend path filter.")
    }
    if (job_condition["deploy-backend-web"] != expected_backend) {
      fail("Backend deploy must require a master push and the backend path filter.")
    }
    if (job_condition["deploy-android"] != expected_frontend) {
      fail("Android release must require a master push and the frontend path filter.")
    }
    if (!android_contents_write) fail("Android release must retain permission to push its release tag.")

    if (failed) exit 1
  }
' .github/workflows/pipeline.yml

grep -Fq 'RUN --mount=type=cache,target=/root/.npm \' frontend/Dockerfile || {
  echo "The frontend npm dependency install must retain its BuildKit cache mount." >&2
  exit 1
}
if [ "$(grep -Fc 'bash scripts/ensure-docker-buildx.sh' .github/workflows/pipeline.yml)" -lt 2 ]; then
  echo "Both production deployment jobs must ensure Docker Buildx before building images." >&2
  exit 1
fi
bash scripts/ensure-docker-buildx.test.sh

awk '
  /docker_with_space_recovery\(\)/ { in_recovery = 1; in_command = 0; in_failure_branch = 0 }
  in_recovery && /if "\$@" >"\$deploy_log" 2>&1; then/ { in_command = 1 }
  in_command && /else/ { in_failure_branch = 1; next }
  in_command && in_failure_branch && /deploy_status=\$\?/ { status_captured++ }
  in_recovery && /^            }$/ { in_recovery = 0 }
  END {
    if (status_captured < 2) {
      print "Every Docker deployment wrapper must capture command failures inside its failed-command branch." > "/dev/stderr"
      exit 1
    }
  }
' .github/workflows/pipeline.yml

trusted_pr_workflow=".github/workflows/trusted-pr-tests.yml"
grep -Fq '  pull_request:' "$trusted_pr_workflow" || {
  echo "Trusted PR tests must use pull_request so GitHub can require approval before external PR workflows run." >&2
  exit 1
}
grep -Fq 'persist-credentials: false' "$trusted_pr_workflow" || {
  echo "PR checkout must not persist a write-capable GitHub token." >&2
  exit 1
}

lint_config="backend/.golangci.yml"
if [[ ! -f "$lint_config" ]]; then
  echo "Missing pinned golangci-lint configuration at $lint_config" >&2
  exit 1
fi

grep -Eq '^version:[[:space:]]+"2"$' "$lint_config" || {
  echo "golangci-lint configuration must use the v2 schema." >&2
  exit 1
}
grep -Eq 'generated:[[:space:]]+strict' "$lint_config" || {
  echo "Generated Ent code must be excluded using generated-file detection." >&2
  exit 1
}
if grep -Eq '^[[:space:]]*-[[:space:]]+ent/' "$lint_config"; then
  echo "The full ent/ tree must stay linted so handwritten Ent schemas remain covered." >&2
  exit 1
fi
if [[ ! -d backend/ent/schema ]]; then
  echo "Expected handwritten Ent schemas to remain part of the backend source tree." >&2
  exit 1
fi
grep -Eq '^// Code generated .* DO NOT EDIT\.$' backend/ent/user.go || {
  echo "Generated Ent output must retain the marker recognized by strict generated-file detection." >&2
  exit 1
}
grep -Eq 'golangci-lint-action@v9|golangci-lint-action@[[:xdigit:]]{40}[[:space:]]+# v9' .github/workflows/pipeline.yml || {
  echo "Backend CI must use golangci-lint action v9." >&2
  exit 1
}
grep -Fq 'version: v2.14.0' .github/workflows/pipeline.yml || {
  echo "Backend CI must pin golangci-lint to v2.14.0." >&2
  exit 1
}
grep -Fq 'GOLANGCI_LINT_VERSION := v2.14.0' backend/Makefile || {
  echo "The local installation instructions must use the CI golangci-lint version." >&2
  exit 1
}
grep -Fq 'verify: true' .github/workflows/pipeline.yml || {
  echo "Backend CI must verify the golangci-lint configuration." >&2
  exit 1
}
grep -Fq 'golangci-lint run --config .golangci.yml ./...' backend/Makefile || {
  echo "The backend Makefile must provide the documented local lint command." >&2
  exit 1
}
grep -Fq 'golangci-lint config verify --config .golangci.yml' backend/Makefile || {
  echo "The backend Makefile must provide config validation locally." >&2
  exit 1
}
