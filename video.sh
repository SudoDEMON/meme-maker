#!/usr/bin/env bash
# video.sh ────────────────────────────────────────────────────────────────────
# meme-maker — Download video clips, or combine local GIF/MP4 media with MP3.
#
# Usage: npm run video <VIDEO_ID> <start> <end> [output.mp4]
#        ./video.sh <VIDEO_ID> <start> <end> [output.mp4]
#        ./video.sh combine <input.(gif|mp4)> <audio.mp3> [output.mp4]
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
  ./video.sh <youtube-id> <start> <end> [output.mp4]
  ./video.sh combine <input.(gif|mp4)> <audio.mp3> [output.mp4]
  ./video.sh <input.(gif|mp4)> <audio.mp3> [output.mp4]

Examples:
  ./video.sh O0Dgtar0zB4 0:00 0:20 boom_headshot_vid.mp4
  ./video.sh /home/void/Projects/meme-maker/boom_headshot_vid.mp4 /home/void/Projects/meme-maker/SPVCEODYSSEY_20sec.mp3

Downloads a trimmed clip using yt-dlp + a clean ffmpeg pass.
If no output is given, defaults to videos/<id>.mp4 (creates the dir).
Combine mode creates an MP4 from local GIF/MP4 video plus an MP3.
GIF inputs loop to the audio length; MP4 inputs stop at the shorter stream.
If combine output is omitted, defaults to videos/<input-stem>-with-audio.mp4.
Custom output names may be given with or without .mp4.
Requires: yt-dlp, ffmpeg for downloads; ffmpeg/ffprobe for combine mode.
EOF
}

ensure_parent_dir() {
  local out=$1
  local d
  d="$(dirname "$out")"
  [[ "$d" != "." ]] && mkdir -p "$d"
}

normalize_mp4_output() {
  local out=$1
  case "$out" in
    *.mp4|*.MP4) ;;
    *) out="${out}.mp4" ;;
  esac
  ensure_parent_dir "$out"
  printf '%s\n' "$out"
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
    *.gif|*.GIF|*.mp4|*.MP4) ;;
    *) die "Combine input must be a .gif or .mp4 file: $media" ;;
  esac

  if [[ -z "$out" ]]; then
    out="$(default_combined_output "$media")"
  else
    out="$(normalize_mp4_output "$out")"
  fi

  check_deps ffmpeg ffprobe

  info "Combining $media + $audio → $out …"

  case "$media" in
    *.gif|*.GIF)
      local audio_duration
      audio_duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$audio")"
      [[ -n "$audio_duration" ]] || die "Could not determine audio duration: $audio"

      ffmpeg -y -stream_loop -1 -i "$media" -i "$audio" \
             -t "$audio_duration" \
             -map 0:v:0 -map 1:a:0 \
             -vf "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
             -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
             -c:a aac -b:a 192k -movflags +faststart \
             "$out"
      ;;
    *.mp4|*.MP4)
      ffmpeg -y -i "$media" -i "$audio" \
             -map 0:v:0 -map 1:a:0 \
             -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
             -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
             -c:a aac -b:a 192k -shortest -movflags +faststart \
             "$out"
      ;;
  esac

  success "Saved $out"
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -eq 0 ]]; then
  show_video_help
  exit 0
fi

if [[ "${1:-}" == "combine" ]]; then
  [[ $# -ge 3 && $# -le 4 ]] || die "Usage: ./video.sh combine <input.(gif|mp4)> <audio.mp3> [output.mp4]"
  combine_media_audio "$2" "$3" "${4:-}"
  exit 0
fi

if [[ $# -ge 2 && $# -le 3 && -f "$1" && -f "$2" ]]; then
  combine_media_audio "$1" "$2" "${3:-}"
  exit 0
fi

if [[ $# -lt 3 ]]; then
  show_video_help
  exit 0
fi

VID="$1"
START="$2"
END="$3"

if [[ -z "${4:-}" ]]; then
  mkdir -p videos
  OUT="videos/${VID}.mp4"
else
  OUT="$(normalize_mp4_output "$4")"
fi

check_deps yt-dlp ffmpeg

info "Grabbing $START → $END from $VID …"

SRC="$(make_temp_name --ext mp4)"
yt-dlp -f "bv*[ext=mp4]+ba" --merge-output-format mp4 \
       --download-sections "*$START-$END" \
       --force-keyframes-at-cuts \
       --force-overwrites \
       -o "$SRC" "https://www.youtube.com/watch?v=$VID"

# yt-dlp can occasionally write a sibling with the ext appended; pick the real file if needed.
if [[ ! -s "$SRC" && -s "$SRC.mp4" ]]; then
  register_temp_path "$SRC.mp4"
  SRC="$SRC.mp4"
fi
[[ -s "$SRC" ]] || die "yt-dlp produced no usable media for $VID ($START-$END). Try a different video or run with MM_DEBUG=1."

# Clean re-encode of the already-sectioned clip (yt-dlp already extracted
# the requested range; the resulting file is short with timeline ~0).
ffmpeg -y -i "$SRC" \
       -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
       -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
       -c:a aac -b:a 192k -movflags +faststart \
       "$OUT"

success "Saved $OUT"
