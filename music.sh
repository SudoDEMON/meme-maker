#!/usr/bin/env bash
# music.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Extract a clean trimmed audio clip (mp3) from YouTube.
#
# Usage: npm run music <VIDEO_ID> <start> <end> [output.mp3]
#        ./music.sh <VIDEO_ID> <start> <end> [output.mp3]
#
# Examples:
#   ./music.sh dQw4w9wgccc 0:42 1:17 bassline.mp3
#
# Environment: MM_DEBUG=1

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 3 ]]; then
  cat <<'EOF'
Usage:
  ./music.sh <youtube-id> <start> <end> [output.mp3]

Extracts audio using yt-dlp + ffmpeg for reliable trimming.
Requires: yt-dlp, ffmpeg
EOF
  exit 0
fi

VID="$1"
START="$2"
END="$3"
OUT="${4:-clip.mp3}"

check_deps yt-dlp ffmpeg

info "Extracting audio $START → $END from $VID …"

SRC="$(make_temp_name --ext mp3)"
yt-dlp -x --audio-format mp3 --audio-quality 0 \
       --download-sections "*$START-$END" \
       --force-keyframes-at-cuts \
       --force-overwrites \
       -o "$SRC" "https://www.youtube.com/watch?v=$VID"

# yt-dlp can occasionally write a sibling with the ext appended; pick the real file if needed.
if [[ ! -s "$SRC" && -s "$SRC.mp3" ]]; then
  SRC="$SRC.mp3"
fi
[[ -s "$SRC" ]] || die "yt-dlp produced no usable audio for $VID ($START-$END). Try a different video or run with MM_DEBUG=1."

# Clean re-encode of the already-sectioned clip (yt-dlp already extracted
# the requested range; the resulting file is short with timeline ~0).
ffmpeg -y -i "$SRC" \
       -c:a libmp3lame -q:a 0 \
       "$OUT"

success "Saved $OUT"
