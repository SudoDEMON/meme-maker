# Meme Maker Review Follow-up

Date: 2026-09-15

## Delivered

- Replaced six workflow tabs with Media Tools and Meme Editor.
- Shared media library, ordered multi-clip combining, audio extraction/replacement,
  and completed-output handoff to the editor without re-uploading.
- Combined caption forms into the visual editor with a classic layout preset,
  adjacent caption controls, nearby trim controls, and advanced settings.
- Replaced the terminal-first result view with playback, download, and expandable logs.

## Correctness Fixes

- Captions render in source coordinates before crop/resize, keeping position,
  size, and borders aligned with the preview. Browser previews load server fonts.
- Drafts survive section switches and refreshes in the current tab.
- Source inspection only updates metadata hints; entered trim values are preserved.
- Older preview responses cannot change the latest source/frame selection.
- Remote metadata inspection is asynchronous, cached, and shared between probing
  and job preparation; unrelated requests and cancellation remain responsive.
- Superseded preview downloads are cancelled, with process-group termination.
- Event-stream disconnection keeps the job running in the UI while reconnecting;
  a fast cancellation cannot be replaced by a late “Cancelling” status.
- Registered output routes support byte-range requests for browser playback.

## Validation

`npm run check` runs CLI smoke tests, server tests with real FFmpeg renders,
and Chromium workflow regression tests. Remote downloads use deterministic
fixtures. Windows/macOS runtime behavior and live external downloader services
are not covered by the Linux browser tests.

## Remaining Boundaries

- The runner is intended for local use.
- Active jobs do not survive server restarts.
- Uploads and extracted preview frames remain local scratch files until removed
  manually; removing a browser library entry does not delete source media.
- Remote sources use frame previews. Local playback depends on browser codec support.
