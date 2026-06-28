# Meme Maker WIP

Meme Maker WIP changes from user. Update this file as items move from planned
to implemented to verified.

## Experimental Changes

- [x] Allow Text fields to be blank.
  - Status: Verified.
  - Notes: The Experimental backend no longer rejects empty Text 1 + Text 2. Blank text renders trim/crop/format output without drawtext filters.
- [x] Allow input to be online media.
  - Status: Verified.
  - Notes: Experimental accepts local GIF/MP4/WebM plus YouTube IDs/URLs and other `yt-dlp`-supported URLs. Remote preview frames use a temporary one-second `yt-dlp` download, and remote renders use `mememaker.sh` remote mode with the visual editor options.

## Additional Ask
- [x] Code Review.
  - Status: Completed.
  - Notes: Review notes were refreshed in `meme-maker-review.md`.
- [x] Top recommendations for Experimental page.
  - Status: Completed.
  - Notes: Recommendations were added to `meme-maker-review.md`.

## Validation

- `npm test` covers blank text, remote Experimental preview/job creation, and decimal-zero yt-dlp section handling.
- `npm run doctor` checks local dependencies and linked commands.
- `git diff --check` checks whitespace.
