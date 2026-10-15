#!/usr/bin/env bash
set -euo pipefail

# Local Go replacements must be present in the dependency-download layer.
for dockerfile in backend/Dockerfile backend/Dockerfile.orchestrator; do
  awk '
    /^COPY / && /third_party\/socketio\/go.mod/ && /third_party\/socketio\/go.sum/ {
      local_module_available = 1
    }
    /go mod download/ {
      download_found = 1
      if (!local_module_available) {
        print FILENAME ": local Socket.IO module manifests are missing before go mod download" > "/dev/stderr"
        exit 1
      }
    }
    END { if (!download_found) exit 1 }
  ' "$dockerfile"
done
