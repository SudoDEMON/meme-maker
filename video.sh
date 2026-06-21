#!/usr/bin/env bash
# video.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Download video clips, or combine local GIF/MP4/WebM media with audio.
#
# Usage: npm run video <source> <start> [end] [output.(mp4|webm)]
#        ./video.sh <source> <start> [end] [output.(mp4|webm)]
#        ./video.sh combine <input.(gif|mp4|webm)> <audio> [output.(mp4|webm)]
#
# Examples:
#   ./video.sh O0Dgtar0zB4 0:00 0:20 boom_headshot_vid.mp4
#   ./video.sh /home/void/Projects/meme-maker/boom_headshot_vid.mp4 /home/void/Projects/meme-maker/SPVCEODYSSEY_20sec.mp3
#
# Environment: MM_DEBUG=1

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

show_video_help() {
  cat <<'EOF'
Usage:
  ./video.sh <youtube-id-or-url> <start> [end] [output.(mp4|webm)]
  ./video.sh combine <input.(gif|mp4|webm)> <audio> [output.(mp4|webm)]
  ./video.sh <input.(gif|mp4|webm)> <audio> [output.(mp4|webm)]

Examples:
  ./video.sh O0Dgtar0zB4 0:00 0:20 boom_headshot_vid.mp4
  ./video.sh O0Dgtar0zB4 0:00 boom_headshot_full.mp4
  ./video.sh /home/void/Projects/meme-maker/boom_headshot_vid.mp4 /home/void/Projects/meme-maker/SPVCEODYSSEY_20sec.mp3

Downloads a trimmed clip using yt-dlp + a clean ffmpeg pass.
Source can be a YouTube ID, YouTube URL, or another URL supported by yt-dlp.
Leave end blank/omitted to download from start to the end of the video.
If no output is given, defaults to videos/<source-stem>.mp4 (creates the dir).
Combine mode creates an MP4/WebM from local GIF/MP4/WebM video plus audio.
GIF inputs loop to the audio length; MP4/WebM inputs stop at the shorter stream.
If combine output is omitted, defaults to videos/<input-stem>-with-audio.mp4.
Custom output names may be given with or without .mp4/.webm.
Requires: yt-dlp, ffmpeg for downloads; ffmpeg/ffprobe for combine mode.
EOF
}

ensure_parent_dir() {
  local out=$1
  local d
  d="$(dirname "$out")"
  [[ "$d" != "." ]] && mkdir -p "$d"
}

normalize_video_output() {
  local out=$1
  case "$out" in
    *.mp4|*.MP4|*.webm|*.WEBM) ;;
    *) out="${out}.mp4" ;;
  esac
  ensure_parent_dir "$out"
  printf '%s\n' "$out"
}

video_ext() {
  local out=$1
  local ext
  ext="$(printf '%s' "${out##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    webm) printf 'webm\n' ;;
    *) printf 'mp4\n' ;;
  esac
}

default_combined_output() {
  local media=$1
  local stem
  mkdir -p videos
  stem="$(basename "$media")"
  stem="${stem%.*}"
  printf 'videos/%s-with-audio.mp4\n' "$stem"
}

combine_media_audio() {
  local media=$1
  local audio=$2
  local out=${3:-}

  [[ -f "$media" ]] || die "Input media not found: $media"
  [[ -f "$audio" ]] || die "Input audio not found: $audio"

  case "$media" in
    *.gif|*.GIF|*.mp4|*.MP4|*.webm|*.WEBM) ;;
    *) die "Combine input must be a .gif, .mp4, or .webm file: $media" ;;
  esac

  if [[ -z "$out" ]]; then
    out="$(default_combined_output "$media")"
  else
    out="$(normalize_video_output "$out")"
  fi

  check_deps ffmpeg ffprobe

  info "Combining $media + $audio → $out …"

  local ext
  ext="$(video_ext "$out")"

  case "$media" in
    *.gif|*.GIF)
      local audio_duration
      audio_duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$audio")"
      [[ -n "$audio_duration" ]] || die "Could not determine audio duration: $audio"

      if [[ "$ext" == "webm" ]]; then
        ffmpeg -y -stream_loop -1 -i "$media" -i "$audio" \
               -t "$audio_duration" \
               -map 0:v:0 -map 1:a:0 \
               -vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
               -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
               -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
               -pix_fmt yuv420p -c:a libopus -b:a 128k \
               "$out"
      else
        ffmpeg -y -stream_loop -1 -i "$media" -i "$audio" \
               -t "$audio_duration" \
               -map 0:v:0 -map 1:a:0 \
               -vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
               -c:a aac -b:a 192k -movflags +faststart \
               "$out"
      fi
      ;;
    *.mp4|*.MP4|*.webm|*.WEBM)
      if [[ "$ext" == "webm" ]]; then
        ffmpeg -y -i "$media" -i "$audio" \
               -map 0:v:0 -map 1:a:0 \
               -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
               -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
               -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
               -pix_fmt yuv420p -c:a libopus -b:a 128k -shortest \
               "$out"
      else
        ffmpeg -y -i "$media" -i "$audio" \
               -map 0:v:0 -map 1:a:0 \
               -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
               -c:a aac -b:a 192k -shortest -movflags +faststart \
               "$out"
      fi
      ;;
  esac

  success "Saved $out"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -eq 0 ]]; then
  show_video_help
  exit 0
fi

if [[ "${1:-}" == "combine" ]]; then
  [[ $# -ge 3 && $# -le 4 ]] || die "Usage: ./video.sh combine <input.(gif|mp4|webm)> <audio> [output.(mp4|webm)]"
  combine_media_audio "$2" "$3" "${4:-}"
  exit 0
fi

if [[ $# -ge 2 && $# -le 3 && -f "$1" && -f "$2" ]]; then
  combine_media_audio "$1" "$2" "${3:-}"
  exit 0
fi

if [[ $# -lt 2 || $# -gt 4 ]]; then
  show_video_help
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
  mkdir -p videos
  OUT="videos/$(source_output_stem "$SOURCE").mp4"
else
  OUT="$(normalize_video_output "$OUT_ARG")"
fi

check_deps yt-dlp ffmpeg

END_LABEL="$(section_end_label "$END")"
SECTION_RANGE="$(yt_dlp_section_range "$START" "$END")"

if needs_yt_dlp_section "$START" "$END"; then
  info "Grabbing $START → $END_LABEL from $SOURCE …"
else
  info "Grabbing full video from $SOURCE …"
fi

SRC="$(make_temp_name --ext mp4)"
YT_ARGS=(-f "bv*[ext=mp4]+ba/b[ext=mp4]/bv*+ba/best" --merge-output-format mp4 --force-overwrites -o "$SRC")
if needs_yt_dlp_section "$START" "$END"; then
  YT_ARGS+=(--download-sections "$SECTION_RANGE" --force-keyframes-at-cuts)
fi
YT_ARGS+=("$(yt_dlp_source_url "$SOURCE")")
yt-dlp "${YT_ARGS[@]}"

# yt-dlp can occasionally write a sibling with the ext appended; pick the real file if needed.
if [[ ! -s "$SRC" && -s "$SRC.mp4" ]]; then
  register_temp_path "$SRC.mp4"
  SRC="$SRC.mp4"
fi
[[ -s "$SRC" ]] || die "yt-dlp produced no usable media for $SOURCE ($START-$END_LABEL). Try a different source or run with MM_DEBUG=1."

# Clean re-encode of the already-sectioned clip (yt-dlp already extracted
# the requested range; the resulting file is short with timeline ~0).
if [[ "$(video_ext "$OUT")" == "webm" ]]; then
  ffmpeg -y -i "$SRC" \
         -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
         -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
         -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
         -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
         -pix_fmt yuv420p -c:a libopus -b:a 128k \
         "$OUT"
else
  ffmpeg -y -i "$SRC" \
         -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
         -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
         -c:a aac -b:a 192k -movflags +faststart \
         "$OUT"
fi

success "Saved $OUT"
