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
${BOLD}BlackbirdVideo Tools Installer${RESET}

Usage:
  ./install.sh              Interactive install
  ./install.sh --deps-only  Only install system packages
  ./install.sh --link-only  Only create symlinks (skip package install)
  ./install.sh --help       This message

The installer will:
  • Install yt-dlp, ffmpeg, and good fonts
  • Optionally install Node.js (needed for build.sh / capture.js)
  • Symlink the scripts into ${BIN_DIR} so you can run them from anywhere
EOF
}

# --- Argument parsing ---
MODE="full"
for arg in "$@"; do
  case "$arg" in
    -h|--help) show_help; exit 0 ;;
    --deps-only) MODE="deps" ;;
    --link-only) MODE="link" ;;
    *) warn "Unknown argument: $arg" ;;
  esac
done

echo
echo "${BOLD}meme-maker — Setup${RESET}"
echo "Repo root: $REPO_ROOT"
echo

# --- OS / Package manager detection ---
OS="$(uname -s)"
PKG_MANAGER=""
INSTALL_CMD=""
FONT_PKG=""

detect_linux() {
  if command -v pacman >/dev/null 2>&1; then
    PKG_MANAGER="pacman"
    INSTALL_CMD="sudo pacman -S --needed"
    FONT_PKG="ttf-dejavu noto-fonts"
  elif command -v apt >/dev/null 2>&1; then
    PKG_MANAGER="apt"
    INSTALL_CMD="sudo apt update && sudo apt install -y"
    FONT_PKG="fonts-dejavu fonts-noto"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
    INSTALL_CMD="sudo dnf install -y"
    FONT_PKG="dejavu-sans-fonts google-noto-sans-fonts"
  elif command -v zypper >/dev/null 2>&1; then
    PKG_MANAGER="zypper"
    INSTALL_CMD="sudo zypper install -y"
    FONT_PKG="dejavu-fonts noto-sans-fonts"
  else
    PKG_MANAGER="unknown"
  fi
}

if [[ "$OS" == "Darwin" ]]; then
  PKG_MANAGER="brew"
  INSTALL_CMD="brew install"
  FONT_PKG=""   # macOS has good fonts built-in
  info "Detected macOS"
elif [[ "$OS" == "Linux" ]]; then
  detect_linux
  info "Detected Linux (package manager: ${PKG_MANAGER:-unknown})"
else
  warn "Unknown OS: $OS — you'll need to install dependencies manually"
fi

# --- Dependency installation ---
install_deps() {
  local deps=(yt-dlp ffmpeg)

  if [[ "$PKG_MANAGER" == "brew" ]]; then
    info "Installing via Homebrew: ${deps[*]}"
    $INSTALL_CMD "${deps[@]}" || true
    # Optional but nice
    brew install --quiet node 2>/dev/null || true

  elif [[ "$PKG_MANAGER" == "pacman" ]]; then
    # cachyOS / Arch — best case
    info "Installing via pacman (cachyOS/Arch)..."
    $INSTALL_CMD "${deps[@]}" $FONT_PKG base-devel || true
    # Node for build.sh
    $INSTALL_CMD nodejs npm 2>/dev/null || true

  elif [[ "$PKG_MANAGER" != "unknown" ]]; then
    info "Installing via $PKG_MANAGER..."
    $INSTALL_CMD "${deps[@]}" $FONT_PKG 2>/dev/null || true
    # Node is often separate
    $INSTALL_CMD nodejs npm 2>/dev/null || true
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

  local scripts=(
    "mememaker.sh"
    "video.sh"
    "music.sh"
    "build.sh"
    "lib.sh"
  )

  info "Linking scripts into $BIN_DIR ..."

  for script in "${scripts[@]}"; do
    local src="$REPO_ROOT/$script"
    if [[ -f "$src" ]]; then
      ln -sf "$src" "$BIN_DIR/${script%.sh}"   # strip .sh for nicer commands
      ln -sf "$src" "$BIN_DIR/$script"         # keep .sh version too
      echo "  linked → ${script%.sh}"
    else
      warn "Missing: $script"
    fi
  done

  # Also link the standalone meme tool (optional)
  if [[ -f "$REPO_ROOT/Memes/mememaker.sh" ]]; then
    ln -sf "$REPO_ROOT/Memes/mememaker.sh" "$BIN_DIR/meme-simple"
    echo "  linked → meme-simple (standalone version)"
  fi

  success "Scripts linked into $BIN_DIR"

  # Make sure it's in PATH
  if ! echo "$PATH" | tr ':' '\n' | grep -q "^$BIN_DIR$"; then
    warn "Add this to your shell rc file (~/.zshrc or ~/.bashrc):"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
}

# --- Optional Node dependencies for build.sh ---
install_node_deps() {
  if [[ -f "$REPO_ROOT/package.json" ]]; then
    if command -v npm >/dev/null 2>&1; then
      info "Installing Node dependencies (for build.sh)..."
      (cd "$REPO_ROOT" && npm install --silent) || warn "npm install had issues — you can run it manually later"
      success "Node deps installed"
    else
      warn "npm not found — skipping Node dependencies (build.sh will need them)"
    fi
  fi
}

# --- Main flow ---
case "$MODE" in
  deps)
    install_deps
    ;;
  link)
    link_scripts
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

  mememaker   video   music   build   meme-simple

Try:
  mememaker --help
  video --help

To update later:
  cd $REPO_ROOT
  git pull
  ./install.sh --link-only

Happy memeing!
EOF
