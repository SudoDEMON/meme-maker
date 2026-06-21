#!/usr/bin/env bash
# build.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Capture HTML → video/GIF/PNG/WebM using puppeteer.
#
# Usage examples:
#   ./build.sh index.html out.mp4 10
#   ./build.sh index.html out.webm 10 music.mp3
#   npm run build index.html out.mp4 10 music.mp3
#
# Requires: node (with puppeteer), ffmpeg
# Environment: MM_DEBUG=1

resolve_script_dir() {
  local src="${BASH_SOURCE[0]}"
  local dir
  while [[ -L "$src" ]]; do
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    [[ "$src" == /* ]] || src="$dir/$src"
  done
  cd -P "$(dirname "$src")" && pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
source "$SCRIPT_DIR/lib.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 3 ]]; then
  cat <<'EOF'
Usage:
  ./build.sh <htmlFile> <output.(mp4|webm|gif|png)> <seconds> [audio]

Captures a headless browser rendering of the HTML file into frames,
then encodes to the desired output format.
EOF
  exit 0
fi

##############################################################################
SECONDS=0   # start timer
##############################################################################

HTML=$1
OUT=$2
SECS=$3
AUDIO="${4:-}"
FPS="${MM_BUILD_FPS:-60}"

check_deps node ffmpeg

[[ -f "$HTML" ]] || die "HTML file not found: $HTML"
[[ "$SECS" =~ ^[0-9]+([.][0-9]+)?$ ]] || die "Seconds must be a positive number: $SECS"
[[ "$FPS" =~ ^[0-9]+$ && "$FPS" -gt 0 ]] || die "MM_BUILD_FPS must be a positive integer: $FPS"
if [[ -n "$AUDIO" ]]; then
  [[ -f "$AUDIO" ]] || die "Audio file not found: $AUDIO"
fi

OUT_DIR="$(dirname "$OUT")"
[[ "$OUT_DIR" != "." ]] && mkdir -p "$OUT_DIR"

ext="$(printf '%s' "${OUT##*.}" | tr '[:upper:]' '[:lower:]')"
case "$ext" in
  mp4|webm|gif|png) ;;
  *) die "Unsupported output format: .$ext (use .mp4, .webm, .gif, or .png)" ;;
esac

FRAME_DIR="$(make_temp_dir)"

# 1) capture PNG frames ------------------------------------------------------
info "Capturing frames from $HTML for ${SECS}s at ${FPS}fps..."
node "$SCRIPT_DIR/capture.js" "$HTML" "$SECS" "$FRAME_DIR" "$FPS"

if [[ "$ext" == "gif" ]]; then
  PALETTE="$(make_temp_file --ext png)"

  info "Encoding transparent GIF..."
  ffmpeg -y -framerate "$FPS" -i "$FRAME_DIR/%05d.png" \
         -filter_complex "[0:v]palettegen=reserve_transparent=1[p]" \
         -map "[p]" -frames:v 1 -update 1 "$PALETTE"
  ffmpeg -y -framerate "$FPS" -i "$FRAME_DIR/%05d.png" -i "$PALETTE" \
         -lavfi paletteuse -loop 0 "$OUT"

elif [[ "$ext" == "png" ]]; then
  info "Saving single frame..."
  cp "$FRAME_DIR/00000.png" "$OUT"

elif [[ "$ext" == "mp4" ]]; then
  TMP="$(make_temp_file --ext mp4)"
  info "Encoding MP4..."
  ffmpeg -y -framerate "$FPS" -i "$FRAME_DIR/%05d.png" \
         -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow \
         "$TMP"

  if [[ -n "$AUDIO" ]]; then
    ffmpeg -y -i "$TMP" -i "$AUDIO" \
           -map 0:v:0 -map 1:a:0 \
           -c:v copy -c:a aac -b:a 192k \
           -shortest "$OUT"
  else
    mv "$TMP" "$OUT"
  fi

elif [[ "$ext" == "webm" ]]; then
  info "Encoding WebM..."
  if [[ -n "$AUDIO" ]]; then
    ffmpeg -y -framerate "$FPS" -i "$FRAME_DIR/%05d.png" -i "$AUDIO" \
           -map 0:v:0 -map 1:a:0 \
           -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
           -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
           -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
           -pix_fmt yuv420p -c:a libopus -b:a 128k \
           -shortest "$OUT"
  else
    ffmpeg -y -framerate "$FPS" -i "$FRAME_DIR/%05d.png" \
           -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
           -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
           -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
           -pix_fmt yuv420p \
           "$OUT"
  fi
fi

##############################################################################
elapsed=$SECONDS
printf "\n${GREEN}✅ Build finished in %02d:%02d${RESET}\n" $((elapsed/60)) $((elapsed%60))
##############################################################################
