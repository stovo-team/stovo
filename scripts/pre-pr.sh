#!/usr/bin/env bash
set -euo pipefail
# Fast local static verification before creating/pushing PR or during pre-commit
MODE="diff"; PR_FILE=""; BASE_REF="origin/master"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cached) MODE="cached"; shift ;;
    --all) MODE="all"; shift ;;
    --base) BASE_REF="$2"; shift 2 ;;
    --pr-file) PR_FILE="$2"; shift 2 ;;
    *) echo "Usage: $0 [--cached|--all|--base <ref>|--pr-file <path>]" >&2; exit 1 ;;
  esac
done

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== [1/4] Checking Test Integrity ==="
node scripts/check-test-integrity.mjs

echo "=== [2/4] Detecting changed paths ==="
CHANGED_FILES=""
if [[ "$MODE" == "all" ]]; then
  HAS_FRONTEND="true"; HAS_BACKEND="true"
elif [[ "$MODE" == "cached" ]]; then
  CHANGED_FILES="$(git diff --name-only --cached || true)"
else
  CHANGED_FILES="$(git rev-parse --verify "$BASE_REF" >/dev/null 2>&1 && git diff --name-only "$BASE_REF"...HEAD || git diff --name-only HEAD~1...HEAD 2>/dev/null || true)"
fi

if [[ "$MODE" != "all" ]]; then
  HAS_FRONTEND="false"; HAS_BACKEND="false"
  echo "$CHANGED_FILES" | grep -Eq '^(frontend/|scripts/check-frontend-css-size)' && HAS_FRONTEND="true" || true
  echo "$CHANGED_FILES" | grep -Eq '^(backend/|deploy/)' && HAS_BACKEND="true" || true
fi
echo "Frontend: $HAS_FRONTEND | Backend: $HAS_BACKEND"

echo "=== [3/4] Running Static Code Checks ==="
if [[ "$HAS_FRONTEND" == "true" ]]; then
  node scripts/check-frontend-css-size.cjs
  [[ -d "frontend/node_modules" ]] && npm --prefix frontend run build
fi

if [[ "$HAS_BACKEND" == "true" ]]; then
  (cd backend && make arch-lint)
  if command -v golangci-lint >/dev/null 2>&1; then
    if [[ "$MODE" == "cached" ]]; then (cd backend && golangci-lint run --config .golangci.yml --new)
    elif [[ "$MODE" == "diff" ]]; then (cd backend && (golangci-lint run --config .golangci.yml --new-from-rev="$BASE_REF" 2>/dev/null || golangci-lint run --config .golangci.yml --new))
    else (cd backend && golangci-lint run --config .golangci.yml ./...)
    fi
  else (cd backend && go vet ./...)
  fi
fi

echo "=== [4/4] Validating PR Description & Workflows ==="
if [[ -n "$PR_FILE" ]]; then
  [[ -f "$PR_FILE" ]] || { echo "PR file '$PR_FILE' not found." >&2; exit 1; }
  node scripts/agent-workflows/validate-pr-description.mjs --file "$PR_FILE" --frontend "$HAS_FRONTEND" --backend "$HAS_BACKEND"
fi
echo "All fast pre-PR static checks passed successfully! 🚀"
