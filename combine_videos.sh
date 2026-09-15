#!/usr/bin/env bash
# combine_videos.sh ─────────────────────────────────────────────────────
# Append two or more local video files in the order given.
#
# Usage:
#   ./combine_videos.sh <input1> <input2> [input3 ...] <output.(mp4|webm)>

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

show_combine_videos_help() {
  cat <<'EOF'
Usage:
  ./combine_videos.sh <input1> <input2> [input3 ...] <output.(mp4|webm)>

Examples:
  ./combine_videos.sh videos/part-1.mp4 videos/part-2.mp4 videos/combined.mp4
  ./combine_videos.sh intro.webm main.webm outro.webm videos/full-video.webm

Inputs are appended in the order given. Compatible streams are copied without
quality loss. Mismatched clips are automatically resized/padded to the first
clip, converted to its frame rate, and re-encoded to the selected output type.

Requires: ffmpeg and ffprobe.
EOF
}

ensure_parent_dir() {
  local out=$1
  local dir
  dir="$(dirname "$out")"
  [[ "$dir" != "." ]] && mkdir -p "$dir"
}

absolute_path() {
  local value=$1
  local dir base
  dir="$(dirname "$value")"
  base="$(basename "$value")"
  (cd -P "$dir" && printf '%s/%s\n' "$PWD" "$base")
}

probe_stream_count() {
  local input=$1
  local selector=$2
  ffprobe -v error -select_streams "$selector" \
    -show_entries stream=index -of csv=p=0 "$input" | sed '/^$/d' | wc -l | tr -d ' '
}

probe_video_signature() {
  ffprobe -v error -select_streams v:0 \
    -show_entries stream=codec_name,profile,level,width,height,pix_fmt,r_frame_rate \
    -of compact=p=0:nk=1 "$1"
}

probe_audio_signature() {
  ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,profile,sample_rate,channels,channel_layout \
    -of compact=p=0:nk=1 "$1"
}

probe_video_time_base() {
  probe_value "$1" v:0 time_base
}

probe_value() {
  local input=$1
  local selector=$2
  local entries=$3
  ffprobe -v error -select_streams "$selector" \
    -show_entries "stream=$entries" -of default=noprint_wrappers=1:nokey=1 "$input" | head -n 1
}

probe_duration() {
  ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$1" | head -n 1
}

copy_codecs_fit_output() {
  local ext=$1
  local video_codec=$2
  local audio_codec=$3

  case "$ext" in
    mp4)
      [[ "$video_codec" =~ ^(h264|hevc|av1|mpeg4)$ ]] || return 1
      [[ -z "$audio_codec" || "$audio_codec" =~ ^(aac|ac3|eac3|mp3|alac)$ ]]
      ;;
    webm)
      [[ "$video_codec" =~ ^(vp8|vp9|av1)$ ]] || return 1
      [[ -z "$audio_codec" || "$audio_codec" =~ ^(opus|vorbis)$ ]]
      ;;
    *)
      return 1
      ;;
  esac
}

streams_are_copy_compatible() {
  local ext=$1
  shift
  local first=$1
  local first_video first_audio first_time_base video audio time_base input video_count audio_count

  first_video="$(probe_video_signature "$first")"
  [[ -n "$first_video" ]] || return 1
  first_audio="$(probe_audio_signature "$first")"
  first_time_base="$(probe_video_time_base "$first")"
  copy_codecs_fit_output "$ext" "${first_video%%|*}" "${first_audio%%|*}" || return 1

  for input in "$@"; do
    video_count="$(probe_stream_count "$input" v)"
    audio_count="$(probe_stream_count "$input" a)"
    [[ "$video_count" == "1" && "$audio_count" -le 1 ]] || return 1

    video="$(probe_video_signature "$input")"
    audio="$(probe_audio_signature "$input")"
    [[ "$video" == "$first_video" && "$audio" == "$first_audio" ]] || return 1
    if [[ "$ext" != "mp4" ]]; then
      time_base="$(probe_video_time_base "$input")"
      [[ "$time_base" == "$first_time_base" ]] || return 1
    fi
  done
}

write_concat_list() {
  local list=$1
  shift
  local input escaped

  : >"$list"
  for input in "$@"; do
    escaped=${input//\'/\'\\\'\'}
    printf "file '%s'\n" "$escaped" >>"$list"
  done
}

copy_concat() {
  local out=$1
  shift
  local -a inputs=("$@")
  local -a prepared_inputs=()
  local ext=${out##*.}
  local first_time_base timescale input input_time_base normalized list

  ext=${ext,,}
  if [[ "$ext" == "mp4" ]]; then
    first_time_base="$(probe_video_time_base "${inputs[0]}")"
    if [[ "$first_time_base" =~ ^1/([1-9][0-9]*)$ ]]; then
      timescale=${BASH_REMATCH[1]}
      for input in "${inputs[@]}"; do
        input_time_base="$(probe_video_time_base "$input")"
        if [[ "$input_time_base" == "$first_time_base" ]]; then
          prepared_inputs+=("$input")
          continue
        fi

        normalized="$(make_temp_file --ext mp4)"
        info "Normalizing MP4 track time base for $(basename "$input") (lossless remux)."
        ffmpeg -y -i "$input" -map 0:v:0 -map '0:a:0?' -map_metadata 0 \
          -c copy -video_track_timescale "$timescale" "$normalized"
        [[ -s "$normalized" ]] || return 1
        prepared_inputs+=("$normalized")
      done
    fi
  fi

  ((${#prepared_inputs[@]} > 0)) || prepared_inputs=("${inputs[@]}")
  list="$(make_temp_file --ext txt)"
  write_concat_list "$list" "${prepared_inputs[@]}"

  local -a args=(-y -f concat -safe 0 -i "$list" -map 0:v:0 -map '0:a:0?' -c copy)
  [[ "$ext" == "mp4" ]] && args+=(-movflags +faststart)
  ffmpeg "${args[@]}" "$out"
}

normalized_concat() {
  local out=$1
  local ext=$2
  shift 2
  local -a inputs=("$@")
  local first=${inputs[0]}
  local width height fps input duration audio_count filter="" concat_inputs=""
  local any_audio=0
  local index
  local -a input_args=()

  width="$(probe_value "$first" v:0 width)"
  height="$(probe_value "$first" v:0 height)"
  fps="$(probe_value "$first" v:0 r_frame_rate)"
  [[ "$width" =~ ^[0-9]+$ && "$height" =~ ^[0-9]+$ ]] || die "Could not determine the first clip's resolution."
  width=$((width - width % 2))
  height=$((height - height % 2))
  ((width > 0 && height > 0)) || die "The first clip's resolution is too small to normalize."
  [[ -n "$fps" && "$fps" != "0/0" ]] || fps=30

  for input in "${inputs[@]}"; do
    input_args+=(-i "$input")
    if [[ "$(probe_stream_count "$input" a)" -gt 0 ]]; then
      any_audio=1
    fi
  done

  for index in "${!inputs[@]}"; do
    input=${inputs[$index]}
    duration="$(probe_duration "$input")"
    [[ "$duration" =~ ^[0-9]+([.][0-9]+)?$ ]] || die "Could not determine input duration: $input"

    filter+="[$index:v:0]scale=$width:$height:force_original_aspect_ratio=decrease,"
    filter+="pad=$width:$height:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=$fps,"
    filter+="format=yuv420p,trim=duration=$duration,setpts=PTS-STARTPTS[v$index];"

    if ((any_audio)); then
      audio_count="$(probe_stream_count "$input" a)"
      if [[ "$audio_count" -gt 0 ]]; then
        filter+="[$index:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
        filter+="apad,atrim=duration=$duration,asetpts=PTS-STARTPTS[a$index];"
      else
        filter+="anullsrc=r=48000:cl=stereo,atrim=duration=$duration,asetpts=PTS-STARTPTS[a$index];"
      fi
      concat_inputs+="[v$index][a$index]"
    else
      concat_inputs+="[v$index]"
    fi
  done

  if ((any_audio)); then
    filter+="${concat_inputs}concat=n=${#inputs[@]}:v=1:a=1[v][a]"
  else
    filter+="${concat_inputs}concat=n=${#inputs[@]}:v=1:a=0[v]"
  fi

  local -a args=(-y "${input_args[@]}" -filter_complex "$filter" -map '[v]')
  ((any_audio)) && args+=(-map '[a]')

  if [[ "$ext" == "webm" ]]; then
    args+=(-c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0
      -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" -row-mt 1 -threads 0
      -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" -pix_fmt yuv420p)
    ((any_audio)) && args+=(-c:a libopus -b:a 128k)
  else
    args+=(-c:v libx264 -preset "${MM_COMBINE_PRESET:-veryfast}"
      -crf "${MM_COMBINE_CRF:-18}" -pix_fmt yuv420p)
    ((any_audio)) && args+=(-c:a aac -b:a 192k)
    args+=(-movflags +faststart)
  fi

  ffmpeg "${args[@]}" "$out"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  show_combine_videos_help
  exit 0
fi

if (($# < 3)); then
  show_combine_videos_help >&2
  exit 1
fi

OUT=${!#}
INPUTS=("${@:1:$#-1}")
EXT=${OUT##*.}
EXT=${EXT,,}
case "$EXT" in
  mp4|webm) ;;
  *) die "Output must end in .mp4 or .webm" ;;
esac

check_deps ffmpeg ffprobe
ensure_parent_dir "$OUT"
OUT_ABSOLUTE="$(absolute_path "$OUT")"

for INPUT in "${INPUTS[@]}"; do
  [[ -f "$INPUT" ]] || die "Input video not found: $INPUT"
  [[ -n "$(probe_video_signature "$INPUT")" ]] || die "Input has no readable video stream: $INPUT"
  [[ "$(absolute_path "$INPUT")" != "$OUT_ABSOLUTE" ]] || die "Output must not overwrite an input: $INPUT"
  [[ ! -e "$OUT" || ! "$OUT" -ef "$INPUT" ]] || die "Output must not overwrite an input: $INPUT"
done

if streams_are_copy_compatible "$EXT" "${INPUTS[@]}"; then
  info "Compatible streams detected; combining without re-encoding."
  if copy_concat "$OUT" "${INPUTS[@]}"; then
    [[ -s "$OUT" ]] || die "Combined output is empty: $OUT"
    success "Saved $OUT (lossless stream copy)"
    exit 0
  fi
  warn "Stream-copy concat failed; retrying with normalized re-encoding."
else
  info "Input streams differ; normalizing to the first clip before combining."
fi

normalized_concat "$OUT" "$EXT" "${INPUTS[@]}"
[[ -s "$OUT" ]] || die "Combined output is empty: $OUT"
success "Saved $OUT (normalized re-encode)"
