#!/usr/bin/env bash
set -euo pipefail

configured_upstream="$1"
shift
if [ -n "$configured_upstream" ]; then
  printf '%s\n' "$configured_upstream"
  exit 0
fi
if [ "$#" -eq 0 ]; then
  exit 0
fi
if [ "$#" -ne 1 ]; then
  echo 'Multiple tenants exist: set BACKEND_UPSTREAMS explicitly for root API routing.' >&2
  exit 1
fi
if [[ ! "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
  echo 'Invalid tenant slug for root API routing.' >&2
  exit 1
fi
printf 'stovo-backend-%s:8000\n' "$1"
