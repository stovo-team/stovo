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
    in_pull_request = 0
    next
  }

  !in_jobs {
    if ($0 == "  pull_request:") {
      in_pull_request = 1
      next
    }
    if (in_pull_request && $0 ~ /^  [[:alnum:]_-]+:/) {
      in_pull_request = 0
    }
    if (in_pull_request && $0 == "      - master") {
      pr_targets_master = 1
    }

    if ($0 == "permissions:") {
      in_global_permissions = 1
      next
    }
    if (in_global_permissions && $0 ~ /^[[:space:]]+pull-requests:/) {
      fail("Pull request API access must be scoped to the changes job.")
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
  in_job_permissions && /pull-requests:/ {
    pull_request_permission_count++
    if (job == "changes" && $0 == "      pull-requests: read") {
      changes_pull_request_read = 1
    }
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
  /dorny\/paths-filter@v4/ { paths_filter_v4 = 1 }
  /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/ { insecure_node_override = 1 }

  END {
    if (!pr_targets_master) fail("Pull requests targeting master must trigger the pipeline.")
    if (!global_contents_read) fail("The workflow token must have read-only contents access by default.")
    if (pull_request_permission_count != 1 || !changes_pull_request_read) {
      fail("Only the changes job may have pull-requests: read permission.")
    }
    if (!changes_contents_read) fail("The changes job must retain contents: read permission.")
    if (!paths_filter_v4) fail("The pipeline must use the Node.js 24-compatible paths-filter release.")
    if (insecure_node_override) fail("The pipeline must not enable the insecure Node.js runtime override.")
    if (job_condition["frontend-ci"] != "needs.changes.outputs.frontend == '\''true'\''") {
      fail("Frontend CI must run only when frontend paths changed.")
    }
    if (job_condition["backend-ci"] != "needs.changes.outputs.backend == '\''true'\''") {
      fail("Backend CI must run only when backend paths changed.")
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
