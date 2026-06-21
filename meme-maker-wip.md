# Meme Maker WIP

Progress file for UI cleanup work. Update this file as items move from planned
to implemented to verified.

## Current Pass: UI Cleanup

Status: Verified
Started: 2026-06-21
Last updated: 2026-06-21

### Checklist

- [x] Rename `Download Convert` to `Download or Convert`.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed nav tabs include `Download or Convert` and no `Download Convert`; screenshot `/tmp/mm-ui-cleanup.png`.

- [x] End placeholders on pages with source probing should show the detected end time of the supported media instead of `blank = full video`.
  - Example: a video with duration 12:11 should show `12:11`.
  - Status: Verified.
  - Evidence: Puppeteer check loaded a 1-second local MP4 through source probing and confirmed the End placeholder changed to `0:01`.

- [x] Replace the generic `Current Page Name` eyebrow with the actual page name, and remove the duplicate large current page title so the header is a single line.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed `#toolKicker` changes to the active page name and no `h1` current-page title remains.

- [x] Collapse doubled `Settings` labels into a single Settings title.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed `.form-panel` has no duplicate `.eyebrow`; screenshot `/tmp/mm-ui-cleanup.png`.

- [x] Collapse doubled `Terminal Window` labels into a single Terminal Window title.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed `.job-panel` has no duplicate `.eyebrow`; screenshot `/tmp/mm-ui-cleanup.png`.

- [x] Change source placeholder text to `Supported URL or Local Media`.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed the source placeholder text exactly matches `Supported URL or Local Media`.

- [x] Move `[X]` and `> Run` controls into the Terminal Window area.
  - Add a `Reset` button where those controls currently are.
  - Reset should clear input fields and reset the active form to defaults.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed Run/Cancel are inside `.job-panel`, Reset is inside `.form-panel`, and Reset clears source/output values while restoring the End placeholder to `End time`.

- [x] Font path placeholder should show the detected default font.
  - Text format: `Default Font Detected: fontName`.
  - Status: Verified.
  - Evidence: `/api/health` returned `defaultFont.name` and Puppeteer confirmed the Font Path placeholder was `Default Font Detected: DejaVuSans-Bold` on this machine.

- [x] Input audio placeholder should list supported audio media types.
  - Text format starts with: `Supports MP3, WAV, ...`
  - Status: Verified.
  - Evidence: Puppeteer check confirmed the Input audio placeholder starts with `Supports MP3, WAV,`.

### Validation

- `npm test` passed.
- `npm run doctor` passed.
- `node --check web.js && node --check web/app.js` passed.
- `bash -n convert.sh audio_video.sh mememaker.sh video.sh music.sh lib.sh install.sh test.sh` passed.
- `git diff --check` passed.
- Browser verification screenshot: `/tmp/mm-ui-cleanup.png`.

## Notes

- Keep `HTML Animation` and `Experimental` behavior intact.
- Preserve the local-only server posture unless explicitly changing hosting.
