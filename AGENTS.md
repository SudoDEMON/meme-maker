# AGENTS.md - meme-maker

## Overview

`meme-maker` is a personal toolkit of Bash, ffmpeg, yt-dlp, and small Node/Puppeteer helpers for making clips, captioned GIFs/MP4s, audio stings, and browser-animation captures.

## Start Here

- Read `project-memory.md` first. Start with the "Current State + Recent Activity" section and the most recent 2-3 entries before changing scripts.
- Check `git status --short --branch` before edits. This repo often has active local script work.
- Use worktrees for risky or parallel work: `~/worktrees/meme-maker-<task-slug>` with branches like `agent/codex/<task-slug>`.

## Verification

Use focused checks based on what changed:

```bash
npm run doctor
npm test
bash -n lib.sh mememaker.sh video.sh music.sh build.sh install.sh
```

If touching `capture.js` or browser capture behavior:

```bash
node --check capture.js
npm run build
```

## Project Rules

- Be careful with temp-file logic around `yt-dlp` and ffmpeg. Read the recent memory entries before changing it.
- Keep the scripts simple and directly usable from a shell.
- Do not commit generated media, `node_modules/`, temp frames, project memory, local AI state, or scratch output.
- If behavior, setup, dependencies, or command usage changes, update `README.md`.
