#!/usr/bin/env bash
set -euo pipefail

if sudo docker buildx version >/dev/null 2>&1; then
  exit 0
fi

echo "Docker Buildx is missing; installing docker-buildx-plugin." >&2
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y docker-buildx-plugin
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker-buildx-plugin
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y docker-buildx-plugin
else
  echo "Install docker-buildx-plugin with the host package manager, then retry deployment." >&2
  exit 1
fi

sudo docker buildx version
