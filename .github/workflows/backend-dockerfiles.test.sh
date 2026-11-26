#!/usr/bin/env bash
set -euo pipefail

# Local Go replacements must be present in the dependency-download layer,
# GOTOOLCHAIN=auto must be configured before go mod download,
# and the builder image must match the Go version declared in backend/go.mod.
required_go_version="$(awk '$1 == "go" { print $2 }' backend/go.mod)"
required_go_prefix="${required_go_version%.*}"

for dockerfile in backend/Dockerfile backend/Dockerfile.orchestrator; do
  awk -v req_prefix="$required_go_prefix" '
    /^FROM.*golang:/ {
      for (i = 1; i <= NF; i++) {
        if ($i ~ /^golang:/) {
          split($i, parts, /[:\.\-]/)
          builder_go = parts[2] "." parts[3]
        }
      }
    }
    /ENV GOTOOLCHAIN=auto/ {
      gotoolchain_auto = 1
    }
    /^COPY / && /third_party\/socketio\/go.mod/ && /third_party\/socketio\/go.sum/ {
      local_module_available = 1
    }
    /go mod download/ {
      download_found = 1
      if (!local_module_available) {
        print FILENAME ": local Socket.IO module manifests are missing before go mod download" > "/dev/stderr"
        exit 1
      }
      if (!gotoolchain_auto) {
        print FILENAME ": GOTOOLCHAIN=auto must be set before go mod download" > "/dev/stderr"
        exit 1
      }
    }
    END {
      if (!download_found) exit 1
      if (builder_go != req_prefix) {
        print FILENAME ": builder Go version " builder_go " does not match required " req_prefix > "/dev/stderr"
        exit 1
      }
    }
  ' "$dockerfile"
done
