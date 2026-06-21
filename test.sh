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
node --check web.js
node --check web/app.js

./mememaker.sh --help >/dev/null
./video.sh --help >/dev/null
./music.sh --help >/dev/null
./build.sh --help >/dev/null
./install.sh --help >/dev/null
./build.sh --help | grep -q 'webm'
./video.sh --help | grep -q 'webm'
./video.sh --help | grep -q '\[end\]'
./music.sh --help | grep -q '\[end\]'
./mememaker.sh --help | grep -q '\[end\]'

bash -c 'set -euo pipefail; source ./lib.sh; [[ "$(yt_dlp_section_range "0:00" "")" == "*0:00-inf" ]]; [[ "$(section_end_label "")" == "end" ]]; ! needs_yt_dlp_section "0:00" ""; needs_yt_dlp_section "0:10" ""; looks_like_time inf'

if ./mememaker.sh abc 0:00 0:01 gif TOP >/tmp/mm-test-out.txt 2>/tmp/mm-test-err.txt; then
  echo "Expected short mememaker invocation to fail"
  exit 1
fi
grep -q 'Usage: mememaker.sh' /tmp/mm-test-err.txt
rm -f /tmp/mm-test-out.txt /tmp/mm-test-err.txt

signal_output="$(bash -c 'source ./lib.sh; kill -TERM $$; echo survived' 2>&1 || true)"
if printf '%s\n' "$signal_output" | grep -q 'survived'; then
  echo "Expected lib.sh TERM trap to exit"
  exit 1
fi

printf 'q\n' | ./mememaker.sh | grep -q 'Download Video'

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/mm-test.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

stub_bin="$tmp_dir/bin"
mkdir -p "$stub_bin"
cat >"$stub_bin/yt-dlp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${MM_TEST_YTDLP_LOG:?}"
out=""
while (($#)); do
  case "$1" in
    -o)
      out="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
[[ -n "$out" ]] || exit 2
printf 'media' >"$out"
EOF
chmod +x "$stub_bin/yt-dlp"

cat >"$stub_bin/ffmpeg" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
out="${@: -1}"
mkdir -p "$(dirname "$out")"
printf 'encoded' >"$out"
EOF
chmod +x "$stub_bin/ffmpeg"

MM_TEST_YTDLP_LOG="$tmp_dir/yt-dlp.log" PATH="$stub_bin:$PATH" ./video.sh e3zN3rn2g7M 0:00 "" "$tmp_dir/fort-3v1.mp4" >/dev/null
grep -q 'watch?v=e3zN3rn2g7M' "$tmp_dir/yt-dlp.log"
if grep -q -- '--download-sections' "$tmp_dir/yt-dlp.log"; then
  echo "Expected blank end from 0:00 to skip --download-sections"
  exit 1
fi

ln -s "$REPO_ROOT/build.sh" "$tmp_dir/build"
(cd "${TMPDIR:-/tmp}" && "$tmp_dir/build" --help >/dev/null)

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "${scripts[@]}"
fi

printf 'Smoke tests passed\n'
