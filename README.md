# meme-maker

A small collection of personal yt-dlp + ffmpeg tools for quickly making clips, music stings, and captioned memes from YouTube.

Originally created while making memes for a personal project that spiraled into a general-purpose clip and meme toolkit.

Now reasonably robust, portable, and easy to install on new machines, especially Arch-based Linux systems.

## What's in here

| Script          | Purpose                              | Notes |
|-----------------|--------------------------------------|-------|
| `mememaker.sh`  | YouTube slice → captioned GIF or MP4 | Best one. Two-line text support |
| `video.sh`      | Download clips or combine media+MP3  | Fast quality encodes |
| `music.sh`      | Extract trimmed audio (mp3)          | Great for stings & samples |
| `build.sh`      | HTML → video/GIF using puppeteer     | Advanced: capture browser animations |
| `lib.sh`        | Shared utilities                     | Used by the main scripts |
| `Memes/mememaker.sh` | Old-school standalone version   | Self-contained, good for copying |

## Quick start (recommended)

```bash
git clone https://github.com/SudoDEMON/meme-maker.git
cd meme-maker
./install.sh
```

The installer will:
- Install `yt-dlp`, `ffmpeg`, fonts, and Node.js (where possible)
- Symlink the tools into `~/.local/bin`
- Optionally set up `npm` deps for `build.sh`

After that you can just run `mememaker`, `video`, `music`, etc. from anywhere.

### Manual / no-install route

```bash
# Make sure you have yt-dlp + ffmpeg + a decent font
./mememaker.sh --help
./video.sh --help
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
# Make a GIF with no visible caption text
./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif " " " " boom_headshot_no_text.gif

# Make a captioned GIF
./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_text.gif

# Make a captioned GIF with a custom font
./mememaker.sh O0Dgtar0zB4 0:00 0:20 gif "BOOM" "HEADSHOT" boom_headshot_glitch.gif /path/to/font.ttf

# Grab the audio clip
./music.sh vXZu0wT1kUg 1:36 1:56 SPVCEODYSSEY_20sec.mp3

# Grab the video clip
./video.sh O0Dgtar0zB4 0:00 0:20 boom_headshot_vid.mp4

# Combine a local MP4 with MP3 audio into a new MP4
./video.sh /path/to/file/meme-maker/boom_headshot_vid.mp4 /path/to/file/meme-maker/SPVCEODYSSEY_20sec.mp3
```

- `mememaker` will create `gifs/` or `videos/` as needed and name the file after the video ID (or your custom stem) + the right extension.
- Without an explicit output, `video` and `music` use `videos/` and `Audio/`.
- Passing an explicit output filename (as the last argument) gives you full control over path and name. `video.sh` accepts custom MP4 names with or without the `.mp4` extension.

All scripts support `-h` / `--help`.

## Environment variables

- `FONT=/path/to/font.ttf` — force a specific font in `mememaker`
- `MM_DEBUG=1` — extra debug output
- `MM_BUILD_FPS=60` — frame rate for `build.sh` captures and encodes
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
├── mememaker.sh        # Main meme tool (the good one)
├── video.sh
├── music.sh
├── build.sh            # HTML → video using puppeteer
├── capture.js
├── install.sh          # The magic migration/installer
├── package.json
├── Memes/
│   └── mememaker.sh    # Old standalone/self-contained version
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
