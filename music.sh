#!/usr/bin/env bash
# music.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Extract a clean trimmed audio clip (mp3) from YouTube.
#
# Usage: npm run music <source> <start> [end] [output.mp3]
#        ./music.sh <source> <start> [end] [output.mp3]
#
# Examples:
#   ./music.sh vXZu0wT1kUg 1:36 1:56 SPVCEODYSSEY_20sec.mp3
#
# Environment: MM_DEBUG=1

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 || $# -gt 4 ]]; then
  cat <<'EOF'
Usage:
  ./music.sh <youtube-id-or-url> <start> [end] [output.mp3]

Examples:
  ./music.sh vXZu0wT1kUg 1:36 1:56 SPVCEODYSSEY_20sec.mp3
  ./music.sh vXZu0wT1kUg 0:00 full-track.mp3

Extracts audio using yt-dlp + ffmpeg for reliable trimming.
Source can be a YouTube ID, YouTube URL, or another URL supported by yt-dlp.
Leave end blank/omitted to download from start to the end of the video.
If no output is given, defaults to Audio/<source-stem>.mp3 (creates the dir).
Requires: yt-dlp, ffmpeg
EOF
  exit 0
fi

SOURCE="$1"
START="$2"
END=""
OUT_ARG=""

if [[ $# -ge 3 ]]; then
  if [[ $# -eq 3 ]] && ! looks_like_time "$3"; then
    OUT_ARG="$3"
  else
    END="${3:-}"
  fi
fi

if [[ $# -eq 4 ]]; then
  OUT_ARG="$4"
fi

if [[ -z "$OUT_ARG" ]]; then
  mkdir -p Audio
  OUT="Audio/$(source_output_stem "$SOURCE").mp3"
else
  OUT="$OUT_ARG"
  d="$(dirname "$OUT")"
  [[ "$d" != "." ]] && mkdir -p "$d"
fi

check_deps yt-dlp ffmpeg

END_LABEL="$(section_end_label "$END")"
SECTION_RANGE="$(yt_dlp_section_range "$START" "$END")"

if needs_yt_dlp_section "$START" "$END"; then
  info "Extracting audio $START → $END_LABEL from $SOURCE …"
else
  info "Extracting full audio from $SOURCE …"
fi

SRC="$(make_temp_name --ext mp3)"
YT_ARGS=(-x --audio-format mp3 --audio-quality 0 --force-overwrites -o "$SRC")
if needs_yt_dlp_section "$START" "$END"; then
  YT_ARGS+=(--download-sections "$SECTION_RANGE" --force-keyframes-at-cuts)
fi
YT_ARGS+=("$(yt_dlp_source_url "$SOURCE")")
yt-dlp "${YT_ARGS[@]}"

# yt-dlp can occasionally write a sibling with the ext appended; pick the real file if needed.
if [[ ! -s "$SRC" && -s "$SRC.mp3" ]]; then
  register_temp_path "$SRC.mp3"
  SRC="$SRC.mp3"
fi
[[ -s "$SRC" ]] || die "yt-dlp produced no usable audio for $SOURCE ($START-$END_LABEL). Try a different source or run with MM_DEBUG=1."

# Clean re-encode of the already-sectioned clip (yt-dlp already extracted
# the requested range; the resulting file is short with timeline ~0).
ffmpeg -y -i "$SRC" \
       -c:a libmp3lame -q:a 0 \
       "$OUT"

success "Saved $OUT"
