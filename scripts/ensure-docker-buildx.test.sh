#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENSURE_SCRIPT="$SCRIPT_DIR/ensure-docker-buildx.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/bin" "$TMP_DIR/empty-bin"
cat > "$TMP_DIR/bin/sudo" <<'SUDO'
#!/bin/sh
if [ "$1" = docker ] && [ "$2" = buildx ] && [ "$3" = version ]; then
  [ -f "$BUILDX_TEST_INSTALLED" ]
  exit $?
fi
if [ "$1" = apt-get ]; then
  printf '%s\n' "$*" >> "$BUILDX_TEST_LOG"
  if [ "$2" = install ]; then
    : > "$BUILDX_TEST_INSTALLED"
  fi
  exit 0
fi
exit 99
SUDO
chmod +x "$TMP_DIR/bin/sudo"
printf '#!/bin/sh\nexit 0\n' > "$TMP_DIR/bin/apt-get"
chmod +x "$TMP_DIR/bin/apt-get"

BUILDX_TEST_INSTALLED="$TMP_DIR/installed" \
BUILDX_TEST_LOG="$TMP_DIR/install.log" \
PATH="$TMP_DIR/bin" \
  /bin/bash "$ENSURE_SCRIPT"
grep -Fxq 'apt-get update' "$TMP_DIR/install.log"
grep -Fxq 'apt-get install -y docker-buildx-plugin' "$TMP_DIR/install.log"

rm -f "$TMP_DIR/install.log"
BUILDX_TEST_INSTALLED="$TMP_DIR/installed" \
BUILDX_TEST_LOG="$TMP_DIR/install.log" \
PATH="$TMP_DIR/bin" \
  /bin/bash "$ENSURE_SCRIPT"
if [ -e "$TMP_DIR/install.log" ]; then
  echo "Buildx installer must not run when the plugin is already available." >&2
  exit 1
fi

if BUILDX_TEST_INSTALLED="$TMP_DIR/not-installed" \
  BUILDX_TEST_LOG="$TMP_DIR/unsupported.log" \
  PATH="$TMP_DIR/empty-bin" \
  /bin/bash "$ENSURE_SCRIPT" >"$TMP_DIR/unsupported.out" 2>&1; then
  echo "Buildx setup must fail clearly when no supported package manager exists." >&2
  exit 1
fi
grep -Fq 'Install docker-buildx-plugin with the host package manager' "$TMP_DIR/unsupported.out"

echo "Buildx setup checks passed."
