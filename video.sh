#!/usr/bin/env bash
# video.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Download a clean, trimmed video clip from YouTube.
#
# Usage: npm run video <VIDEO_ID> <start> <end> [output.mp4]
#        ./video.sh <VIDEO_ID> <start> <end> [output.mp4]
#
# Examples:
#   ./video.sh dQw4w9wgccc 0:42 1:17 funny.mp4
#   npm run video dQw4w9wgccc 0:42 1:17
#
# Environment: MM_DEBUG=1

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 3 ]]; then
  cat <<'EOF'
Usage:
  ./video.sh <youtube-id> <start> <end> [output.mp4]

Downloads a trimmed clip using yt-dlp + a clean ffmpeg pass.
Requires: yt-dlp, ffmpeg
EOF
  exit 0
fi

VID="$1"
START="$2"
END="$3"
OUT="${4:-clip.mp4}"

check_deps yt-dlp ffmpeg

info "Grabbing $START → $END from $VID …"

SRC="$(make_temp_name --ext mp4)"
yt-dlp -f "bv*[ext=mp4]+ba" --merge-output-format mp4 \
       --download-sections "*$START-$END" \
       --force-keyframes-at-cuts \
       --force-overwrites \
       -o "$SRC" "https://www.youtube.com/watch?v=$VID"

# yt-dlp can occasionally write a sibling with the ext appended; pick the real file if needed.
if [[ ! -s "$SRC" && -s "$SRC.mp4" ]]; then
  SRC="$SRC.mp4"
fi
[[ -s "$SRC" ]] || die "yt-dlp produced no usable media for $VID ($START-$END). Try a different video or run with MM_DEBUG=1."

# Clean re-encode of the already-sectioned clip (yt-dlp already extracted
# the requested range; the resulting file is short with timeline ~0).
ffmpeg -y -i "$SRC" \
       -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
       -c:a aac -b:a 192k -movflags +faststart \
       "$OUT"

success "Saved $OUT"
