# meme-maker

A small collection of personal yt-dlp + ffmpeg tools for quickly making clips, music stings, and captioned memes from YouTube.

Originally created while making memes for a personal project that spiraled into a general-purpose clip and meme toolkit.

Now reasonably robust, portable, and easy to install on new machines, especially Arch-based Linux systems.

## What's in here

| Script          | Purpose                              | Notes |
|-----------------|--------------------------------------|-------|
| `mememaker.sh`  | YouTube slice → captioned GIF or MP4 | Best one. Two-line text support |
| `video.sh`      | Download clean trimmed video clips   | Fast quality encodes |
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
# Make a meme (outputs to gifs/<id>.gif by default)
mememaker Ee4oHnkXRnM 8:33 8:37 gif "TAKE THAT" "YOU 5 TON BEHEMOTH"

# Make a meme with a custom name (still placed in the right dir + correct ext)
mememaker haX-hC7Tfdc 8:22 8:31 gif "RIP" "GRANDMA" "RIPGRANDMAMEME"

# Grab a video clip (defaults to videos/<id>.mp4 if no output given)
video dQw4w9wgccc 0:42 1:17 funny-bit.mp4

# Grab some audio (defaults to audio/<id>.mp3 if no output given)
music dQw4w9wgccc 1:05 1:22 bass.mp3
```

- `mememaker` will create `gifs/` or `videos/` as needed and name the file after the video ID (or your custom stem) + the right extension.
- `video` and `music` do the same with `videos/` and `audio/`.
- Passing an explicit output filename (as the last argument) gives you full control over path and name.

All scripts support `-h` / `--help`.

## Environment variables

- `FONT=/path/to/font.ttf` — force a specific font in `mememaker`
- `MM_DEBUG=1` — extra debug output

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
