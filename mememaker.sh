#!/usr/bin/env bash
# mememaker.sh ---------------------------------------------------------------
# Turn a YouTube slice or local media file into a captioned GIF/MP4/WebM meme.
#
# Run with no arguments for an interactive menu, or -h/--help for CLI usage.
# Environment variables: FONT=...  MM_DEBUG=1  MM_TOP_Y=15  MM_BOTTOM_Y=75
# ---------------------------------------------------------------------------

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

TOP_Y="${MM_TOP_Y:-15}"
BOTTOM_Y="${MM_BOTTOM_Y:-75}"
WIDTH="${MM_WIDTH:-720}"
FPS="${MM_FPS:-15}"
SIZE="${MM_FONT_SIZE:-50}"
STROKE="${MM_STROKE:-3}"
NO_TEXT=0
CAPTION_LOCAL=0

show_mememaker_help() {
  cat <<'EOF'
Usage:
  ./mememaker.sh
  ./mememaker.sh [options] <youtube-id> <start> [end] <gif|mp4|webm> "<top text>" "<bottom text>" [custom-name] [font-path]
  ./mememaker.sh --no-text [options] <youtube-id> <start> [end] <gif|mp4|webm> [custom-name]
  ./mememaker.sh --caption-local [options] <input.(gif|mp4|webm)> <output.(gif|mp4|webm)> "<top text>" "<bottom text>" [font-path]

Options:
  --no-text             Skip captions. Also accepts "" "" as empty captions.
  --top-y <px>          Top caption y offset from the top. Default: 15
  --bottom-y <px>       Bottom caption offset from the bottom. Default: 75
  --font-size <px>      Caption font size. Default: 50
  --width <px>          Output width. Default: 720
  --caption-local       Add captions to a local GIF/MP4/WebM instead of downloading.
  -h, --help            Show this help.

Examples:
  ./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_text.gif
  ./mememaker.sh O0Dgtar0zB4 0:00 gif "FULL" "VIDEO" boom_headshot_full.gif
  ./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "" "" boom_headshot_no_text.gif
  ./mememaker.sh --no-text O0Dgtar0zB4 0:00 0:20 webm boom_headshot
  ./mememaker.sh --top-y 40 --bottom-y 110 O0Dgtar0zB4 0:00 0:20 mp4 "TOP" "BOTTOM"
  ./mememaker.sh --caption-local --top-y 20 input.gif gifs/input-captioned.gif "TOP" ""

Outputs are placed in gifs/ for GIFs and videos/ for MP4/WebM unless using
--caption-local, where the output path is used exactly.
Leave end blank/omitted to download from start to the end of the video.

This script requires: yt-dlp, ffmpeg
EOF
}

lower_ext() {
  local path=$1
  printf '%s\n' "${path##*.}" | tr '[:upper:]' '[:lower:]'
}

ensure_parent_dir() {
  local out=$1
  local d
  d="$(dirname "$out")"
  [[ "$d" != "." ]] && mkdir -p "$d"
}

validate_layout_options() {
  [[ "$WIDTH" =~ ^[0-9]+$ && "$WIDTH" -gt 0 ]] || die "--width must be a positive integer: $WIDTH"
  [[ "$FPS" =~ ^[0-9]+$ && "$FPS" -gt 0 ]] || die "MM_FPS must be a positive integer: $FPS"
  [[ "$SIZE" =~ ^[0-9]+$ && "$SIZE" -gt 0 ]] || die "--font-size must be a positive integer: $SIZE"
  [[ "$STROKE" =~ ^[0-9]+$ ]] || die "MM_STROKE must be a non-negative integer: $STROKE"
  [[ "$TOP_Y" =~ ^[0-9]+$ ]] || die "--top-y must be a non-negative integer: $TOP_Y"
  [[ "$BOTTOM_Y" =~ ^[0-9]+$ ]] || die "--bottom-y must be a non-negative integer: $BOTTOM_Y"
}

validate_type() {
  local type=$1
  case "$type" in
    gif|mp4|webm) ;;
    *) die "TYPE must be 'gif', 'mp4', or 'webm'" ;;
  esac
}

is_youtube_type() {
  case "${1:-}" in
    gif|mp4|webm) return 0 ;;
    *) return 1 ;;
  esac
}

append_filter() {
  local base=$1
  local extra=$2
  if [[ -n "$extra" ]]; then
    printf '%s,%s\n' "$base" "$extra"
  else
    printf '%s\n' "$base"
  fi
}

build_caption_filter() {
  local top=$1
  local bottom=$2
  local font_arg=$3
  local font=""
  local filter=""
  local txt

  if [[ -z "$top" && -z "$bottom" ]]; then
    printf '\n'
    return
  fi

  font="$(detect_font "$font_arg")"
  info "Using font: $font" >&2

  if [[ -n "$top" ]]; then
    txt="$(write_drawtext_file "$top")"
    filter="drawtext=fontfile=$font:textfile=$txt:fontcolor=white:borderw=$STROKE:bordercolor=black@1:fontsize=$SIZE:x=(w-text_w)/2:y=$TOP_Y"
  fi

  if [[ -n "$bottom" ]]; then
    txt="$(write_drawtext_file "$bottom")"
    if [[ -n "$filter" ]]; then
      filter+=","
    fi
    filter+="drawtext=fontfile=$font:textfile=$txt:fontcolor=white:borderw=$STROKE:bordercolor=black@1:fontsize=$SIZE:x=(w-text_w)/2:y=h-$BOTTOM_Y"
  fi

  printf '%s\n' "$filter"
}

encode_media() {
  local input=$1
  local out=$2
  local type=$3
  local caption_filter=$4
  local scale_filter="scale=$WIDTH:-2:flags=lanczos"
  local filter
  local palette

  ensure_parent_dir "$out"

  case "$type" in
    gif)
      palette="$(make_temp_file --ext png)"
      filter="$(append_filter "fps=$FPS,$scale_filter" "$caption_filter")"

      info "Generating palette..."
      ffmpeg -y -i "$input" -vf "$filter,palettegen" -frames:v 1 -update 1 "$palette"

      info "Creating GIF..."
      ffmpeg -y -i "$input" -i "$palette" -lavfi \
             "$filter,paletteuse=dither=floyd_steinberg" \
             -loop 0 "$out"
      ;;
    mp4)
      filter="$(append_filter "$scale_filter" "$caption_filter")"
      info "Creating MP4..."
      ffmpeg -y -i "$input" -vf "$filter" \
             -c:v libx264 -crf 23 -preset slow -movflags +faststart \
             -pix_fmt yuv420p "$out"
      ;;
    webm)
      filter="$(append_filter "$scale_filter" "$caption_filter")"
      info "Creating WebM..."
      ffmpeg -y -i "$input" -vf "$filter" \
             -c:v libvpx-vp9 -crf "${MM_WEBM_CRF:-34}" -b:v 0 \
             -deadline good -cpu-used "${MM_WEBM_CPU_USED:-5}" \
             -row-mt 1 -threads 0 -tile-columns "${MM_WEBM_TILE_COLUMNS:-2}" \
             -pix_fmt yuv420p -c:a libopus -b:a 128k "$out"
      ;;
  esac
}

parse_optional_name_and_font() {
  CUSTOM_NAME=""
  FONT_ARG=""

  if [[ $# -ge 1 ]]; then
    local arg=$1
    if [[ -f "$arg" && "$arg" =~ \.(ttf|otf|ttc)$ ]]; then
      FONT_ARG="$arg"
    else
      CUSTOM_NAME="$arg"
    fi
  fi

  if [[ $# -ge 2 ]]; then
    FONT_ARG="$2"
  fi
}

output_for_youtube_type() {
  local id=$1
  local type=$2
  local custom_name=$3
  local out_dir stem

  if [[ "$type" == "gif" ]]; then
    out_dir="gifs"
  else
    out_dir="videos"
  fi
  mkdir -p "$out_dir"

  if [[ -n "$custom_name" ]]; then
    stem="$(basename "$custom_name")"
    stem="${stem%.*}"
  else
    stem="$id"
  fi

  printf '%s/%s.%s\n' "$out_dir" "$stem" "$type"
}

run_youtube_mode() {
  local id start end type top bottom out clip_src clip_clean caption_filter
  local section_range end_label
  local optional_start

  if (( NO_TEXT )); then
    [[ $# -ge 3 && $# -le 6 ]] || die "Usage: mememaker.sh --no-text <id> <start> [end] <gif|mp4|webm> [custom-name] [font]"
    id=$1
    start=$2
    if is_youtube_type "${3:-}"; then
      end=""
      type=$3
      optional_start=4
    else
      [[ $# -ge 4 ]] || die "Usage: mememaker.sh --no-text <id> <start> [end] <gif|mp4|webm> [custom-name] [font]"
      end=${3:-}
      type=$4
      optional_start=5
    fi
    top=""
    bottom=""
  else
    [[ $# -ge 5 && $# -le 8 ]] || die "Usage: mememaker.sh <id> <start> [end] <gif|mp4|webm> \"top\" \"bottom\" [custom-name] [font]"
    id=$1
    start=$2
    if is_youtube_type "${3:-}"; then
      end=""
      type=$3
      top=$4
      bottom=$5
      optional_start=6
    else
      [[ $# -ge 6 ]] || die "Usage: mememaker.sh <id> <start> [end] <gif|mp4|webm> \"top\" \"bottom\" [custom-name] [font]"
      end=${3:-}
      type=$4
      top=$5
      bottom=$6
      optional_start=7
    fi
  fi

  (( $# <= optional_start + 1 )) || die "Too many arguments for YouTube mode."

  validate_type "$type"
  validate_layout_options

  if (( optional_start <= $# )); then
    parse_optional_name_and_font "${@:optional_start}"
  else
    parse_optional_name_and_font
  fi

  out="$(output_for_youtube_type "$id" "$type" "$CUSTOM_NAME")"

  check_deps yt-dlp ffmpeg

  clip_src="$(make_temp_name --ext mp4)"
  clip_clean="$(make_temp_file --ext mp4)"
  caption_filter="$(build_caption_filter "$top" "$bottom" "$FONT_ARG")"
  section_range="$(yt_dlp_section_range "$start" "$end")"
  end_label="$(section_end_label "$end")"

  if needs_yt_dlp_section "$start" "$end"; then
    info "Downloading section $start -> $end_label from $id..."
  else
    info "Downloading full video from $id..."
  fi

  local -a yt_args
  yt_args=(-f "bv*[ext=mp4]+ba" --merge-output-format mp4 --force-overwrites -o "$clip_src")
  if needs_yt_dlp_section "$start" "$end"; then
    yt_args+=(--download-sections "$section_range" --force-keyframes-at-cuts)
  fi
  yt_args+=("https://youtu.be/$id")
  yt-dlp "${yt_args[@]}"

  if [[ ! -s "$clip_src" && -s "$clip_src.mp4" ]]; then
    register_temp_path "$clip_src.mp4"
    clip_src="$clip_src.mp4"
  fi
  [[ -s "$clip_src" ]] || die "yt-dlp produced no usable media for $id ($start-$end_label). Try a different video or run with MM_DEBUG=1."

  info "Preparing clean clip..."
  ffmpeg -y -i "$clip_src" \
         -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
         -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
         -c:a aac -b:a 192k \
         "$clip_clean"

  [[ -s "$clip_clean" ]] || die "Clean prepare pass produced an empty file for $id ($start-$end_label)."

  encode_media "$clip_clean" "$out" "$type" "$caption_filter"
  success "Saved $out"
}

run_caption_local_mode() {
  local input out type top bottom font_arg caption_filter

  [[ $# -ge 4 && $# -le 5 ]] || die "Usage: mememaker.sh --caption-local [options] <input.(gif|mp4|webm)> <output.(gif|mp4|webm)> \"top\" \"bottom\" [font]"

  input=$1
  out=$2
  top=$3
  bottom=$4
  font_arg="${5:-}"
  type="$(lower_ext "$out")"

  [[ -f "$input" ]] || die "Input media not found: $input"
  validate_type "$type"
  validate_layout_options
  check_deps ffmpeg

  caption_filter="$(build_caption_filter "$top" "$bottom" "$font_arg")"
  encode_media "$input" "$out" "$type" "$caption_filter"
  success "Saved $out"
}

prompt_default() {
  local label=$1
  local default=$2
  local value
  read -rp "$label [$default]: " value
  printf '%s\n' "${value:-$default}"
}

prompt_blank() {
  local label=$1
  local value
  read -rp "$label: " value
  printf '%s\n' "$value"
}

prompt_required() {
  local label=$1
  local value
  while true; do
    read -rp "$label: " value
    [[ -n "$value" ]] && { printf '%s\n' "$value"; return; }
    warn "Required."
  done
}

interactive_text_options() {
  local top_default=${1:-}
  local bottom_default=${2:-}

  TOP="$(prompt_default "Top text, blank for none" "$top_default")"
  BOT="$(prompt_default "Bottom text, blank for none" "$bottom_default")"
  TOP_Y="$(prompt_default "Top text y offset" "$TOP_Y")"
  BOTTOM_Y="$(prompt_default "Bottom text bottom offset" "$BOTTOM_Y")"
  SIZE="$(prompt_default "Font size" "$SIZE")"
  FONT_ARG="$(prompt_blank "Font path, blank for auto")"
}

interactive_download_video() {
  local id start end format out
  id="$(prompt_required "YouTube video ID")"
  start="$(prompt_default "Start time" "0:00")"
  end="$(prompt_blank "End time, blank for full video")"
  format="$(prompt_default "Format (mp4/webm)" "mp4")"
  validate_type "$format"
  [[ "$format" == "gif" ]] && die "Use Download GIF for GIF output."
  out="$(prompt_blank "Output path, blank for default")"

  if [[ -n "$out" ]]; then
    "$SCRIPT_DIR/video.sh" "$id" "$start" "$end" "$out"
  elif [[ "$format" == "webm" ]]; then
    "$SCRIPT_DIR/video.sh" "$id" "$start" "$end" "videos/${id}.webm"
  elif [[ -n "$end" ]]; then
    "$SCRIPT_DIR/video.sh" "$id" "$start" "$end"
  else
    "$SCRIPT_DIR/video.sh" "$id" "$start"
  fi
}

interactive_download_gif() {
  local id start end name
  id="$(prompt_required "YouTube video ID")"
  start="$(prompt_default "Start time" "0:00")"
  end="$(prompt_blank "End time, blank for full video")"
  name="$(prompt_blank "Output name, blank for default")"

  if [[ -n "$name" ]]; then
    run_youtube_mode "$id" "$start" "$end" gif "" "" "$name"
  else
    run_youtube_mode "$id" "$start" "$end" gif "" ""
  fi
}

interactive_download_audio() {
  local id start end out
  id="$(prompt_required "YouTube video ID")"
  start="$(prompt_default "Start time" "0:00")"
  end="$(prompt_blank "End time, blank for full video")"
  out="$(prompt_blank "Output path, blank for default")"

  if [[ -n "$out" ]]; then
    "$SCRIPT_DIR/music.sh" "$id" "$start" "$end" "$out"
  elif [[ -n "$end" ]]; then
    "$SCRIPT_DIR/music.sh" "$id" "$start" "$end"
  else
    "$SCRIPT_DIR/music.sh" "$id" "$start"
  fi
}

interactive_add_text_to_gif() {
  local input out stem
  input="$(prompt_required "Input GIF")"
  stem="$(basename "$input")"
  stem="${stem%.*}"
  out="$(prompt_default "Output GIF" "gifs/${stem}-captioned.gif")"
  interactive_text_options "" ""
  run_caption_local_mode "$input" "$out" "$TOP" "$BOT" "$FONT_ARG"
}

interactive_add_audio_to_video() {
  local media audio out
  media="$(prompt_required "Input GIF/MP4/WebM")"
  audio="$(prompt_required "Input MP3/audio")"
  out="$(prompt_blank "Output path, blank for default")"

  if [[ -n "$out" ]]; then
    "$SCRIPT_DIR/video.sh" combine "$media" "$audio" "$out"
  else
    "$SCRIPT_DIR/video.sh" combine "$media" "$audio"
  fi
}

interactive_caption_youtube() {
  local id start end type name
  id="$(prompt_required "YouTube video ID")"
  start="$(prompt_default "Start time" "0:00")"
  end="$(prompt_blank "End time, blank for full video")"
  type="$(prompt_default "Format (gif/mp4/webm)" "gif")"
  validate_type "$type"
  name="$(prompt_blank "Output name, blank for default")"
  interactive_text_options "" ""

  if [[ -n "$name" ]]; then
    run_youtube_mode "$id" "$start" "$end" "$type" "$TOP" "$BOT" "$name" "$FONT_ARG"
  else
    run_youtube_mode "$id" "$start" "$end" "$type" "$TOP" "$BOT" "" "$FONT_ARG"
  fi
}

interactive_menu() {
  local choice

  while true; do
    cat <<'EOF'

meme-maker
1. Download Video
2. Download GIF
3. Download Audio
4. Add text to GIF
5. Add Audio to Video
6. Caption YouTube clip
q. Quit
EOF
    read -rp "Choose: " choice

    case "$choice" in
      1) interactive_download_video; break ;;
      2) interactive_download_gif; break ;;
      3) interactive_download_audio; break ;;
      4) interactive_add_text_to_gif; break ;;
      5) interactive_add_audio_to_video; break ;;
      6) interactive_caption_youtube; break ;;
      q|Q) exit 0 ;;
      *) warn "Unknown choice: $choice" ;;
    esac
  done
}

POSITIONAL=()
while (($#)); do
  case "$1" in
    -h|--help)
      show_mememaker_help
      exit 0
      ;;
    --no-text)
      NO_TEXT=1
      shift
      ;;
    --caption-local)
      CAPTION_LOCAL=1
      shift
      ;;
    --top-y)
      [[ $# -ge 2 ]] || die "--top-y requires a value"
      TOP_Y="$2"
      shift 2
      ;;
    --bottom-y)
      [[ $# -ge 2 ]] || die "--bottom-y requires a value"
      BOTTOM_Y="$2"
      shift 2
      ;;
    --font-size)
      [[ $# -ge 2 ]] || die "--font-size requires a value"
      SIZE="$2"
      shift 2
      ;;
    --width)
      [[ $# -ge 2 ]] || die "--width requires a value"
      WIDTH="$2"
      shift 2
      ;;
    --)
      shift
      POSITIONAL+=("$@")
      break
      ;;
    -*)
      die "Unknown option: $1"
      ;;
    *)
      POSITIONAL+=("$1")
      shift
      ;;
  esac
done

set -- "${POSITIONAL[@]}"

if [[ $# -eq 0 && "$CAPTION_LOCAL" == "0" && "$NO_TEXT" == "0" ]]; then
  interactive_menu
elif (( CAPTION_LOCAL )); then
  run_caption_local_mode "$@"
else
  run_youtube_mode "$@"
fi
