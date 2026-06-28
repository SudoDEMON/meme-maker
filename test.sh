#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

scripts=(
  "mememaker.sh"
  "lib.sh"
  "convert.sh"
  "audio_video.sh"
  "build.sh"
  "install.sh"
  "install-linux.sh"
  "install-macos.sh"
)

bash -n "${scripts[@]}"
node --check capture.js
node --check web.js
node --check web/app.js

./mememaker.sh --help >/dev/null
./convert.sh --help >/dev/null
./audio_video.sh --help >/dev/null
./build.sh --help >/dev/null
./install.sh --help >/dev/null
./install-linux.sh --help >/dev/null
./install-macos.sh --help >/dev/null
./convert.sh --help | grep -q 'gif|mp3|mp4|webm'
./audio_video.sh --help | grep -q 'source-file-or-url-or-youtube-id'
./build.sh --help | grep -q 'webm'
./mememaker.sh --help | grep -q '\[end\]'
./mememaker.sh --help | grep -q -- '--top-x'
./mememaker.sh --help | grep -q -- '--font-family'
./mememaker.sh --help | grep -q -- '--fps'
./mememaker.sh --help | grep -q -- '--underline'
./mememaker.sh --help | grep -q -- '--strikethrough'
./mememaker.sh --help | grep -q -- '--start'
./mememaker.sh --help | grep -q -- '--top-font-size'
./mememaker.sh --help | grep -q -- '--bottom-font-family'
./mememaker.sh --help | grep -q -- '--crop'
./convert.sh --help | grep -q 'source-file-or-url-or-youtube-id'

bash -c 'set -euo pipefail; source ./lib.sh; [[ "$(yt_dlp_section_range "0:00" "")" == "*0:00-inf" ]]; [[ "$(section_end_label "")" == "end" ]]; ! needs_yt_dlp_section "0:00" ""; ! needs_yt_dlp_section "0.0" ""; ! needs_yt_dlp_section "0:00.0" ""; needs_yt_dlp_section "0:10" ""; looks_like_time inf; looks_like_time 0.5; looks_like_time 0:00.5; [[ "$(yt_dlp_source_url "O0Dgtar0zB4")" == "https://www.youtube.com/watch?v=O0Dgtar0zB4" ]]; [[ "$(yt_dlp_source_url "https://example.com/video")" == "https://example.com/video" ]]'

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
web_pid=""
cleanup_test() {
  if [[ -n "$web_pid" ]]; then
    kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
  fi
  rm -f "$REPO_ROOT/videos/mm-test-remote-blank.mp4"
  rm -rf "$tmp_dir"
}
trap cleanup_test EXIT

stub_bin="$tmp_dir/bin"
mkdir -p "$stub_bin"
cat >"$stub_bin/yt-dlp" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
for arg in "$@"; do
  if [[ "$arg" == "--dump-single-json" ]]; then
    printf '%s\n' '{"id":"e3zN3rn2g7M","title":"Remote Fixture","duration":2,"fps":10,"width":320,"height":180,"extractor_key":"Test","webpage_url":"https://example.test/video","formats":[{"width":320,"height":180,"fps":10}]}'
    exit 0
  fi
done
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
if [[ -n "${MM_TEST_FFMPEG_LOG:-}" ]]; then
  printf '%s\n' "$*" >>"$MM_TEST_FFMPEG_LOG"
fi
out="${@: -1}"
mkdir -p "$(dirname "$out")"
printf 'encoded' >"$out"
EOF
chmod +x "$stub_bin/ffmpeg"

MM_TEST_YTDLP_LOG="$tmp_dir/yt-dlp.log" PATH="$stub_bin:$PATH" ./convert.sh e3zN3rn2g7M 0:00 "" mp4 "$tmp_dir/fort-3v1.mp4" >/dev/null
grep -q 'watch?v=e3zN3rn2g7M' "$tmp_dir/yt-dlp.log"
if grep -q -- '--download-sections' "$tmp_dir/yt-dlp.log"; then
  echo "Expected blank end from 0:00 to skip --download-sections"
  exit 1
fi

printf 'media' >"$tmp_dir/input.mp4"
MM_TEST_FFMPEG_LOG="$tmp_dir/ffmpeg.log" PATH="$stub_bin:$PATH" ./mememaker.sh --caption-local --crop 10 20 30 40 --width 30 "$tmp_dir/input.mp4" "$tmp_dir/cropped.mp4" "TOP" "" >/dev/null
grep -q 'crop=30:40:10:20,scale=30:-2:flags=lanczos' "$tmp_dir/ffmpeg.log"

MM_TEST_FFMPEG_LOG="$tmp_dir/blank-text.log" PATH="$stub_bin:$PATH" ./mememaker.sh --caption-local --width 30 "$tmp_dir/input.mp4" "$tmp_dir/blank-text.mp4" "" "" >/dev/null
if grep -q 'drawtext=' "$tmp_dir/blank-text.log"; then
  echo "Expected blank captions to render without drawtext filters"
  exit 1
fi

web_port="$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
MM_WEB_PORT="$web_port" MM_TEST_YTDLP_LOG="$tmp_dir/web-yt-dlp.log" PATH="$stub_bin:$PATH" node web.js >"$tmp_dir/web.log" 2>&1 &
web_pid=$!
node - "$web_port" <<'NODE'
const port = process.argv[2];
const base = `http://127.0.0.1:${port}`;

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('web server did not become ready');
}

async function postJson(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `${path} failed with ${response.status}`);
  }
  return data;
}

async function getJson(path) {
  const response = await fetch(`${base}${path}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `${path} failed with ${response.status}`);
  }
  return data;
}

(async () => {
  await waitForServer();
  const malformed = await fetch(`${base}/files/%E0%A4%A`);
  if (malformed.status !== 400) {
    throw new Error(`malformed file path returned ${malformed.status}, expected 400`);
  }

  const preview = await postJson('/api/preview-frame', {
    input: 'https://youtu.be/e3zN3rn2g7M',
    time: '0'
  });
  if (!preview.fileUrl || !preview.path.endsWith('.png')) {
    throw new Error('remote Experimental preview did not return a PNG file URL');
  }

  const created = await postJson('/api/jobs', {
    action: 'experimental-gif-editor',
    fields: {
      input: 'https://youtu.be/e3zN3rn2g7M',
      output: 'mm-test-remote-blank',
      format: 'mp4',
      topText: '',
      bottomText: '',
      topX: '0',
      topY: '0',
      bottomX: '0',
      bottomY: '0',
      width: '320',
      cropX: '0',
      cropY: '0',
      cropWidth: '0',
      cropHeight: '0'
    }
  });
  if (created.outputPath !== 'videos/mm-test-remote-blank.mp4') {
    throw new Error(`unexpected output path: ${created.outputPath}`);
  }

  let job = null;
  for (let i = 0; i < 50; i += 1) {
    job = await getJson(`/api/jobs/${created.id}`);
    if (job.status !== 'running') break;
    await sleep(100);
  }
  if (!job || job.status !== 'complete') {
    throw new Error(`remote blank-text Experimental job status: ${job && job.status}`);
  }
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
NODE

ln -s "$REPO_ROOT/build.sh" "$tmp_dir/build"
(cd "${TMPDIR:-/tmp}" && "$tmp_dir/build" --help >/dev/null)

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "${scripts[@]}"
fi

printf 'Smoke tests passed\n'
