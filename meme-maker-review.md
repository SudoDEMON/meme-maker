# Meme Maker Code Review

Date: 2026-06-28

Scope: current WIP after Experimental blank-text and online-media support.

## Findings

1. **Medium: `/files` and `/download` still serve any repository file.**

   `publicFileUrl()` and `publicDownloadUrl()` only create links for expected outputs (`web.js:213`, `web.js:225`), but the request handler still accepts any repo-relative path under `/files/` or `/download/` and serves it from `REPO_ROOT` (`web.js:1219`, `web.js:1391`, `web.js:1396`). This is mostly contained by the default `127.0.0.1` bind, but it should be restricted before any broader host binding.

   Recommended fix: keep an allowlist of job output paths and uploaded/preview assets, or issue opaque per-file IDs instead of accepting raw repository paths.

2. **Low: remote Experimental preview scrubbing can repeatedly download one-second clips.**

   Remote preview now works by running `yt-dlp --download-sections` for the requested second, then extracting a PNG (`web.js:756`, `web.js:785`). This keeps implementation simple and accurate enough for local use, but rapid scrubbing on long or slow remote sources may be noticeably slow.

   Recommended fix: add a small per-source preview cache or a cancellable preview worker so repeated scrubs reuse the same downloaded clip/window.

## Fixed Or Verified

- Experimental Text 1 and Text 2 can both be blank; blank renders skip drawtext filters.
- Experimental input now accepts local GIF/MP4/WebM plus YouTube IDs/URLs and other installed-`yt-dlp` supported URLs.
- Malformed percent-encoded `/files` or static paths now return `400` instead of falling into the generic `500` handler.
- Decimal zero starts such as `0.0` and `0:00.0` now skip yt-dlp section mode like `0:00`.

## Top Experimental Recommendations

1. Add output-file allowlisting/opaque IDs before exposing the web server beyond localhost.
2. Cache or cancel remote preview extraction so scrubbing online media feels responsive.
3. Split crop width from final output width in the UI; right now crop width also drives output width.
4. Add progress/status text specific to remote preview downloads, separate from final render logs.
