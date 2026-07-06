# Meme Maker Code Review

Date: 2026-07-02

Scope: current state after addressing the 2026-07-02 review findings.

## Findings

No blocking findings in the current review pass.

## Fixed Or Verified

- Web job cancellation now signals the spawned process group and escalates to SIGKILL if needed, so active ffmpeg/yt-dlp children are not left running after Cancel.
- `/files` and `/download` now serve only paths registered by the current server process through generated job/upload/preview links. Arbitrary repo-relative paths such as `/files/README.md` return `404`.
- Remote Experimental preview clips are cached by normalized source and integer-second window; repeated scrub requests within the same second reuse the same short yt-dlp download.
- Experimental preview status now distinguishes online preview clip fetching from local preview frame rendering.
- Remote Experimental preview yt-dlp/ffmpeg helper processes have a configurable timeout via `MM_WEB_PREVIEW_TIMEOUT_MS`.
- Experimental crop size is now independent from output width; the tab has an explicit Output width field and crop dragging no longer rewrites it.
- Experimental Text 1 and Text 2 can both be blank; blank renders skip drawtext filters.
- Experimental input now accepts local GIF/MP4/WebM plus YouTube IDs/URLs and other installed-`yt-dlp` supported URLs.
- Malformed percent-encoded `/files` or static paths now return `400` instead of falling into the generic `500` handler.
- Decimal zero starts such as `0.0` and `0:00.0` now skip yt-dlp section mode like `0:00`.
- Validation passed: `npm test`, `npm run doctor`, `bash -n`, `node --check web.js`, `node --check web/app.js`, and `git diff --check`.

## Top Experimental Recommendations

1. Consider request-level cancellation for remote preview work if the browser aborts a fetch mid-download.
