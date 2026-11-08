#!/usr/bin/env bash
set -euo pipefail

workflow=.github/workflows/trusted-pr-tests.yml

if grep -Eq '^[[:space:]]+actions:[[:space:]]+write$' "$workflow"; then
  echo "PR validation jobs must not grant actions: write to code from the pull request." >&2
  exit 1
fi

if grep -Fq 'Cancel workflow run on failure' "$workflow"; then
  echo "PR validation jobs must not use a write token to cancel Actions runs." >&2
  exit 1
fi
