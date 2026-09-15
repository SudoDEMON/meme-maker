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
| `combine_videos.sh` | Append local videos              | Fast lossless concat when compatible; normalized MP4/WebM fallback |
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

On Windows, the installer uses Git Bash from `PATH` or its standard Git for
Windows install locations. Its generated `.cmd` shims call the detected Bash
executable directly, so Git's `bin` directory does not need to be added to the
machine-wide `PATH`.

The installer will:
- Install `yt-dlp`, `ffmpeg`, fonts, and Node.js (where possible)
- Symlink the tools into `~/.local/bin`
- Optionally set up `npm` deps for `build.sh`

After that you can just run `mememaker`, `meme-convert`, `audio-video`,
`combine-videos`, etc. from anywhere.
`convert.sh` is linked as `meme-convert` to avoid shadowing ImageMagick's
common `convert` command.

### Local web UI

```bash
npm run web
```

Open `http://127.0.0.1:3001`.

The app has two sections, backed by the same local CLI scripts:

- **Media Tools**: download/convert media, combine clips in playback order,
  extract MP3 audio, or replace a video's soundtrack. Add files or paste a URL
  once into **Your media**, then select the operation. HTML animation rendering
  is available under **Advanced tools**.
- **Meme Editor**: a visual preview with draggable captions and crop handles,
  classic top/bottom caption layout, trim controls, and GIF/MP4/WebM export.
  Font overrides, custom font files, frame numbers, and output FPS are under
  **Advanced settings**. Captions can be blank for trim/crop-only output.

Files are shared between sections. Combine accepts 2–30 local MOV/MP4/WebM
clips; use the arrows in the library to set their order. Convert downloads
remote sources automatically. YouTube IDs/URLs and other URLs supported by the
installed `yt-dlp` are accepted. To combine a remote clip, convert/download it
first, then select the result from your library.

Drafts and the shared file list survive section switches and page refreshes
within the current browser tab. Source inspection shows duration and format
without overwriting a trim you entered. A completed output appears with a
playable preview, Download, and **Open in Meme Editor** for compatible media.
Processing logs are expandable. The browser reconnects to an active job after
a connection interruption or refresh, and keeps Cancel available while checking
its status. Jobs themselves are in memory and do not survive server restarts.

The editor supports local GIF/MOV/MP4/WebM and remote video. Local files served
by this app play and seek directly when the browser supports their codec;
external filesystem paths and remote sources use extracted frame previews.
Output Start/End accept seconds, `MM:SS`, `HH:MM:SS`, or frame values such as
`18f`. End is optional. Arrow keys move a focused caption or crop handle;
hold Shift for larger steps.

The editor stores positions and font sizes in source pixels. Its renderer draws
captions before crop/resize, so resizing moves and scales the image and text
together. It loads the server's resolved font faces for the browser preview,
with a browser-font fallback when that face cannot be loaded. Remote metadata
is cached for five minutes, including in-flight requests. Obsolete preview
requests are cancelled, and remote preview windows are cached by source/second.

Output names default to the project directories: `videos/` for MP4/WebM,
`gifs/` for GIF, `Audio/` for MP3, and `frames/` for PNG. Relative subdirectories
are allowed; absolute paths and `..` segments are rejected. Use a new output
name to keep multiple versions; rendering to an existing name replaces it.

File pickers upload once into the ignored `.web-uploads/` directory. The default
upload limit is 2 GiB (`MM_WEB_MAX_UPLOAD_BYTES`). These uploads and generated
previews are local scratch files; removing a library entry only removes its
browser reference, not the file on disk. `/files` and `/download` serve only
paths registered by the current server process. Metadata inspection re-registers
local media when restoring the library after a restart.

```bash
MM_WEB_PORT=3001 npm run web
```

The server binds to `127.0.0.1` by default. This local runner can read/write local
paths and run media tools; a public deployment needs a separate authenticated
backend with restricted paths and a job queue.

### Validation

```bash
npm test          # CLI smoke tests + real media/server regression tests
npm run test:web  # Headless Chromium workflow tests (requires npm dependencies)
npm run check     # Both suites
npm run doctor    # Installed tools and command links
```

The integration fixtures run in temporary directories with synthetic video and
stubbed remote downloads. They cover caption resize/crop output, asynchronous
metadata, playback ranges, preview cancellation, draft persistence, clip order,
output handoff, stale preview responses, connection recovery, and mobile width.
Media integration fixtures currently require Unix-native Node; the existing
Windows shell checks remain available through `npm test`.

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

# MOV inputs work too when your ffmpeg build can decode the file's codecs
./mememaker.sh --caption-local --start 0:05 --end 0:10 input.mov videos/input_mov_captioned.mp4 "TOP" ""

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

# Append local clips in order (two or more inputs are supported)
./combine_videos.sh videos/part-1.mp4 videos/part-2.mp4 videos/combined.mp4

# Capture HTML to WebM
./build.sh index.html out.webm 10 music.mp3
```

- `mememaker` will create `gifs/` or `videos/` as needed and name the file after the media source (or your custom stem) + the right extension.
- `convert.sh` is the general download/convert entrypoint. It requires an explicit output and accepts `gif`, `mp3`, `mp4`, or `webm`.
- `audio_video.sh` is the general add-audio entrypoint for local/remote media plus a local audio file.
- `combine_videos.sh` appends two or more local clips. Matching streams use a fast lossless copy; differing resolution, frame rate, codec, or audio layout triggers a normalized re-encode.
- Caption text can be blank: use `"" ""` or `--no-text`. In the interactive menu, leave text prompts blank for no text.
- End time can be blank/omitted to use everything from the start time through the end of the video. Internally this uses yt-dlp's `inf` section end when a section is still needed.
- `--top-y`, `--bottom-y`, `--font-size`, `--width`, and `--fps` control caption placement and output sizing.
- `--top-x`, `--bottom-x`, `--bottom-from-top`, `--crop`, `--font-family`, `--bold`, `--italic`, `--underline`, and `--strikethrough` are available for the visual editor and advanced caption placement.
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
- `MM_YTDLP_FORCE_IPV4=0` — allow yt-dlp to use IPv6 too; by default meme-maker passes `--force-ipv4` to avoid hangs on flaky IPv6 routes
- `MM_YTDLP_SOCKET_TIMEOUT=15` — socket timeout, in seconds, passed to yt-dlp; set `0` to use yt-dlp's default
- `MM_WEB_PREVIEW_TIMEOUT_MS=45000` — timeout for remote preview yt-dlp/ffmpeg helper processes
- `MM_WEB_PREVIEW_CACHE_ENTRIES=24` — number of remote preview clip windows cached by the local web server; set `0` to disable
- `MM_WEB_MAX_UPLOAD_BYTES=2147483648` — maximum local web file-picker upload size (default 2 GiB)
- `MM_COMBINE_PRESET=veryfast` / `MM_COMBINE_CRF=18` — H.264 settings used only when combined MP4 inputs require normalization
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
├── combine_videos.sh    # Append local videos → MP4/WebM
├── build.sh            # HTML → video using puppeteer
├── capture.js
├── web.js              # HTTP routing for the local web UI
├── server/             # Media inspection, fonts, processes, files, and jobs
├── web/                # Shared library, drafts, media tools, and visual editor
├── tests/              # Isolated server and browser regression tests
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
