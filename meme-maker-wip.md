# Meme Maker WIP

Meme Maker WIP changes from user. Update this file as items move from planned
to implemented to verified.

## Current Pass

Status: Verified
Started: 2026-06-21
Last updated: 2026-06-21

## Experimental

- [x] Change unloaded input properties text.
  - Status: Verified.
  - Target: `Input properties: Resolution • Length • Frames • FPS`
  - Evidence: Puppeteer confirmed the exact unloaded text.
- [x] Change loaded input properties text.
  - Status: Verified.
  - Target: `Input properties: Resolution $width × $height • Length 0:00 • Frames $totalframe • FPS $fps`
  - Evidence: Puppeteer confirmed `Input properties: Resolution 320 × 180 • Length 0:02 • Frames 24 • FPS 12`.
- [x] Add Output Start and Output End under Output.
  - Status: Verified.
  - Notes: Fields accept time values such as `0:01.5` and frame values such as `18f` or `frame 18`.
  - Evidence: Puppeteer confirmed both fields are present with time/frame placeholders.
- [x] Validate Output Start and Output End formats.
  - Status: Verified.
  - Evidence: Direct API check rejected invalid `Output Start=start`.
- [x] Validate Output Start is before Output End.
  - Status: Verified.
  - Evidence: Browser and API checks rejected `Output Start=18f` with `Output End=6f`.
- [x] Apply Output Start and Output End to the rendered output.
  - Status: Verified.
  - Evidence: API render with `Output Start=6f`, `Output End=18f`, and a 12 FPS input produced a 1.000000 second MP4.
- [x] Add Text 1 and Text 2 location boxes.
  - Status: Verified.
  - Target: `Location: $X/$Y`
  - Evidence: Puppeteer confirmed initial locations and that dragging Text 1 updated the visible location box to match hidden x/y fields.

## Validation

- `npm test` passed.
- `npm run doctor` passed.
- `node --check web/app.js && node --check web.js` passed.
- `bash -n convert.sh audio_video.sh mememaker.sh video.sh music.sh lib.sh install.sh test.sh` passed.
- `git diff --check` passed.
- Direct API validation passed for invalid Output Start format, Start after End, and frame-based output trimming.
- Puppeteer UI verification passed for unloaded/loaded input properties text, Output Start/End fields, location boxes, drag-updated location, and client-side Start/End validation.
- Browser verification screenshot: `/tmp/mm-experimental-range-location.png`.
