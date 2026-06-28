# meme-maker

A small collection of personal yt-dlp + ffmpeg tools for quickly making clips, music stings, and captioned memes from YouTube.

Originally created while making memes for a personal project that spiraled into a general-purpose clip and meme toolkit.

Now reasonably robust, portable, and easy to install on new machines, especially Arch-based Linux systems.

## What's in here

| Script          | Purpose                              | Notes |
|-----------------|--------------------------------------|-------|
| `convert.sh`    | Download or convert media formats    | Local media or remote source → GIF/MP3/MP4/WebM |
| `mememaker.sh`  | Interactive meme and text workflow   | Menu + local/remote caption renderer |
| `audio_video.sh` | Add audio to video/media            | Local/remote video + local audio → MP4/WebM |
| `build.sh`      | HTML → video/GIF/PNG/WebM using puppeteer | Advanced: capture browser animations |
| `lib.sh`        | Shared utilities                     | Used by the main scripts |

## Quick start (recommended)

```bash
git clone https://github.com/SudoDEMON/meme-maker.git
cd meme-maker
./install.sh
```

OS-specific installer entrypoints are available too:

```bash
./install-linux.sh
./install-macos.sh
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```

The installer will:
- Install `yt-dlp`, `ffmpeg`, fonts, and Node.js (where possible)
- Symlink the tools into `~/.local/bin`
- Optionally set up `npm` deps for `build.sh`

After that you can just run `mememaker`, `meme-convert`, `audio-video`, etc. from anywhere.
`convert.sh` is linked as `meme-convert` to avoid shadowing ImageMagick's
common `convert` command.

### Local web UI

```bash
npm run web
```

Open `http://127.0.0.1:3000`.

The web UI runs the same local scripts as the CLI and streams `yt-dlp` / `ffmpeg`
logs in the browser. By default it binds to `127.0.0.1` for local-only use.
The main web tabs are:

- **Download or Convert**: local media or yt-dlp-supported URL → GIF/MP3/MP4/WebM
- **Text to Media**: local media or yt-dlp-supported URL → captioned GIF/MP4/WebM
- **Audio to Video**: local media or yt-dlp-supported URL + local audio → MP4/WebM
- **Build HTML Animation**
- **Experimental**

You can paste a YouTube ID, YouTube URL, or another media URL supported by the
installed `yt-dlp`. YouTube URLs are normalized to the 11-character ID. Source
fields can also Browse for local files. When a source is entered, the server
probes it with `ffprobe` for local files or `yt-dlp --dump-single-json` for
remote URLs to show support/duration, fill the End field with the detected
duration, and prefill the output name from the media ID/name. Start and End
fields are validated as seconds, `MM:SS`, or `HH:MM:SS`, and Start must be
before End when End is set.
Finished jobs show both an Open link and a Download link. The Download link uses
a browser attachment response so it should trigger the normal save/download
flow with the generated filename.

Output fields are sanitized and default to the project output directories:

- Video/WebM: `videos/<name>.mp4` or `videos/<name>.webm`
- GIF: `gifs/<name>.gif`
- Audio: `Audio/<name>.mp3`

For example, typing `test-clips` in an MP4 output field produces
`videos/test-clips.mp4`; selecting GIF, MP3, or WebM sends it to the matching
default folder/extension. Relative subdirectories are allowed, but absolute
paths and `..` segments are rejected.

Local file pickers upload the selected file into `.web-uploads/` and then use
that uploaded local path for GIF/video/audio/font/HTML inputs. This keeps the
browser security model intact while still giving a normal file chooser.

The **Experimental** tab includes a visual media text editor. Input can be GIF,
WebM, or MP4. Output is an output name plus a GIF/MP4/WebM dropdown. It loads a
preview frame, shows resolution/length/FPS/frame count, lets you scrub with the
slider or editable time/frame fields, drag two text fields into place, drag the
preview crop edges/corners, set optional output FPS, and trim output with Output
Start/End. Output Start/End accept time values such as `0:01.5` or frame values
such as `18f`, and Start must be before End. It renders the result as GIF, MP4,
or WebM and passes the crop rectangle, resulting x/y coordinates, font face,
bold, italic, underline, strikethrough, and size settings to the local caption
renderer. If you browse or enter a repo-local font path, the preview text loads
that font file in the browser before rendering.

```bash
MM_WEB_PORT=3001 npm run web
```

This local runner can read/write local paths and run media tools. If this is
later hosted from another site, keep the frontend but replace the local runner
with an authenticated server-side job queue or another remote-safe backend.

### Manual / no-install route

```bash
# Make sure you have yt-dlp + ffmpeg + a decent font
./mememaker.sh --help
./convert.sh --help
```

## Requirements

- `yt-dlp`
- `ffmpeg`
- A decent bold sans-serif font (DejaVu Sans Bold, Noto Sans Bold, etc.)
- Node.js + npm + a Puppeteer browser (only needed for `build.sh` / `capture.js`)

On **Arch-based Linux**:
```bash
sudo pacman -S yt-dlp ffmpeg ttf-dejavu noto-fonts nodejs npm
```

On **macOS** (with Homebrew):
```bash
brew install yt-dlp ffmpeg node
```

## Usage examples

```bash
# Launch the interactive menu
./mememaker.sh

# Download or convert a local/remote source to a chosen format
./convert.sh O0Dgtar0zB4 0:00 0:20 mp4 videos/clip.mp4
./convert.sh https://youtu.be/O0Dgtar0zB4 0:00 "" gif gifs/clip.gif
./convert.sh O0Dgtar0zB4 0:00 "" mp3 Audio/clip.mp3
./convert.sh videos/input.mp4 0:05 "" gif gifs/input-cut.gif

# Make a GIF with no caption text
./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "" "" boom_headshot_no_text.gif

# Omit end time to use the full video from start onward
./mememaker.sh O0Dgtar0zB4 0:00 gif "TOP" "BOTTOM" full_video.gif
./convert.sh O0Dgtar0zB4 0:00 "" mp4 videos/full_video.mp4

# Same thing, using the explicit no-text flag
./mememaker.sh --no-text O0Dgtar0zB4 0:00 0:20 webm boom_headshot_no_text

# Make a captioned GIF
./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_text.gif

# Move captions down/up and style each line
./mememaker.sh --top-y 40 --bottom-y 110 --top-font-size 44 --bottom-font-size 58 --bottom-bold O0Dgtar0zB4 0:00 0:20 mp4 "BOOM" "HEADSHOT" boom_headshot_text.mp4

# Add text to an existing GIF
./mememaker.sh --caption-local input.gif gifs/input_captioned.gif "TOP" ""

# Add text to a trimmed section of local media
./mememaker.sh --caption-local --start 0:05 --end 0:10 input.mp4 videos/input_captioned.mp4 "TOP" ""

# Crop local media before captioning
./mememaker.sh --caption-local --crop 80 20 480 360 --width 480 input.mp4 videos/input_cropped.mp4 "TOP" ""

# Make a captioned GIF with a custom font
./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_glitch.gif /path/to/font.ttf

# Grab the audio clip
./convert.sh vXZu0wT1kUg 1:36 1:56 mp3 Audio/SPVCEODYSSEY_20sec.mp3

# Grab the video clip
./convert.sh O0Dgtar0zB4 0:00 0:20 mp4 videos/boom_headshot_vid.mp4

# yt-dlp-supported URLs work too
./convert.sh "<yt-dlp-supported-url>" 0:00 "" mp4 videos/supported-media.mp4

# Grab a WebM clip
./convert.sh O0Dgtar0zB4 0:00 0:20 webm videos/boom_headshot_vid.webm

# Combine a local MP4 with MP3 audio into a new MP4
./audio_video.sh /path/to/file/meme-maker/boom_headshot_vid.mp4 0:00 "" /path/to/file/meme-maker/SPVCEODYSSEY_20sec.mp3 videos/boom_headshot_with_audio.mp4

# Add local audio to a remote or local video source
./audio_video.sh O0Dgtar0zB4 0:00 0:20 Audio/sting.mp3 videos/clip-with-audio.mp4

# Capture HTML to WebM
./build.sh index.html out.webm 10 music.mp3
```

- `mememaker` will create `gifs/` or `videos/` as needed and name the file after the media source (or your custom stem) + the right extension.
- `convert.sh` is the general download/convert entrypoint. It requires an explicit output and accepts `gif`, `mp3`, `mp4`, or `webm`.
- `audio_video.sh` is the general add-audio entrypoint for local/remote media plus a local audio file.
- Caption text can be blank: use `"" ""` or `--no-text`. In the interactive menu, leave text prompts blank for no text.
- End time can be blank/omitted to use everything from the start time through the end of the video. Internally this uses yt-dlp's `inf` section end when a section is still needed.
- `--top-y`, `--bottom-y`, `--font-size`, `--width`, and `--fps` control caption placement and output sizing.
- `--top-x`, `--bottom-x`, `--bottom-from-top`, `--crop`, `--font-family`, `--bold`, `--italic`, `--underline`, and `--strikethrough` are available for the experimental visual editor and advanced caption placement.
- `--top-font-family`, `--top-font-size`, `--top-bold`, `--top-italic`, `--bottom-font-family`, `--bottom-font-size`, `--bottom-bold`, and `--bottom-italic` control the two caption lines independently.
- In `--caption-local` mode, `--start` and `--end` trim the local source before captioning. Seconds can include decimals, such as `0.5`.

All scripts support `-h` / `--help`.

## Environment variables

- `FONT=/path/to/font.ttf` — force a specific font in `mememaker`
- `MM_DEBUG=1` — extra debug output
- `MM_TOP_Y=15` / `MM_BOTTOM_Y=75` — default caption offsets for `mememaker`
- `MM_FONT_SIZE=50` / `MM_WIDTH=720` — default caption size and output width for `mememaker`
- `MM_BUILD_FPS=60` — frame rate for `build.sh` captures and encodes
- `MM_OUTPUT_FPS=30` — optional forced output frame rate for `mememaker`
- `MM_WEBM_CRF=34` — WebM quality/speed target; lower is higher quality and slower
- `MM_WEBM_CPU_USED=5` — WebM VP9 speed setting; higher is faster with lower compression quality
- `MM_WEBM_TILE_COLUMNS=2` — WebM VP9 tiling for parallel encoding
- `PUPPETEER_EXECUTABLE_PATH=/path/to/chrome` — use a system Chrome/Chromium for `build.sh`

## Moving to a new machine

1. Clone the repo (or copy the scripts + `lib.sh`)
2. Run `./install.sh`
3. Done

Or just copy the files and run the individual scripts directly.

## Project structure (the important bits)

```
.
├── lib.sh              # Shared helpers (don't run directly)
├── convert.sh          # Local/remote media → GIF/MP3/MP4/WebM
├── mememaker.sh        # Interactive menu + full caption renderer
├── audio_video.sh      # Local/remote media + local audio → MP4/WebM
├── build.sh            # HTML → video using puppeteer
├── capture.js
├── web.js              # Local web UI server
├── web/                # Static browser UI
├── install.sh          # The magic migration/installer
├── install-linux.sh
├── install-macos.sh
├── install-windows.ps1
├── package.json
└── README.md
```

Everything else (media files, `frames/`, `node_modules/`) is either output or generated.

## Philosophy

These are personal tools that grew over time. They are intentionally simple and a bit chaotic. The goal is "I want a meme/clip in 10 seconds" not "perfectly engineered media pipeline."

Pull requests that make them more reliable without making them complicated are welcome.

## License

ISC (same as the original package.json)

---

Made with too much yt-dlp and stubbornness.
