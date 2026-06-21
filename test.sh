#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

scripts=(
  "mememaker.sh"
  "lib.sh"
  "video.sh"
  "music.sh"
  "build.sh"
  "install.sh"
  "Memes/mememaker.sh"
)

bash -n "${scripts[@]}"
node --check capture.js

./mememaker.sh --help >/dev/null
./video.sh --help >/dev/null
./music.sh --help >/dev/null
./build.sh --help >/dev/null
./install.sh --help >/dev/null

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/mm-test.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

ln -s "$REPO_ROOT/build.sh" "$tmp_dir/build"
(cd "${TMPDIR:-/tmp}" && "$tmp_dir/build" --help >/dev/null)

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "${scripts[@]}"
fi

printf 'Smoke tests passed\n'
