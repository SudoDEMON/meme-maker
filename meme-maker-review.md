# Meme Maker Code Review

Date: 2026-06-21

Scope: current `main` at `61733d1` (`Add experimental output range controls`). Untracked local files `fonts/` and `.meme-maker-wip.md.kate-swp` were excluded from the review.

## Findings

1. **Medium: `/files` and `/download` can serve arbitrary repository files, not just generated outputs.**

   `publicFileUrl()` and `publicDownloadUrl()` generate links for known output paths (`web.js:213` and `web.js:225`), but the request handler accepts any repo-relative path under `/files/` or `/download/` and serves it directly from `REPO_ROOT` (`web.js:1219`, `web.js:1392`, `web.js:1397`). I confirmed `GET /files/README.md` returns `200`.

   This is mostly mitigated while the server is bound to `127.0.0.1`, but it becomes a real information disclosure issue if the runner is hosted or bound to a wider interface. A remote user could fetch source files, `.git` metadata, uploaded files, or accidental repo-local secrets. Restrict these endpoints to an allowlist such as generated job output paths plus explicit upload/font paths, or issue opaque per-file IDs instead of accepting a raw repo path.

2. **Low: decimal zero start times force the yt-dlp section path instead of the full-download path.**

   `looks_like_time()` accepts decimal seconds such as `0.0` (`lib.sh:257`), but `is_zero_time()` only treats integer/colon forms as zero (`lib.sh:311`). `needs_yt_dlp_section()` then treats `start=0.0` with blank end as a nonzero trim request (`lib.sh:318`). I confirmed `needs_yt_dlp_section 0.0 ""` returns true while `needs_yt_dlp_section 0:00 ""` returns false.

   This affects the remote download paths that add `--download-sections` when `needs_yt_dlp_section` is true, including `video.sh:203`, `music.sh:64`, `convert.sh:73`, and `audio_video.sh:63`. The output should still usually work, but it can be slower and more brittle than the intended full-download path. Normalize decimal zero in `is_zero_time()` or parse time values numerically before deciding whether a section is needed.

3. **Low: malformed percent-encoded paths return `500` instead of a client error.**

   `decodeURIComponent()` is called without local `URIError` handling in both the output-file path and static-file path (`web.js:1221`, `web.js:1403`). I confirmed `GET /files/%E0%A4%A` returns `500` with `URI malformed`; the server stays alive, but this is user-controlled input and should be reported as `400 Bad Request` rather than an internal error.

   Wrap path decoding in a small helper that catches `URIError` and returns a 400 response before entering the generic `handleRequest()` catch.

## Notes

- The Experimental UI and job builder already accept GIF/WebM/MP4 input and GIF/MP4/WebM output in the reviewed state (`web/app.js:336`, `web/app.js:351`, `web.js:886`).
- Validation passed: `bash -n ...`, `node --check web.js capture.js web/app.js`, `npm test`, and `npm run doctor`.
