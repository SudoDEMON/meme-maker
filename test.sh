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
MM_YTDLP_FORCE_IPV4=1 bash -c 'set -euo pipefail; source ./lib.sh; [[ " ${MM_YTDLP_ARGS[*]} " == *" --force-ipv4 "* ]]; [[ " ${MM_YTDLP_ARGS[*]} " == *" --socket-timeout 15 "* ]]'
MM_YTDLP_FORCE_IPV4=0 bash -c 'set -euo pipefail; source ./lib.sh; [[ " ${MM_YTDLP_ARGS[*]} " != *" --force-ipv4 "* ]]; [[ " ${MM_YTDLP_ARGS[*]} " == *" --socket-timeout 15 "* ]]'

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
  rm -f \
    "$REPO_ROOT/videos/mm-test-remote-blank.mp4" \
    "$REPO_ROOT/videos/mm-test-local-mov.mp4" \
    "$REPO_ROOT/videos/mm-test-crop-width.mp4" \
    "$REPO_ROOT/videos/mm-test-cancel.mp4"
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
printf 'media' >"$tmp_dir/input.mov"
MM_TEST_FFMPEG_LOG="$tmp_dir/ffmpeg.log" PATH="$stub_bin:$PATH" ./mememaker.sh --caption-local --crop 10 20 30 40 --width 30 "$tmp_dir/input.mp4" "$tmp_dir/cropped.mp4" "TOP" "" >/dev/null
grep -q 'crop=30:40:10:20,scale=30:-2:flags=lanczos' "$tmp_dir/ffmpeg.log"

MM_TEST_FFMPEG_LOG="$tmp_dir/blank-text.log" PATH="$stub_bin:$PATH" ./mememaker.sh --caption-local --width 30 "$tmp_dir/input.mp4" "$tmp_dir/blank-text.mp4" "" "" >/dev/null
if grep -q 'drawtext=' "$tmp_dir/blank-text.log"; then
  echo "Expected blank captions to render without drawtext filters"
  exit 1
fi

if command -v cygpath >/dev/null 2>&1; then
  echo "✓ Shell tests passed (web fixture integration requires Unix-native Node)"
  exit 0
fi

web_port="$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")"
MM_WEB_PORT="$web_port" MM_TEST_YTDLP_LOG="$tmp_dir/web-yt-dlp.log" MM_TEST_FFMPEG_LOG="$tmp_dir/web-ffmpeg.log" PATH="$stub_bin:$PATH" node web.js >"$tmp_dir/web.log" 2>&1 &
web_pid=$!
node - "$web_port" "$tmp_dir" <<'NODE'
const fs = require('fs');
const path = require('path');
const port = process.argv[2];
const tmpDir = process.argv[3];
const base = `http://127.0.0.1:${port}`;
const ytDlpLog = path.join(tmpDir, 'web-yt-dlp.log');
const movInput = path.join(tmpDir, 'input.mov');

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, label) {
  for (let i = 0; i < 50; i += 1) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}`);
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

function countDownloadSections() {
  if (!fs.existsSync(ytDlpLog)) return 0;
  return (fs.readFileSync(ytDlpLog, 'utf8').match(/--download-sections/g) || []).length;
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

(async () => {
  await waitForServer();
  const malformed = await fetch(`${base}/files/%E0%A4%A`);
  if (malformed.status !== 400) {
    throw new Error(`malformed file path returned ${malformed.status}, expected 400`);
  }
  const arbitrary = await fetch(`${base}/files/README.md`);
  if (arbitrary.status !== 404) {
    throw new Error(`unregistered file path returned ${arbitrary.status}, expected 404`);
  }

  const previewDownloadCount = countDownloadSections();
  const preview = await postJson('/api/preview-frame', {
    input: 'https://youtu.be/e3zN3rn2g7M',
    time: '0.2'
  });
  if (!preview.fileUrl || !preview.path.endsWith('.png')) {
    throw new Error('remote Experimental preview did not return a PNG file URL');
  }
  const previewFile = await fetch(`${base}${preview.fileUrl}`);
  if (!previewFile.ok) {
    throw new Error(`registered preview file returned ${previewFile.status}`);
  }
  await postJson('/api/preview-frame', {
    input: 'https://youtu.be/e3zN3rn2g7M',
    time: '0.8'
  });
  const previewDownloadsAfterCache = countDownloadSections() - previewDownloadCount;
  if (previewDownloadsAfterCache !== 1) {
    throw new Error(`expected cached preview window to use 1 yt-dlp download, saw ${previewDownloadsAfterCache}`);
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

  const movCreated = await postJson('/api/jobs', {
    action: 'experimental-gif-editor',
    fields: {
      input: movInput,
      output: 'mm-test-local-mov',
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
  if (movCreated.outputPath !== 'videos/mm-test-local-mov.mp4') {
    throw new Error(`unexpected MOV output path: ${movCreated.outputPath}`);
  }

  async function waitForCompleteJob(id, label) {
    let job = null;
    for (let i = 0; i < 50; i += 1) {
      job = await getJson(`/api/jobs/${id}`);
      if (job.status !== 'running') break;
      await sleep(100);
    }
    if (!job || job.status !== 'complete') {
      throw new Error(`${label} job status: ${job && job.status}`);
    }
  }

  await waitForCompleteJob(movCreated.id, 'local MOV Experimental');

  let job = null;
  for (let i = 0; i < 50; i += 1) {
    job = await getJson(`/api/jobs/${created.id}`);
    if (job.status !== 'running') break;
    await sleep(100);
  }
  if (!job || job.status !== 'complete') {
    throw new Error(`remote blank-text Experimental job status: ${job && job.status}`);
  }

  const cropped = await postJson('/api/jobs', {
    action: 'experimental-gif-editor',
    fields: {
      input: path.join(tmpDir, 'input.mp4'),
      output: 'mm-test-crop-width',
      format: 'mp4',
      topText: '',
      bottomText: '',
      topX: '10',
      topY: '20',
      bottomX: '10',
      bottomY: '20',
      width: '320',
      cropX: '10',
      cropY: '20',
      cropWidth: '100',
      cropHeight: '80'
    }
  });
  let croppedJob = null;
  for (let i = 0; i < 50; i += 1) {
    croppedJob = await getJson(`/api/jobs/${cropped.id}`);
    if (croppedJob.status !== 'running') break;
    await sleep(100);
  }
  if (!croppedJob || croppedJob.status !== 'complete') {
    throw new Error(`crop/output-width Experimental job status: ${croppedJob && croppedJob.status}`);
  }
  const ffmpegLog = fs.readFileSync(path.join(tmpDir, 'web-ffmpeg.log'), 'utf8');
  if (!ffmpegLog.includes('crop=100:80:10:20,scale=320:-2:flags=lanczos')) {
    throw new Error('expected Experimental crop to preserve explicit output width 320');
  }

  const longFfmpeg = path.join(tmpDir, 'bin', 'ffmpeg');
  const longPid = path.join(tmpDir, 'long-ffmpeg.pid');
  fs.writeFileSync(longFfmpeg, `#!/usr/bin/env bash
set -euo pipefail
trap 'exit 143' TERM INT
printf '%s\\n' "$$" >"${longPid}"
sleep 60
out="\${@: -1}"
mkdir -p "$(dirname "$out")"
printf 'encoded' >"$out"
`);
  fs.chmodSync(longFfmpeg, 0o755);

  const cancellable = await postJson('/api/jobs', {
    action: 'text-to-media',
    fields: {
      source: path.join(tmpDir, 'input.mp4'),
      start: '0:00',
      end: '',
      format: 'mp4',
      outputName: 'mm-test-cancel',
      topText: 'TOP',
      bottomText: ''
    }
  });
  await waitFor(() => fs.existsSync(longPid), 'long ffmpeg pid');
  const pid = Number(fs.readFileSync(longPid, 'utf8').trim());
  await fetch(`${base}/api/jobs/${cancellable.id}/cancel`, { method: 'POST' });
  await waitFor(() => !processAlive(pid), 'cancelled child process exit');
  const cancelled = await getJson(`/api/jobs/${cancellable.id}`);
  if (cancelled.status !== 'cancelled') {
    throw new Error(`cancelled job status: ${cancelled.status}`);
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
