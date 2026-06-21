# Meme Maker WIP

Meme Maker WIP changes from user. Update this file as items move from planned
to implemented to verified.

## Current Pass

Status: Verified
Started: 2026-06-21
Last updated: 2026-06-21

## Experimental UI Changes

- [x] Shorten the Output format dropdown.
  - Status: Verified.
  - Evidence: Browser layout check measured Output at 877px and Output format at 209px.
- [x] Shorten the Output FPS input.
  - Status: Verified.
  - Evidence: Browser layout check measured Output at 877px and Output FPS at 209px.
- [x] Match the requested Settings layout order.
  - Status: Verified.
  - Target layout:
    - Text: `Input: GIF / MP4 / WebM`
    - Field: Input + Browse
    - Text: `Input properties: Resolution $RES * Total time $TIME * Frames $TFRAME * FPS $FPS`
    - Field: Output + Output format + Output FPS
    - Textbox: Top text + Bottom text
    - Field: Font face + Font size
    - Checkboxes: Font styles
    - Field: Font path
    - Field: Current time + Current frame
    - Text below fields: Total time + Total frames
    - Slider
    - Preview window
  - Evidence: Puppeteer verified row/order relationships for output controls, textboxes, font controls, current fields, total fields, slider, and preview.

## Validation

- `npm test` passed.
- `npm run doctor` passed.
- `node --check web/app.js && node --check web.js` passed.
- `bash -n convert.sh audio_video.sh mememaker.sh video.sh music.sh lib.sh install.sh test.sh` passed.
- Browser/Puppeteer layout verification passed.
- Browser verification screenshot: `/tmp/mm-experimental-layout.png`.
