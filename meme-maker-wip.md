# Meme Maker WIP

Meme Maker WIP changes from user. Update this file as items move from planned
to implemented to verified.

## Current Pass

Status: Verified
Started: 2026-06-21
Last updated: 2026-06-21

## Installation

- [x] Create an install file for each major OS.
  - Status: Verified.
  - Linux: `install-linux.sh`
  - macOS: `install-macos.sh`
  - Windows: `install-windows.ps1`
  - Evidence: Bash syntax checks passed for Linux/macOS wrappers; PowerShell help was added for Windows. README documents all three entrypoints.

## Removal Pass

- [x] Remove redundant wrapper scripts.
  - Status: Verified.
  - Removed: `download.sh`, `text.sh`, `audio.sh`, `video.sh`, `music.sh`, and `Memes/mememaker.sh`.
  - Reason: `convert.sh` already handles remote/local GIF/MP3/MP4/WebM conversion, `mememaker.sh` already handles local/remote text overlays, and `audio_video.sh` already handles local/remote video plus local audio.
- [x] Remove unused web backend actions.
  - Status: Verified.
  - Removed backend-only actions: `download-video`, `download-gif`, `download-audio`, `caption-youtube`, `caption-local`, and `add-audio`.
  - Reason: the frontend sends `download-convert`, `text-to-media`, `audio-to-video`, `build-html`, and `experimental-gif-editor`.
- [x] Remove stale installer/package/test references.
  - Status: Verified.
  - Notes: `install.sh` and `install-windows.ps1` now remove stale `download`, `text`, `audio`, `video`, and `music` links/shims. `install.sh` also removes the old `meme-simple` link.

## Script Files

- [x] Use `convert.sh` for download/convert.
  - Status: Verified.
  - Purpose: downloads or converts local/remote media.
  - Formats: GIF, MP3, MP4, WebM.
- [x] Use `mememaker.sh` for text overlays.
  - Status: Verified.
  - Purpose: adds text to local media or remote clips, with the interactive menu for common flows.
  - Formats: GIF, MP4, WebM.
- [x] Use `audio_video.sh` for add-audio workflows.
  - Status: Verified.
  - Purpose: adds local audio to a local/remote video source.
  - Formats: MP4, WebM.
- [x] Make sure `--help` gives format and examples.
  - Status: Verified.
  - Evidence: `npm test` checks `convert.sh`, `audio_video.sh`, and the existing scripts for help output.
- [x] Keep the interactive menu working without the removed scripts.
  - Status: Verified.
  - Notes: `mememaker.sh` now routes Download Video and Download Audio through `convert.sh`, and Add Audio to Video through `audio_video.sh`.

## Validation

- `bash -n lib.sh convert.sh audio_video.sh mememaker.sh build.sh install.sh install-linux.sh install-macos.sh test.sh` passed.
- `node --check web.js && node --check capture.js && node --check web/app.js` passed.
- `pwsh` is not installed on this machine, so Windows runtime parsing could not be run locally.
- `./install.sh --link-only` removed stale `download`, `download.sh`, `text`, `text.sh`, `audio`, `audio.sh`, `video`, `video.sh`, `music`, `music.sh`, and `meme-simple` symlinks, then relinked the remaining commands.
- `npm test` passed.
- `npm run doctor` passed.
- Temporary web server health check passed on port 3199 and reported only the current frontend actions: `download-convert`, `text-to-media`, `audio-to-video`, `build-html`, and `experimental-gif-editor`.
- `git diff --check` passed.
