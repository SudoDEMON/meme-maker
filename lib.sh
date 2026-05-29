#!/usr/bin/env bash
# lib.sh ──────────────────────────────────────────────────────────────────────
# Shared utilities for meme-maker tools
# Source with:  source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "lib.sh is a library — source it from other scripts, don't run it directly." >&2
  exit 1
fi
#
# Provides:
#   - Nice colored logging (info / warn / die / success)
#   - Dependency checking
#   - Safe temp file/dir creation with automatic cleanup
#   - Cross-platform font detection
#   - Robust drawtext text handling via textfile (no more escaping hell)
#   - Basic help scaffolding
# -----------------------------------------------------------------------------

set -euo pipefail

# ── Colors (only if we're on a real terminal) ────────────────────────────────
if [[ -t 1 ]]; then
  RED="$(tput setaf 1 2>/dev/null || printf '\033[31m')"
  GREEN="$(tput setaf 2 2>/dev/null || printf '\033[32m')"
  YELLOW="$(tput setaf 3 2>/dev/null || printf '\033[33m')"
  BLUE="$(tput setaf 4 2>/dev/null || printf '\033[34m')"
  BOLD="$(tput bold 2>/dev/null || printf '\033[1m')"
  RESET="$(tput sgr0 2>/dev/null || printf '\033[0m')"
else
  RED= GREEN= YELLOW= BLUE= BOLD= RESET=
fi

# ── Logging helpers ──────────────────────────────────────────────────────────
die()    { echo "${RED}${BOLD}ERROR:${RESET} $*" >&2; exit 1; }
warn()   { echo "${YELLOW}!${RESET} $*" >&2; }
info()   { echo "${GREEN}•${RESET} $*"; }
success(){ echo "${GREEN}✅${RESET} $*"; }
debug()  { [[ "${BBV_DEBUG:-0}" == "1" ]] && echo "${BLUE}dbg:${RESET} $*" >&2; }

# ── Dependency checker ───────────────────────────────────────────────────────
check_deps() {
  local missing=()
  for cmd in "$@"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done
  if ((${#missing[@]} > 0)); then
    die "Missing required tools: ${missing[*]}\nInstall them and try again."
  fi
}

# ── Temp file / dir management with auto-cleanup ─────────────────────────────
declare -a BBV_TEMP_PATHS=()

_make_temp() {
  local kind=$1; shift
  local tmp
  if [[ $kind == "dir" ]]; then
    tmp=$(mktemp -d "${TMPDIR:-/tmp}/bbv.XXXXXX")
  else
    tmp=$(mktemp "${TMPDIR:-/tmp}/bbv.XXXXXX")
  fi
  BBV_TEMP_PATHS+=("$tmp")
  printf '%s\n' "$tmp"
}

make_temp_file() { _make_temp file "$@"; }
make_temp_dir()  { _make_temp dir  "$@"; }

cleanup() {
  local p
  for p in "${BBV_TEMP_PATHS[@]:-}"; do
    [[ -e "$p" ]] && rm -rf "$p"
  done
  BBV_TEMP_PATHS=()
}

# Register cleanup on common exit paths
trap cleanup EXIT INT TERM HUP

# ── Font detection (cross-platform, respects FONT env + CLI override) ────────
detect_font() {
  local font_arg=${1:-}

  if [[ -n "$font_arg" ]]; then
    [[ -f "$font_arg" ]] || die "Font not found: $font_arg"
    printf '%s\n' "$font_arg"
    return
  fi

  if [[ -n "${FONT:-}" ]]; then
    [[ -f "$FONT" ]] || die "FONT environment variable points to missing file: $FONT"
    printf '%s\n' "$FONT"
    return
  fi

  local candidates=()
  if [[ "$OSTYPE" == darwin* ]]; then
    candidates=(
      "/System/Library/Fonts/HelveticaNeue.ttc"
      "/System/Library/Fonts/SFNS.ttf"
      "/Library/Fonts/Arial Unicode.ttf"
    )
  else
    candidates=(
      "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"
      "/usr/share/fonts/noto/NotoSans-Bold.ttf"
      "/usr/share/fonts/TTF/LiberationSans-Bold.ttf"
      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
      "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
      "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
    )
  fi

  for f in "${candidates[@]}"; do
    [[ -f "$f" ]] && { printf '%s\n' "$f"; return; }
  done

  die "No usable font found.\n  Set FONT=/path/to/font.ttf or pass it as the last argument.\n  Common packages: ttf-dejavu, noto-fonts, ttf-liberation"
}

# ── Robust drawtext text handling ────────────────────────────────────────────
# The only sane way to support arbitrary user text (quotes, commas, colons, etc.)
# is to write the text to a temp file and use textfile= in the filter.
write_drawtext_file() {
  local text=$1
  local outfile
  outfile=$(make_temp_file)
  printf '%s\n' "$text" > "$outfile"
  printf '%s\n' "$outfile"
}

# ── Basic help scaffolding ───────────────────────────────────────────────────
show_help() {
  local script=${1:-$(basename "$0")}
  cat <<EOF
${BOLD}${script}${RESET} — BlackbirdVideo tool

Usage and options are documented at the top of the script.
Run the script with no arguments (or -h/--help) for the full usage example.

Common environment variables:
  FONT=/path/to/font.ttf     Force a specific font for mememaker
  BBV_DEBUG=1                Show extra debug output
EOF
}

# ── Small utility: check if a string looks like a time ───────────────────────
looks_like_time() {
  [[ "$1" =~ ^([0-9]+:)?[0-9]+:[0-9]+$ || "$1" =~ ^[0-9]+:[0-9]+$ || "$1" =~ ^[0-9]+$ ]]
}

# Export nothing by default — these are meant to be sourced and used directly.
# End of lib.sh
