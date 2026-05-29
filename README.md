# meme-maker

A small collection of personal yt-dlp + ffmpeg tools for quickly making clips, music stings, and captioned memes from YouTube.

Originally created while making memes for a marathon involving a character named Blackbird. It spiraled from there into a general-purpose clip and meme toolkit.

Now reasonably robust, portable, and easy to install on new machines, especially Arch-based Linux systems.

## What's in here

| Script          | Purpose                              | Notes |
|-----------------|--------------------------------------|-------|
| `mememaker.sh`  | YouTube slice → captioned GIF or MP4 | Best one. Two-line text support |
| `video.sh`      | Download clean trimmed video clips   | Fast quality encodes |
| `music.sh`      | Extract trimmed audio (mp3)          | Great for stings & samples |
| `build.sh`      | HTML → video/GIF using puppeteer     | For fancy terminal animations |
| `lib.sh`        | Shared utilities                     | Used by the main scripts |
| `Memes/mememaker.sh` | Old-school standalone version   | Self-contained, good for copying |

## Quick start (recommended)

```bash
git clone https://github.com/YOURNAME/blackbird-video.git
cd blackbird-video
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
- Node.js + npm (only needed for `build.sh` / `capture.js`)

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
# Make a meme
mememaker Ee4oHnkXRnM 8:33 8:37 gif "TAKE THAT" "YOU 5 TON BEHEMOTH"

# Grab a video clip
video dQw4w9wgccc 0:42 1:17 funny-bit.mp4

# Grab some audio
music dQw4w9wgccc 1:05 1:22 bass.mp3

# Fancy HTML animation → video (see blackbird_terminal.html)
build blackbird_terminal.html output.mp4 12 music.mp3
```

All scripts support `-h` / `--help`.

## Environment variables

- `FONT=/path/to/font.ttf` — force a specific font in `mememaker`
- `BBV_DEBUG=1` — extra debug output

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
├── blackbird_terminal*.html   # Example inputs for build.sh
└── README.md
```

Everything else (media files, `frames/`, `node_modules/`) is either output or generated.

## Philosophy

These are personal tools that grew over time. They are intentionally simple and a bit chaotic. The goal is "I want a meme/clip in 10 seconds" not "perfectly engineered media pipeline."

Pull requests that make them more reliable without making them complicated are welcome.

## License

ISC (same as the original package.json)

---

Made with too much yt-dlp, stubbornness, and one very persistent bird.
