#!/usr/bin/env bash
# Linux installer entrypoint for meme-maker.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  cat <<'EOF'
Usage:
  ./install-linux.sh [--deps-only|--link-only|--doctor|--help]

Runs the main installer on Linux. Supports pacman, apt, dnf, and zypper through
install.sh.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: install-linux.sh is for Linux. Use install-macos.sh or install-windows.ps1 on other systems." >&2
  exit 1
fi

exec "$SCRIPT_DIR/install.sh" "$@"
