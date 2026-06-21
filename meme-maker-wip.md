# Meme Maker WIP

Meme Maker WIP changes from user. Update this file as items move from planned
to implemented to verified.

## Current Pass

Status: Verified
Started: 2026-06-21
Last updated: 2026-06-21

## HTML Title
- [x] Change from `meme-maker` to `Meme Maker`.
  - Status: Verified.
  - Evidence: Puppeteer check confirmed `document.title` is `Meme Maker`.

## Start End Validation
- [x] Ensure start time is before end time.
  - Status: Verified.
  - Evidence: API check rejected `start=20` with `end=0:10`; Puppeteer check also showed the client-side `Start time must be before end time.` error.
- [x] When End time is queried, set it as current text instead of default.
  - Status: Verified.
  - Evidence: Puppeteer source probe on a generated 2-second MP4 set the End input value to `0:02`.
- [x] Make sure start and end times are actual times or supported formats (actual time vs seconds).
  - Status: Verified.
  - Evidence: API and Puppeteer checks rejected invalid `start=bogus`/`start=bad`; accepted supported seconds and `MM:SS` formats during source-probe/run checks.

## Experimental Wishlist
- [x] Allow you to scrub GIF/video.
  - Status: Verified.
  - Evidence: Experimental tab now has a scrub slider; Puppeteer check confirmed it initialized with `max=2` for a 2-second MP4 and loading the slider at `1` updated the preview/status to `0:01`.

## Validation

- `npm test` passed.
- `npm run doctor` passed.
- `node --check web.js && node --check web/app.js` passed.
- `bash -n convert.sh audio_video.sh mememaker.sh video.sh music.sh lib.sh install.sh test.sh` passed.
- `git diff --check` passed.
- Direct API validation checks passed for invalid format and start-after-end.
- Puppeteer UI verification passed for title, End auto-fill, client-side validation, and Experimental scrub.
- Browser verification screenshot: `/tmp/mm-wip-scrub.png`.
