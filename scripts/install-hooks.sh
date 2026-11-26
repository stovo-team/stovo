#!/usr/bin/env bash
set -euo pipefail
HOOKS_DIR="$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR"
cat << 'EOF' > "$HOOKS_DIR/pre-commit"
#!/usr/bin/env bash
set -euo pipefail
exec bash scripts/pre-pr.sh --cached
EOF
chmod +x "$HOOKS_DIR/pre-commit"
echo "Git pre-commit hook installed at $HOOKS_DIR/pre-commit"
