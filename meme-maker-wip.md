# Meme Maker WIP

Meme Maker WIP changes from user. Update this file as items move from planned
to implemented to verified.

## Current Pass

Status: Verified
Started: 2026-06-21
Last updated: 2026-06-21

## Experimental Editor

- [x] Allow MP4 as Experimental input and output.
  - Status: Verified.
  - Notes: Experimental input accepts GIF/WebM/MP4. Output is an output name plus GIF/MP4/WebM dropdown.
  - Evidence: API jobs completed for MP4 input to MP4 output, GIF input to WebM output, and WebM input to GIF output.
- [x] Change scrub preview display to show current time/frame and total time/frames.
  - Status: Verified.
  - Notes: `/api/source-info` now returns width, height, FPS, and frame count when available.
  - Evidence: Browser check showed `Current: 0:00.5/6 Total: 0:01.5/18`.
- [x] Keep slider and allow time/frame fields to be editable jumps.
  - Status: Verified.
  - Notes: Current time and current frame controls sync with the slider and reload the preview frame.
  - Evidence: Puppeteer changed the frame input to `6`; preview label updated to frame 6.
- [x] Add Output FPS option.
  - Status: Verified.
  - Notes: Experimental sends `--fps`; `mememaker.sh` supports `--fps`/`--output-fps`.
  - Evidence: `ffprobe` confirmed generated MP4 at 12 fps, WebM at 10 fps, and GIF at 10 fps.
- [x] Under input show resolution, total time, FPS, and frame count.
  - Status: Verified.
  - Evidence: Browser status showed `Resolution 320x180`, `Total 0:01.5`, `FPS 12`, and `Frames 18`.
- [x] Remove Load Frame because preview loads automatically.
  - Status: Verified.
  - Notes: Input changes, uploads, and scrub jumps auto-load preview frames.
  - Evidence: Puppeteer confirmed `#previewButton` is absent and preview auto-loaded after entering MP4 input.
- [x] Add more style options.
  - Status: Verified.
  - Notes: Bold, italic, underline, and strikethrough are available in preview and render path.
  - Evidence: Puppeteer confirmed all style controls are present; API render passed underline/strikethrough flags.

## Validation

- `npm test` passed.
- `npm run doctor` passed.
- `node --check web.js && node --check web/app.js` passed.
- `bash -n convert.sh audio_video.sh mememaker.sh video.sh music.sh lib.sh install.sh test.sh` passed.
- `git diff --check` passed.
- `/api/source-info` returned resolution/FPS/frame metadata for generated MP4/GIF/WebM fixtures.
- `/api/preview-frame` loaded a scrubbed MP4 frame at `0:01`.
- Experimental API jobs completed:
  - `.web-uploads/experimental-input.mp4` -> `videos/experimental-mp4-output.mp4`
  - `.web-uploads/experimental-input.gif` -> `videos/experimental-webm-output.webm`
  - `.web-uploads/experimental-input.webm` -> `gifs/experimental-gif-output.gif`
- `ffprobe` confirmed MP4/H.264 at 12 fps, WebM/VP9 at 10 fps, and GIF at 10 fps.
- Puppeteer UI verification passed for input label/accept list, output dropdown, removed Load Frame button, Output FPS, editable time/frame controls, metadata display, and style controls.
- Browser verification screenshot: `/tmp/mm-experimental-wip.png`.
