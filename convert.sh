#!/usr/bin/env bash
# convert.sh ─────────────────────────────────────────────────────────────────
# Download or convert a source into GIF, MP3, MP4, or WebM.
#
# Usage:
#   ./convert.sh <source-file-or-yt-dlp-url-or-youtube-id> <start> [end] <gif|mp3|mp4|webm> <output>
#
# Source can be a local media file, a YouTube ID, a YouTube URL, or another URL
# supported by the installed yt-dlp.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

show_convert_help() {
  cat <<'EOF'
Usage:
  ./convert.sh <source-file-or-url-or-youtube-id> <start> [end] <gif|mp3|mp4|webm> <output>

Examples:
  ./convert.sh O0Dgtar0zB4 0:00 0:20 mp4 videos/clip.mp4
  ./convert.sh https://youtu.be/O0Dgtar0zB4 0:00 "" gif gifs/clip.gif
  ./convert.sh videos/input.mp4 0:05 0:10 webm videos/input-cut.webm

Leave end blank to use everything from the start time through the end.
Requires: ffmpeg, and yt-dlp for remote sources.
EOF
}

validate_type() {
  case "${1:-}" in
    gif|mp3|mp4|webm) ;;
    *) die "TYPE must be 'gif', 'mp3', 'mp4', or 'webm'" ;;
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

download_remote_source() {
  local source=$1
  local start=$2
  local end=$3
  local type=$4
  local src end_label section_range

  check_deps yt-dlp
  end_label="$(section_end_label "$end")"
  section_range="$(yt_dlp_section_range "$start" "$end")"

  if [[ "$type" == "mp3" ]]; then
    src="$(make_temp_name --ext mp3)"
    YT_ARGS=("${MM_YTDLP_ARGS[@]}" -x --audio-format mp3 --audio-quality 0 --force-overwrites -o "$src")
  else
    src="$(make_temp_name --ext mp4)"
    YT_ARGS=("${MM_YTDLP_ARGS[@]}" -f "bv*[ext=mp4]+ba/b[ext=mp4]/bv*+ba/best" --merge-output-format mp4 --force-overwrites -o "$src")
  fi

  if needs_yt_dlp_section "$start" "$end"; then
    info "Downloading section $start -> $end_label from $source..." >&2
    YT_ARGS+=(--download-sections "$section_range" --force-keyframes-at-cuts)
  else
    info "Downloading full source from $source..." >&2
  fi

  YT_ARGS+=("$(yt_dlp_source_url "$source")")
  yt-dlp "${YT_ARGS[@]}" >&2

  if [[ "$type" == "mp3" && ! -s "$src" && -s "$src.mp3" ]]; then
    register_temp_path "$src.mp3"
    src="$src.mp3"
  elif [[ "$type" != "mp3" && ! -s "$src" && -s "$src.mp4" ]]; then
    register_temp_path "$src.mp4"
    src="$src.mp4"
  fi

  [[ -s "$src" ]] || die "yt-dlp produced no usable media for $source ($start-$end_label). Try a different source or run with MM_DEBUG=1."
  printf '%s\n' "$src"
}

encode_output() {
  local input=$1
  local out=$2
  local type=$3
  shift 3
  local -a trim_args=("$@")
  local filter palette
  local width=${MM_WIDTH:-720}
  local fps=${MM_FPS:-15}

  ensure_parent_dir "$out"
  check_deps ffmpeg

  case "$type" in
    gif)
      palette="$(make_temp_file --ext png)"
      filter="fps=$fps,scale=$width:-2:flags=lanczos"
      info "Generating palette..."
      ffmpeg -y -i "$input" "${trim_args[@]}" -vf "$filter,palettegen" -frames:v 1 -update 1 "$palette"
      info "Creating GIF..."
      ffmpeg -y -i "$input" -i "$palette" "${trim_args[@]}" -lavfi "$filter,paletteuse=dither=floyd_steinberg" -loop 0 "$out"
      ;;
    mp3)
      info "Creating MP3..."
      ffmpeg -y -i "$input" "${trim_args[@]}" -vn -c:a libmp3lame -q:a 0 "$out"
      ;;
    mp4)
      info "Creating MP4..."
      ffmpeg -y -i "$input" "${trim_args[@]}" \
             -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
             -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
             -c:a aac -b:a 192k -movflags +faststart \
             "$out"
      ;;
    webm)
      info "Creating WebM..."
      ffmpeg -y -i "$input" "${trim_args[@]}" \
             -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
             -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
             -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
             -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
             -pix_fmt yuv420p -c:a libopus -b:a 128k \
             "$out"
      ;;
  esac
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_convert_help
  exit 0
fi

if [[ $# -eq 4 ]]; then
  SOURCE_ARG=$1
  START=$2
  END=""
  TYPE=$3
  OUT=$4
elif [[ $# -eq 5 ]]; then
  SOURCE_ARG=$1
  START=$2
  END=${3:-}
  TYPE=$4
  OUT=$5
else
  show_convert_help
  exit 1
fi

validate_type "$TYPE"

if [[ -f "$SOURCE_ARG" ]]; then
  INPUT="$SOURCE_ARG"
  append_trim_args "$START" "$END"
else
  INPUT="$(download_remote_source "$SOURCE_ARG" "$START" "$END" "$TYPE")"
  TRIM_ARGS=()
fi

encode_output "$INPUT" "$OUT" "$TYPE" "${TRIM_ARGS[@]}"
success "Saved $OUT"
