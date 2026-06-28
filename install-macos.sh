#!/usr/bin/env bash
# macOS installer entrypoint for meme-maker.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
  cat <<'EOF'
Usage:
  ./install-macos.sh [--deps-only|--link-only|--doctor|--help]

Runs the main installer on macOS. install.sh uses Homebrew when available.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_help
  exit 0
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: install-macos.sh is for macOS. Use install-linux.sh or install-windows.ps1 on other systems." >&2
  exit 1
fi

exec "$SCRIPT_DIR/install.sh" "$@"
