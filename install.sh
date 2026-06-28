#!/usr/bin/env bash
# install.sh ──────────────────────────────────────────────────────────────────
# meme-maker installer / migrator
#
# Helps you get the tools running on a new machine (especially cachyOS/Arch,
# but also works on macOS and other Linux distros).
#
# Usage:
#   ./install.sh                 # interactive install
#   ./install.sh --help
#   ./install.sh --deps-only     # just install packages, don't link scripts
#   ./install.sh --link-only     # just symlink scripts (assumes deps exist)
#
# OS-specific entrypoints:
#   ./install-linux.sh
#   ./install-macos.sh
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
#
# What it does:
#   - Detects your OS and package manager
#   - Installs yt-dlp + ffmpeg (+ fonts + node if needed)
#   - Creates ~/bin (or ~/.local/bin) if missing
#   - Symlinks the main scripts there
#   - Optionally runs `npm install` for build.sh support
# ---------------------------------------------------------------------------

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${HOME}/.local/bin"

# Colors
if [[ -t 1 ]]; then
  GREEN="$(tput setaf 2 2>/dev/null || echo '')"
  YELLOW="$(tput setaf 3 2>/dev/null || echo '')"
  BLUE="$(tput setaf 4 2>/dev/null || echo '')"
  BOLD="$(tput bold 2>/dev/null || echo '')"
  RESET="$(tput sgr0 2>/dev/null || echo '')"
else
  GREEN= YELLOW= BLUE= BOLD= RESET=
fi

info()  { echo "${BLUE}→${RESET} $*"; }
warn()  { echo "${YELLOW}!${RESET} $*" >&2; }
success(){ echo "${GREEN}✅${RESET} $*"; }
die()   { echo "ERROR: $*" >&2; exit 1; }

show_help() {
  cat <<EOF
${BOLD}meme-maker Installer${RESET}

Usage:
  ./install.sh              Interactive install
  ./install.sh --deps-only  Only install system packages
  ./install.sh --link-only  Only create symlinks (skip package install)
  ./install.sh --doctor     Run diagnostics (check tools, fonts, paths, etc.)
  ./install.sh --help       This message

The installer will:
  • Install yt-dlp, ffmpeg, and good fonts
  • Optionally install Node.js (needed for build.sh / capture.js)
  • Symlink the scripts into ${BIN_DIR} so you can run them from anywhere

OS-specific entrypoints are also available:
  ./install-linux.sh
  ./install-macos.sh
  powershell -ExecutionPolicy Bypass -File .\install-windows.ps1

Doctor mode checks your environment without making changes.
EOF
}

# --- Argument parsing ---
MODE="full"
for arg in "$@"; do
  case "$arg" in
    -h|--help) show_help; exit 0 ;;
    --deps-only) MODE="deps" ;;
    --link-only) MODE="link" ;;
    --doctor) MODE="doctor" ;;
    *) warn "Unknown argument: $arg" ;;
  esac
done

# --- OS / Package manager detection (always needed, even for doctor) ---
OS="$(uname -s)"
PKG_MANAGER=""
FONT_PKG=""

detect_linux() {
  if command -v pacman >/dev/null 2>&1; then
    PKG_MANAGER="pacman"
    FONT_PKG="ttf-dejavu noto-fonts"
  elif command -v apt >/dev/null 2>&1; then
    PKG_MANAGER="apt"
    FONT_PKG="fonts-dejavu fonts-noto"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
    FONT_PKG="dejavu-sans-fonts google-noto-sans-fonts"
  elif command -v zypper >/dev/null 2>&1; then
    PKG_MANAGER="zypper"
    FONT_PKG="dejavu-fonts noto-sans-fonts"
  else
    PKG_MANAGER="unknown"
  fi
}

if [[ "$OS" == "Darwin" ]]; then
  PKG_MANAGER="brew"
  FONT_PKG=""   # macOS has good fonts built-in
elif [[ "$OS" == "Linux" ]]; then
  detect_linux
else
  PKG_MANAGER="unknown"
fi

# Only print the banner for modes that actually do work
if [[ "$MODE" != "doctor" ]]; then
  echo
  echo "${BOLD}meme-maker — Setup${RESET}"
  echo "Repo root: $REPO_ROOT"
  echo

  if [[ "$OS" == "Darwin" ]]; then
    info "Detected macOS"
  elif [[ "$OS" == "Linux" ]]; then
    info "Detected Linux (package manager: ${PKG_MANAGER:-unknown})"
  else
    warn "Unknown OS: $OS — you'll need to install dependencies manually"
  fi
fi

# --- Dependency installation ---
install_packages() {
  local pkgs=("$@")

  case "$PKG_MANAGER" in
    brew)
      brew install "${pkgs[@]}"
      ;;
    pacman)
      sudo pacman -S --needed "${pkgs[@]}"
      ;;
    apt)
      sudo apt update
      sudo apt install -y "${pkgs[@]}"
      ;;
    dnf)
      sudo dnf install -y "${pkgs[@]}"
      ;;
    zypper)
      sudo zypper install -y "${pkgs[@]}"
      ;;
    *)
      return 1
      ;;
  esac
}

install_deps() {
  local deps=(yt-dlp ffmpeg)
  local font_deps=()
  local pkgs=()
  [[ -n "$FONT_PKG" ]] && read -r -a font_deps <<< "$FONT_PKG"

  if [[ "$PKG_MANAGER" == "brew" ]]; then
    info "Installing via Homebrew: ${deps[*]}"
    install_packages "${deps[@]}"
    install_packages node || warn "Node.js install failed; build.sh will need Node.js installed manually"

  elif [[ "$PKG_MANAGER" == "pacman" ]]; then
    # cachyOS / Arch — best case
    info "Installing via pacman (cachyOS/Arch)..."
    pkgs=("${deps[@]}" "${font_deps[@]}" base-devel)
    install_packages "${pkgs[@]}"
    install_packages nodejs npm || warn "Node.js/npm install failed; build.sh will need them installed manually"

  elif [[ "$PKG_MANAGER" != "unknown" ]]; then
    info "Installing via $PKG_MANAGER..."
    pkgs=("${deps[@]}" "${font_deps[@]}")
    install_packages "${pkgs[@]}"
    install_packages nodejs npm || warn "Node.js/npm install failed; build.sh will need them installed manually"
  else
    warn "No supported package manager found."
    echo "Please manually install: yt-dlp, ffmpeg, and a decent sans-serif font (DejaVu, Noto, etc.)"
    echo "Also install Node.js + npm if you want to use build.sh"
    return
  fi

  success "Core dependencies installed (or already present)"
}

# --- Create bin directory and link scripts ---
link_scripts() {
  mkdir -p "$BIN_DIR"

  local stale_links=(
    "download"
    "download.sh"
    "text"
    "text.sh"
    "audio"
    "audio.sh"
    "video"
    "video.sh"
    "music"
    "music.sh"
    "meme-simple"
  )

  for stale in "${stale_links[@]}"; do
    if [[ -L "$BIN_DIR/$stale" ]]; then
      rm -f "$BIN_DIR/$stale"
      echo "  removed stale → $stale"
    fi
  done

  local scripts=(
    "mememaker.sh"
    "convert.sh"
    "audio_video.sh"
    "build.sh"
    "lib.sh"
  )

  info "Linking scripts into $BIN_DIR ..."

  for script in "${scripts[@]}"; do
    local src="$REPO_ROOT/$script"
    if [[ -f "$src" ]]; then
      if [[ "$script" == "convert.sh" ]]; then
        ln -sf "$src" "$BIN_DIR/meme-convert"
        ln -sf "$src" "$BIN_DIR/$script"
        echo "  linked → meme-convert"
        continue
      fi
      ln -sf "$src" "$BIN_DIR/${script%.sh}"   # strip .sh for nicer commands
      ln -sf "$src" "$BIN_DIR/$script"         # keep .sh version too
      if [[ "$script" == "audio_video.sh" ]]; then
        ln -sf "$src" "$BIN_DIR/audio-video"
      fi
      echo "  linked → ${script%.sh}"
    else
      warn "Missing: $script"
    fi
  done

  success "Scripts linked into $BIN_DIR"

  # Make sure it's in PATH
  if ! echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then
    warn "Add this to your shell rc file (~/.zshrc or ~/.bashrc):"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
}

# --- Optional Node dependencies for build.sh ---
puppeteer_browser_path() {
  cd "$REPO_ROOT" && node -e 'try { process.stdout.write(require("puppeteer").executablePath()); } catch (_) {}'
}

puppeteer_browser_ready() {
  local browser_path
  browser_path="$(puppeteer_browser_path)"
  [[ -n "$browser_path" && -x "$browser_path" ]]
}

repair_puppeteer_cache_if_needed() {
  local browser_path
  local cache_root
  local browser_dir

  browser_path="$(puppeteer_browser_path)"
  [[ -n "$browser_path" && ! -x "$browser_path" ]] || return 0

  cache_root="${PUPPETEER_CACHE_DIR:-$HOME/.cache/puppeteer}"
  case "$browser_path" in
    "$cache_root"/*)
      browser_dir="$(dirname "$(dirname "$browser_path")")"
      ;;
    *)
      return 0
      ;;
  esac

  if [[ -d "$browser_dir" && "$browser_dir" == "$cache_root"/* ]]; then
    warn "Removing incomplete Puppeteer browser cache: $browser_dir"
    rm -rf "$browser_dir"
  fi
}

extract_cached_puppeteer_chrome() {
  local browser_path
  local browser_dir
  local browser_parent
  local browser_kind
  local cache_family_dir
  local build_dir
  local build_id
  local zip_path

  [[ "$(uname -s)" == "Linux" ]] || return 1
  command -v unzip >/dev/null 2>&1 || return 1

  browser_path="$(puppeteer_browser_path)"
  [[ -n "$browser_path" ]] || return 1

  browser_parent="$(dirname "$browser_path")"
  browser_kind="$(basename "$browser_parent")"
  browser_dir="$(dirname "$browser_parent")"
  cache_family_dir="$(dirname "$browser_dir")"
  build_dir="$(basename "$browser_dir")"
  build_id="${build_dir#linux-}"
  zip_path="$cache_family_dir/${build_id}-${browser_kind}.zip"

  [[ -f "$zip_path" ]] || return 1

  warn "Repairing Puppeteer browser from cached zip: $zip_path"
  rm -rf "$browser_dir"
  mkdir -p "$browser_dir"
  unzip -q "$zip_path" -d "$browser_dir"
  chmod +x "$browser_path" 2>/dev/null || true
}

install_node_deps() {
  if [[ -f "$REPO_ROOT/package.json" ]]; then
    if command -v npm >/dev/null 2>&1; then
      info "Installing Node dependencies (for build.sh)..."
      if (cd "$REPO_ROOT" && npm install --silent); then
        success "Node deps installed"
      else
        warn "npm install had issues — you can run it manually later"
        return
      fi

      info "Installing Puppeteer browser..."
      repair_puppeteer_cache_if_needed
      if (cd "$REPO_ROOT" && npx puppeteer browsers install chrome >/dev/null); then
        if puppeteer_browser_ready; then
          success "Puppeteer browser installed"
        elif extract_cached_puppeteer_chrome && puppeteer_browser_ready; then
          success "Puppeteer browser repaired from cached zip"
        else
          warn "Puppeteer browser install finished but no executable was found"
        fi
      elif extract_cached_puppeteer_chrome && puppeteer_browser_ready; then
        success "Puppeteer browser installed"
      else
        warn "Puppeteer browser install failed — remove the incomplete browser under ~/.cache/puppeteer, then run: cd $REPO_ROOT && npx puppeteer browsers install chrome"
      fi
    else
      warn "npm not found — skipping Node dependencies (build.sh will need them)"
    fi
  fi
}

# --- Doctor / diagnostics (no changes made) ---
run_doctor() {
  echo
  echo "${BOLD}meme-maker Doctor${RESET}"
  echo "Repo: $REPO_ROOT"
  echo "OS: $OS   (PKG_MANAGER=${PKG_MANAGER:-unknown})"
  echo

  local issues=0

  # --- Core tools ---
  echo "${BOLD}Core tools:${RESET}"
  if command -v yt-dlp >/dev/null 2>&1; then
    local ytv; ytv=$(yt-dlp --version 2>/dev/null | head -1)
    success "yt-dlp: $ytv"
  else
    warn "yt-dlp: MISSING"
    ((issues++))
  fi

  if command -v ffmpeg >/dev/null 2>&1; then
    local ffv; ffv=$(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f1-3)
    success "ffmpeg: $ffv"
  else
    warn "ffmpeg: MISSING"
    ((issues++))
  fi

  # --- Node (optional but needed for build.sh) ---
  echo
  echo "${BOLD}Node.js (for build.sh / capture.js):${RESET}"
  if command -v node >/dev/null 2>&1; then
    success "node: $(node --version 2>/dev/null)"
  else
    warn "node: MISSING (build.sh will not work)"
    ((issues++))
  fi
  if command -v npm >/dev/null 2>&1; then
    success "npm:  $(npm --version 2>/dev/null)"
  else
    warn "npm:  MISSING (build.sh will not work)"
    ((issues++))
  fi

  if command -v node >/dev/null 2>&1 && [[ -f "$REPO_ROOT/package.json" ]]; then
    local browser_path
    if browser_path=$(
      cd "$REPO_ROOT" && node <<'NODE'
const fs = require('fs');
let puppeteer;

try {
  puppeteer = require('puppeteer');
} catch (err) {
  console.error(`puppeteer not installed: ${err.message}`);
  process.exit(1);
}

let executable;
try {
  executable = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
} catch (err) {
  console.error(`could not resolve Puppeteer browser: ${err.message}`);
  process.exit(1);
}

if (!fs.existsSync(executable)) {
  console.error(`missing executable: ${executable}`);
  process.exit(1);
}

try {
  fs.accessSync(executable, fs.constants.X_OK);
} catch (err) {
  console.error(`not executable: ${executable}`);
  process.exit(1);
}

process.stdout.write(executable);
NODE
    ); then
      success "puppeteer browser: $browser_path"
    else
      warn "puppeteer browser: MISSING (run: cd $REPO_ROOT && npx puppeteer browsers install chrome)"
      ((issues++))
    fi
  fi

  # --- Font detection (source lib.sh from repo) ---
  echo
  echo "${BOLD}Font detection:${RESET}"
  if [[ -f "$REPO_ROOT/lib.sh" ]]; then
    # shellcheck disable=SC1091
    source "$REPO_ROOT/lib.sh" 2>/dev/null || true

    if declare -f detect_font >/dev/null 2>&1; then
      local font_path
      if font_path=$(detect_font 2>/dev/null); then
        success "Font found: $font_path"
      else
        warn "Font detection failed (see error above)"
        ((issues++))
      fi
    else
      warn "Could not load detect_font() from lib.sh"
      ((issues++))
    fi
  else
    warn "lib.sh not found in repo root — cannot test font detection"
    ((issues++))
  fi

  # --- Linked commands in PATH ---
  echo
  echo "${BOLD}Installed commands (in $BIN_DIR):${RESET}"
  local cmds=(mememaker meme-convert audio_video audio-video build)
  local missing_links=0
  for c in "${cmds[@]}"; do
    if [[ -L "$BIN_DIR/$c" || -f "$BIN_DIR/$c" ]]; then
      echo "  ✅ $c → $(readlink "$BIN_DIR/$c" 2>/dev/null || echo "$BIN_DIR/$c")"
    else
      echo "  ❌ $c (not linked)"
      ((missing_links++))
    fi
  done
  if (( missing_links > 0 )); then
    warn "$missing_links command(s) not linked. Run: ./install.sh --link-only"
    ((issues++))
  fi

  # --- Environment & misc ---
  echo
  echo "${BOLD}Environment:${RESET}"
  echo "  MM_DEBUG=${MM_DEBUG:-0}"
  echo "  FONT=${FONT:-<not set>}"
  echo "  PATH contains $BIN_DIR: $(if echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then echo yes; else echo no; fi)"

  # --- Summary ---
  echo
  if (( issues == 0 )); then
    success "All checks passed. You're good to go."
  else
    warn "$issues issue(s) found. Fix the items marked above."
    return 1
  fi
  echo
}

# --- Main flow ---
case "$MODE" in
  deps)
    install_deps
    ;;
  link)
    link_scripts
    ;;
  doctor)
    if run_doctor; then
      exit 0
    else
      exit 1
    fi
    ;;
  full)
    install_deps
    echo
    link_scripts
    echo
    if [[ "$OS" == "Linux" ]]; then
      read -rp "Install Node.js dependencies for build.sh/capture.js? [Y/n] " ans
      if [[ ! "$ans" =~ ^[Nn] ]]; then
        install_node_deps
      fi
    else
      install_node_deps
    fi
    ;;
esac

echo
success "Setup complete!"
echo
cat <<EOF
You can now run the tools directly:

  mememaker   meme-convert   audio-video   build

Try:
  mememaker --help
  meme-convert --help
  audio-video --help

To update later:
  cd $REPO_ROOT
  git pull
  ./install.sh --link-only

Happy memeing!
EOF
