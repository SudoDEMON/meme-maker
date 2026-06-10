#!/usr/bin/env bash
# mememaker.sh ───────────────────────────────────────────────────────────────
# meme-maker core tool
# Turn a YouTube slice into a captioned GIF or MP4 meme.
#
# Run with -h or --help for full usage, or see the top of this file.
# Environment variables: FONT=...  MM_DEBUG=1
# ---------------------------------------------------------------------------

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Handle help early
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -eq 0 ]]; then
  cat <<'EOF'
Usage:
  ./mememaker.sh <youtube-id> <start> <end> <gif|mp4> "<top text>" "<bottom text>" [font-path]

Examples:
  ./mememaker.sh Ee4oHnkXRnM 8:33 8:37 gif "TAKE THAT" "YOU 5 TON BEHEMOTH"
  ./mememaker.sh Ee4oHnkXRnM 8:33 8:37 mp4 "HELLO" "WORLD" /path/to/font.ttf

7th argument (font) is optional. You can also use the FONT environment variable.

This script requires: yt-dlp, ffmpeg
EOF
  exit 0
fi

ID="$1"
START="$2"
END="$3"
TYPE="$4"
TOP="$5"
BOT="$6"
FONT_ARG="${7:-}"

[[ -z "$BOT" ]] && die "Usage: mememaker.sh <id> <start> <end> <gif|mp4> \"top\" \"bottom\" [font]"

[[ "$TYPE" != "gif" && "$TYPE" != "mp4" ]] && die "TYPE must be 'gif' or 'mp4'"

check_deps yt-dlp ffmpeg

OUT="meme.$TYPE"

WIDTH=720
FPS=15
SIZE=50
STROKE=3     # outline thickness

# Get a good font (respects 7th arg + FONT env + auto-detect)
FONT="$(detect_font "$FONT_ARG")"
info "Using font: $FONT"

# Safe temp files (auto-cleaned on exit or Ctrl-C)
# Use make_temp_name for the yt-dlp target so we don't pre-create an empty file.
# yt-dlp has "already downloaded" logic that can skip if a 0-byte placeholder exists.
CLIP_SRC="$(make_temp_name --ext mp4)"
CLIP_CLEAN="$(make_temp_file)"
TOP_TXT="$(write_drawtext_file "$TOP")"
BOT_TXT="$(write_drawtext_file "$BOT")"

# ---------- 1) Download the section (modern yt-dlp) ------------------------
info "Downloading section $START → $END from $ID …"
yt-dlp -f "bv*[ext=mp4]+ba" --merge-output-format mp4 \
       --download-sections "*$START-$END" \
       --force-keyframes-at-cuts \
       --force-overwrites \
       -o "$CLIP_SRC" "https://youtu.be/$ID"

# yt-dlp can occasionally write a sibling with the ext appended; pick the real file if needed.
if [[ ! -s "$CLIP_SRC" && -s "$CLIP_SRC.mp4" ]]; then
  CLIP_SRC="$CLIP_SRC.mp4"
fi
[[ -s "$CLIP_SRC" ]] || die "yt-dlp produced no usable media for $ID ($START-$END). Try a different video or run with MM_DEBUG=1."

# ---------- 2) Clean trim + prepare (more reliable than postprocessor hacks)
info "Preparing clean clip for captioning…"
ffmpeg -y -i "$CLIP_SRC" -ss "$START" -to "$END" \
       -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
       -c:a aac -b:a 192k \
       "$CLIP_CLEAN"

# ---------- 3) Build drawtext filters using textfile (arbitrary text safe) --
# This completely avoids the nightmare of escaping colons, commas, quotes etc.
DT="drawtext=fontfile=$FONT:textfile=$TOP_TXT:fontcolor=white:borderw=$STROKE:bordercolor=black@1:fontsize=$SIZE:x=(w-text_w)/2:y=40,
    drawtext=fontfile=$FONT:textfile=$BOT_TXT:fontcolor=white:borderw=$STROKE:bordercolor=black@1:fontsize=$SIZE:x=(w-text_w)/2:y=h-$SIZE*1.8"

# ---------- 4) branch: GIF or MP4 ------------------------------------------
if [[ "$TYPE" == "gif" ]]; then
  info "Generating palette…"
  ffmpeg -y -i "$CLIP_CLEAN" -vf "fps=$FPS,scale=$WIDTH:-1:flags=lanczos,$DT,palettegen" palette.png

  info "Creating GIF…"
  ffmpeg -y -i "$CLIP_CLEAN" -i palette.png -lavfi \
         "fps=$FPS,scale=$WIDTH:-1:flags=lanczos,$DT,paletteuse=dither=floyd_steinberg" \
         -loop 0 "$OUT"
  rm -f palette.png
else
  info "Creating MP4…"
  ffmpeg -y -i "$CLIP_CLEAN" -vf "scale=$WIDTH:-1:flags=lanczos,$DT" \
         -c:v libx264 -crf 23 -preset slow -movflags +faststart \
         -pix_fmt yuv420p "$OUT"
fi

success "Saved $OUT"
