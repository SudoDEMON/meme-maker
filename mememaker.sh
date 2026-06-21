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
  ./mememaker.sh <youtube-id> <start> <end> <gif|mp4> "<top text>" "<bottom text>" [custom-name] [font-path]

Examples:
  ./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif " " " " boom_headshot_no_text.gif
  ./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_text.gif
  ./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_glitch.gif /home/void/Projects/syntos-site/assets/fonts/rubik-glitch-regular.ttf

If a custom-name is given (7th arg), the output will be placed in gifs/ or videos/
and named <custom-name>.<gif|mp4>. Otherwise the YouTube ID is used as the stem.
The 8th argument (or 7th if no custom name) can be a font path.
You can also use the FONT environment variable.

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

FONT_ARG=""
CUSTOM_NAME=""
if [[ $# -ge 7 ]]; then
  arg7="$7"
  if [[ -f "$arg7" && "$arg7" =~ \.(ttf|otf|ttc)$ ]]; then
    FONT_ARG="$arg7"
  else
    CUSTOM_NAME="$arg7"
  fi
fi
if [[ $# -ge 8 ]]; then
  FONT_ARG="$8"
fi

[[ -z "$BOT" ]] && die "Usage: mememaker.sh <id> <start> <end> <gif|mp4> \"top\" \"bottom\" [custom-name] [font]"

[[ "$TYPE" != "gif" && "$TYPE" != "mp4" ]] && die "TYPE must be 'gif' or 'mp4'"

check_deps yt-dlp ffmpeg

# Determine output directory and filename based on type.
# Default stem is the YouTube ID; custom name (if provided) overrides the stem.
# Output is always placed in a type-specific subdirectory.
if [[ "$TYPE" == "gif" ]]; then
  OUT_DIR="gifs"
else
  OUT_DIR="videos"
fi
mkdir -p "$OUT_DIR"

if [[ -n "$CUSTOM_NAME" ]]; then
  STEM="$(basename "$CUSTOM_NAME")"
  STEM="${STEM%.*}"
else
  STEM="$ID"
fi
OUT="${OUT_DIR}/${STEM}.${TYPE}"

WIDTH=720
FPS=15
SIZE=50
STROKE=3     # outline thickness

# Text positioning (tweak these to raise/lower captions)
TOP_Y=15      # smaller = higher on screen (raised top text)
BOTTOM_Y=75   # subtracted from h; smaller value = larger y = lower on screen (lowered bottom text)

# Final scale. -2 on the height ensures the result is divisible by 2
# (required by libx264 when using -pix_fmt yuv420p).
SCALE="scale=$WIDTH:-2:flags=lanczos"

# Get a good font (respects 7th arg + FONT env + auto-detect)
FONT="$(detect_font "$FONT_ARG")"
info "Using font: $FONT"

# Safe temp files (auto-cleaned on exit or Ctrl-C)
# Use make_temp_name for the yt-dlp target so we don't pre-create an empty file.
# yt-dlp has "already downloaded" logic that can skip if a 0-byte placeholder exists.
CLIP_SRC="$(make_temp_name --ext mp4)"
CLIP_CLEAN="$(make_temp_file --ext mp4)"
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

# ---------- 2) Clean re-encode of the already-sectioned clip
# (yt-dlp --download-sections already extracted the time range into a short file
# whose timeline starts near 0; re-applying the original $START/$END would seek
# past the end of the clip and produce an empty file.)
info "Preparing clean clip for captioning…"
ffmpeg -y -i "$CLIP_SRC" \
       -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
       -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
       -c:a aac -b:a 192k \
       "$CLIP_CLEAN"

[[ -s "$CLIP_CLEAN" ]] || die "Clean prepare pass produced an empty file for $ID ($START-$END)."

# ---------- 3) Build drawtext filters using textfile (arbitrary text safe) --
# This completely avoids the nightmare of escaping colons, commas, quotes etc.
DT="drawtext=fontfile=$FONT:textfile=$TOP_TXT:fontcolor=white:borderw=$STROKE:bordercolor=black@1:fontsize=$SIZE:x=(w-text_w)/2:y=$TOP_Y,
    drawtext=fontfile=$FONT:textfile=$BOT_TXT:fontcolor=white:borderw=$STROKE:bordercolor=black@1:fontsize=$SIZE:x=(w-text_w)/2:y=h-$BOTTOM_Y"

# ---------- 4) branch: GIF or MP4 ------------------------------------------
if [[ "$TYPE" == "gif" ]]; then
  info "Generating palette…"
  ffmpeg -y -i "$CLIP_CLEAN" -vf "fps=$FPS,$SCALE,$DT,palettegen" palette.png

  info "Creating GIF…"
  ffmpeg -y -i "$CLIP_CLEAN" -i palette.png -lavfi \
         "fps=$FPS,$SCALE,$DT,paletteuse=dither=floyd_steinberg" \
         -loop 0 "$OUT"
  rm -f palette.png
else
  info "Creating MP4…"
  ffmpeg -y -i "$CLIP_CLEAN" -vf "$SCALE,$DT" \
         -c:v libx264 -crf 23 -preset slow -movflags +faststart \
         -pix_fmt yuv420p "$OUT"
fi

success "Saved $OUT"
