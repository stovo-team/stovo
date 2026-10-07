#!/usr/bin/env bash
set -euo pipefail

if sudo docker buildx version >/dev/null 2>&1; then
  exit 0
fi

echo "Docker Buildx is missing; installing its CLI plugin." >&2
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  if apt-cache show docker-buildx-plugin >/dev/null 2>&1; then
    sudo apt-get install -y docker-buildx-plugin
  elif apt-cache show docker-buildx >/dev/null 2>&1; then
    sudo apt-get install -y docker-buildx
  else
    echo "Neither docker-buildx-plugin nor docker-buildx is available. Configure Docker's apt repository or enable Ubuntu Universe, then retry." >&2
    exit 1
  fi
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker-buildx-plugin
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y docker-buildx-plugin
else
  echo "Install docker-buildx-plugin with the host package manager, then retry deployment." >&2
  exit 1
fi

sudo docker buildx version
