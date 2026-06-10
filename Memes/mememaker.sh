#!/usr/bin/env bash
# Memes/mememaker.sh ──────────────────────────────────────────────────────────
# meme-maker — Super simple self-contained meme generator (old-school version).
# Good for quick copy-paste or when you don't want the full lib.sh.
#
# Tweak the variables below and run.

set -euo pipefail

# ---- variables you can tweak -----------------------------------
ID="Ee4oHnkXRnM"
START="8:33"
END="8:37"
CAPTION="TAKE THAT 5 TON BAHEMEHOTH"
# ----------------------------------------------------------------

command -v yt-dlp >/dev/null 2>&1 || { echo "Need yt-dlp"; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "Need ffmpeg"; exit 1; }

# Font (respects FONT env var, otherwise tries common locations)
if [[ -z "${FONT:-}" ]]; then
  if [[ "$OSTYPE" == darwin* ]]; then
    FONT="/System/Library/Fonts/HelveticaNeue.ttc"
  else
    for f in \
      /usr/share/fonts/TTF/DejaVuSans-Bold.ttf \
      /usr/share/fonts/noto/NotoSans-Bold.ttf \
      /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
    do [[ -f "$f" ]] && { FONT="$f"; break; }
    done
  fi
fi
[[ -f "${FONT:-}" ]] || { echo "No font found. Set FONT=/path/to/font.ttf"; exit 1; }
echo "Using font: $FONT"

TMP="$(mktemp "${TMPDIR:-/tmp}/meme.XXXXXX.mp4")"
CLEAN="$(mktemp "${TMPDIR:-/tmp}/meme_clean.XXXXXX.mp4")"
trap 'rm -f "$TMP" "$CLEAN" 2>/dev/null || true' EXIT

# Remove the placeholder so yt-dlp will actually write the media (it skips on "already downloaded"
# if a 0-byte file exists at the target). Also force overwrites for temp clips.
rm -f "$TMP" 2>/dev/null || true

yt-dlp -f "bv*[ext=mp4]+ba" --merge-output-format mp4 \
       --download-sections "*$START-$END" \
       --force-keyframes-at-cuts \
       --force-overwrites \
       -o "$TMP" "https://youtu.be/$ID"

# yt-dlp with -o may still append the container ext in some cases; pick the real file
[[ -s "$TMP" ]] || TMP="${TMP}.mp4"
[[ -s "$TMP" ]] || TMP="${TMP%.mp4}.mp4"
[[ -s "$TMP" ]] || { echo "yt-dlp produced no usable media for $ID ($START-$END)"; exit 1; }

# The file from yt-dlp --download-sections is already the trimmed slice (timeline ~0).
ffmpeg -y -i "$TMP" -c copy "$CLEAN"

ffmpeg -i "$CLEAN" -vf \
 "drawtext=fontfile=$FONT: \
           text='$CAPTION':fontcolor=white:borderw=2:bordercolor=black: \
           fontsize=38:x=(w-text_w)/2:y=h-80, \
  fps=15,scale=640:-1" \
 -loop 0 meme.gif

echo "✅  Created meme.gif"
