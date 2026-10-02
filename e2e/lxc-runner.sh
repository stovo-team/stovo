#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# LXC Container Playwright E2E Test Runner for Stovo
# ==============================================================================
# Usage:
#   ./lxc-runner.sh [TARGET_URL]
# Example:
#   ./lxc-runner.sh http://localhost:8081
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TARGET_URL="${1:-${E2E_BASE_URL:-http://localhost:8081}}"
export E2E_BASE_URL="$TARGET_URL"
export CI=true

echo "============================================================"
echo "🚀 Stovo LXC E2E Test Runner"
echo "Target Base URL: $E2E_BASE_URL"
echo "============================================================"

# 1. Ensure Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed in this LXC container."
    echo "Please install Node.js (v18+) before running E2E tests."
    exit 1
fi

echo "📦 Installing Node dependencies..."
npm ci --silent || npm install --silent

# 2. Install Playwright browser binaries & system dependencies for LXC
echo "🌐 Installing Chromium browser and system dependencies for LXC environment..."
npx playwright install --with-deps chromium

# 3. Execute Playwright E2E tests
echo "⚡ Executing E2E tests against $E2E_BASE_URL..."
if npx playwright test; then
    echo "============================================================"
    echo "✅ All E2E tests passed successfully!"
    echo "============================================================"
    exit 0
else
    TEST_EXIT_CODE=$?
    echo "============================================================"
    echo "❌ E2E tests failed with exit code $TEST_EXIT_CODE."
    echo "HTML report available in e2e/playwright-report/"
    echo "============================================================"
    exit $TEST_EXIT_CODE
fi
