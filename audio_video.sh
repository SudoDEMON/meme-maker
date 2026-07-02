#!/usr/bin/env bash
# audio_video.sh ──────────────────────────────────────────────────────────────
# Combine a local or yt-dlp-supported video source with a local audio file.
#
# Usage:
#   ./audio_video.sh <source-file-or-url-or-youtube-id> <start> [end] <audio-file> <output.(mp4|webm)>

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

show_audio_video_help() {
  cat <<'EOF'
Usage:
  ./audio_video.sh <source-file-or-url-or-youtube-id> <start> [end] <audio-file> <output.(mp4|webm)>

Examples:
  ./audio_video.sh O0Dgtar0zB4 0:00 0:20 Audio/sting.mp3 videos/clip-with-audio.mp4
  ./audio_video.sh videos/input.mp4 0:05 "" Audio/sting.mp3 videos/input-with-audio.webm

Leave end blank to use everything from the start time through the end.
Requires: yt-dlp for remote sources, ffmpeg and ffprobe.
EOF
}

validate_output_type() {
  case "${1##*.}" in
    mp4|MP4|webm|WEBM) ;;
    *) die "Output must end in .mp4 or .webm" ;;
  esac
}

ensure_parent_dir() {
  local out=$1
  local d
  d="$(dirname "$out")"
  [[ "$d" != "." ]] && mkdir -p "$d"
}

append_trim_args() {
  local start=$1
  local end=$2
  TRIM_ARGS=()
  if ! is_zero_time "$start"; then
    TRIM_ARGS+=(-ss "$start")
  fi
  if [[ -n "$end" && "${end,,}" != "inf" ]]; then
    TRIM_ARGS+=(-to "$end")
  fi
}

download_remote_video() {
  local source=$1
  local start=$2
  local end=$3
  local src end_label section_range

  check_deps yt-dlp
  src="$(make_temp_name --ext mp4)"
  end_label="$(section_end_label "$end")"
  section_range="$(yt_dlp_section_range "$start" "$end")"

  local -a yt_args
  yt_args=("${MM_YTDLP_ARGS[@]}" -f "bv*[ext=mp4]+ba/b[ext=mp4]/bv*+ba/best" --merge-output-format mp4 --force-overwrites -o "$src")
  if needs_yt_dlp_section "$start" "$end"; then
    info "Downloading section $start -> $end_label from $source..." >&2
    yt_args+=(--download-sections "$section_range" --force-keyframes-at-cuts)
  else
    info "Downloading full source from $source..." >&2
  fi
  yt_args+=("$(yt_dlp_source_url "$source")")
  yt-dlp "${yt_args[@]}" >&2

  if [[ ! -s "$src" && -s "$src.mp4" ]]; then
    register_temp_path "$src.mp4"
    src="$src.mp4"
  fi

  [[ -s "$src" ]] || die "yt-dlp produced no usable media for $source ($start-$end_label). Try a different source or run with MM_DEBUG=1."
  printf '%s\n' "$src"
}

prepare_local_video() {
  local source=$1
  local start=$2
  local end=$3
  local prepared

  append_trim_args "$start" "$end"
  if ((${#TRIM_ARGS[@]} == 0)); then
    printf '%s\n' "$source"
    return
  fi

  prepared="$(make_temp_file --ext mp4)"
  info "Preparing local clip..." >&2
  ffmpeg -y -i "$source" "${TRIM_ARGS[@]}" \
         -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
         -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
         -an "$prepared" >&2
  [[ -s "$prepared" ]] || die "Prepared local clip is empty: $source"
  printf '%s\n' "$prepared"
}

combine_media_audio() {
  local media=$1
  local audio=$2
  local out=$3
  local ext audio_duration

  ensure_parent_dir "$out"
  ext="$(printf '%s' "${out##*.}" | tr '[:upper:]' '[:lower:]')"

  case "$media" in
    *.gif|*.GIF)
      audio_duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$audio")"
      [[ -n "$audio_duration" ]] || die "Could not determine audio duration: $audio"
      if [[ "$ext" == "webm" ]]; then
        ffmpeg -y -stream_loop -1 -i "$media" -i "$audio" \
               -t "$audio_duration" -map 0:v:0 -map 1:a:0 \
               -vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
               -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
               -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
               -pix_fmt yuv420p -c:a libopus -b:a 128k "$out"
      else
        ffmpeg -y -stream_loop -1 -i "$media" -i "$audio" \
               -t "$audio_duration" -map 0:v:0 -map 1:a:0 \
               -vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
               -c:a aac -b:a 192k -movflags +faststart "$out"
      fi
      ;;
    *)
      if [[ "$ext" == "webm" ]]; then
        ffmpeg -y -i "$media" -i "$audio" \
               -map 0:v:0 -map 1:a:0 \
               -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
               -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
               -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
               -pix_fmt yuv420p -c:a libopus -b:a 128k -shortest "$out"
      else
        ffmpeg -y -i "$media" -i "$audio" \
               -map 0:v:0 -map 1:a:0 \
               -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
               -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
               -c:a aac -b:a 192k -shortest -movflags +faststart "$out"
      fi
      ;;
  esac
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_audio_video_help
  exit 0
fi

if [[ $# -eq 4 ]]; then
  SOURCE_ARG=$1
  START=$2
  END=""
  AUDIO=$3
  OUT=$4
elif [[ $# -eq 5 ]]; then
  SOURCE_ARG=$1
  START=$2
  END=${3:-}
  AUDIO=$4
  OUT=$5
else
  show_audio_video_help
  exit 1
fi

[[ -f "$AUDIO" ]] || die "Input audio not found: $AUDIO"
validate_output_type "$OUT"
check_deps ffmpeg ffprobe

if [[ -f "$SOURCE_ARG" ]]; then
  MEDIA="$(prepare_local_video "$SOURCE_ARG" "$START" "$END")"
else
  MEDIA="$(download_remote_video "$SOURCE_ARG" "$START" "$END")"
fi

combine_media_audio "$MEDIA" "$AUDIO" "$OUT"
success "Saved $OUT"
