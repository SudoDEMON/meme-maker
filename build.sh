#!/usr/bin/env bash
# build.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Capture HTML → video/GIF/PNG using puppeteer (for fancy animations).
#
# Usage examples:
#   ./build.sh index.html out.mp4 10
#   ./build.sh index.html out.mp4 10 music.mp3
#   npm run build index.html out.mp4 10 music.mp3
#
# Requires: node (with puppeteer), ffmpeg
# Environment: MM_DEBUG=1

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 3 ]]; then
  cat <<'EOF'
Usage:
  ./build.sh <htmlFile> <output.(mp4|gif|png)> <seconds> [audio.mp3]

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
AUDIO=$4

check_deps node ffmpeg

# 1) capture PNG frames ------------------------------------------------------
info "Capturing frames from $HTML for ${SECS}s …"
node capture.js "$HTML" "$SECS"

ext=${OUT##*.}

if [[ "$ext" == "gif" ]]; then
  info "Encoding transparent GIF…"
  ffmpeg -y -framerate 15 -i frames/%05d.png \
         -filter_complex "[0:v]palettegen=reserve_transparent=1[p]" \
         -map "[p]" palette.png
  ffmpeg -y -framerate 15 -i frames/%05d.png -i palette.png \
         -lavfi paletteuse -loop 0 "$OUT"

elif [[ "$ext" == "png" ]]; then
  info "Saving single frame…"
  cp frames/00000.png "$OUT"

else
  # MP4 path
  TMP="$(make_temp_file --ext mp4)"
  info "Encoding MP4…"
  ffmpeg -y -framerate 15 -i frames/%05d.png \
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
fi

##############################################################################
elapsed=$SECONDS
printf "\n${GREEN}✅ Build finished in %02d:%02d${RESET}\n" $((elapsed/60)) $((elapsed%60))
##############################################################################
