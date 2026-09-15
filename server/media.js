'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT, UPLOAD_ROOT, LOCAL_VIDEO_INPUT_EXTS_WITH_DOTS, PREVIEW_PROCESS_TIMEOUT_MS, MAX_REMOTE_PREVIEW_CACHE_ENTRIES } = require('./config');
const { clean, basenameNoExt, required, sourceFallbackStem, safeStem, extractYouTubeId, ytDlpProbeSource, ytDlpNetworkArgs, isLocalSource, resolveInputPath, parseTimeValue } = require('./inputs');
const { runProcess, runCapture } = require('./processes');
const { publicFileUrl } = require('./files');
const remotePreviewCache = new Map();

function durationLabel(seconds) {
  if (seconds === null || seconds === undefined || seconds === '') return '';
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return '';
  const total = Math.round(value);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function parseFrameRate(value) {
  const raw = clean(value);
  if (!raw || raw === '0/0') return null;
  if (raw.includes('/')) {
    const [numerator, denominator] = raw.split('/').map(Number);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      const rate = numerator / denominator;
      return rate > 0 ? rate : null;
    }
    return null;
  }
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function mediaFrameInfo(streams, duration) {
  const video = (Array.isArray(streams) ? streams : []).find(stream => stream.codec_type === 'video') || {};
  const fps = parseFrameRate(video.avg_frame_rate) || parseFrameRate(video.r_frame_rate);
  const exactFrames = Number(video.nb_frames);
  const estimatedFrames = Number.isFinite(duration) && fps ? Math.round(duration * fps) : null;
  const frameCount = Number.isFinite(exactFrames) && exactFrames > 0 ? exactFrames : estimatedFrames;
  return {
    width: Number(video.width) || null,
    height: Number(video.height) || null,
    fps,
    frameCount: Number.isFinite(frameCount) && frameCount > 0 ? frameCount : null
  };
}

function remoteMediaInfo(info, raw, remote) {
  const formats = Array.isArray(info.formats) ? info.formats : [];
  const bestVideo = formats
    .filter(format => positiveNumber(format.width) && positiveNumber(format.height))
    .sort((a, b) => {
      const aArea = positiveNumber(a.width) * positiveNumber(a.height);
      const bArea = positiveNumber(b.width) * positiveNumber(b.height);
      return bArea - aArea;
    })[0] || {};
  const duration = positiveNumber(info.duration);
  const fps = positiveNumber(info.fps, bestVideo.fps);
  const width = positiveNumber(info.width, bestVideo.width);
  const height = positiveNumber(info.height, bestVideo.height);
  const frameCount = duration && fps ? Math.round(duration * fps) : null;
  const defaultStem = safeStem(info.id || info.display_id || info.title || sourceFallbackStem(raw), sourceFallbackStem(raw));

  return {
    ok: true,
    supported: true,
    kind: 'remote',
    source: remote,
    title: info.title || '',
    id: info.id || info.display_id || extractYouTubeId(raw) || '',
    extractor: info.extractor_key || info.extractor || '',
    webpageUrl: info.webpage_url || remote,
    defaultStem,
    duration,
    durationLabel: durationLabel(duration),
    width,
    height,
    fps,
    frameCount: Number.isFinite(frameCount) && frameCount > 0 ? frameCount : null
  };
}

async function inspectSource(value) {
  const raw = required({ value }, 'value', 'Source');
  const resolved = path.resolve(REPO_ROOT, raw);

  if (fs.existsSync(resolved)) {
    const { stdout } = await runCapture('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate,nb_frames',
      '-of', 'json',
      resolved
    ]);
    const info = JSON.parse(stdout || '{}');
    const duration = Number(info.format && info.format.duration);
    const streams = Array.isArray(info.streams) ? info.streams : [];
    const frameInfo = mediaFrameInfo(streams, duration);
    return {
      ok: true,
      supported: true,
      kind: 'local',
      source: raw,
      fileUrl: publicFileUrl(raw),
      title: path.basename(resolved),
      defaultStem: sourceFallbackStem(raw),
      duration: Number.isFinite(duration) ? duration : null,
      durationLabel: durationLabel(duration),
      width: frameInfo.width,
      height: frameInfo.height,
      fps: frameInfo.fps,
      frameCount: frameInfo.frameCount,
      format: info.format && info.format.format_name || '',
      streams
    };
  }

  const remote = ytDlpProbeSource(raw);
  const { stdout } = await runCapture('yt-dlp', [
    ...ytDlpNetworkArgs(),
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-playlist',
    remote
  ]);
  const info = JSON.parse(stdout || '{}');
  return remoteMediaInfo(info, raw, remote);
}

// Cache completed and in-flight metadata by source identity, not browser form.
const sourceCache = new Map();
async function sourceInfo(value) {
  const raw = required({ value }, 'value', 'Source');
  const resolved = path.resolve(REPO_ROOT, raw);
  const stat = await fs.promises.stat(resolved).catch(() => null);
  const key = stat ? `${resolved}:${stat.size}:${stat.mtimeMs}` : ytDlpProbeSource(raw);
  const cached = sourceCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = inspectSource(raw);
  sourceCache.set(key, { promise, expires: Date.now() + 300000 });
  while (sourceCache.size > 100) sourceCache.delete(sourceCache.keys().next().value);
  try { return await promise; }
  catch (err) { sourceCache.delete(key); throw err; }
}

async function downloadRemotePreviewClip(input, seconds, signal) {
  const dir = path.join(UPLOAD_ROOT, 'previews');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${Date.now()}-${crypto.randomUUID()}-remote.mp4`);
  const remote = ytDlpProbeSource(input);
  const requestedSeconds = Math.max(0, Number(seconds) || 0);
  const start = Math.floor(requestedSeconds);
  const end = start + 1;
  const cacheKey = `${remote}\n${start}`;
  const cached = remotePreviewCache.get(cacheKey);
  if (cached && fs.existsSync(cached.path)) {
    const stat = fs.statSync(cached.path);
    if (stat.isFile() && stat.size > 0) {
      cached.lastUsed = Date.now();
      return {
        path: cached.path,
        seekSeconds: Math.max(0, requestedSeconds - start)
      };
    }
    remotePreviewCache.delete(cacheKey);
  }

  const args = [
    ...ytDlpNetworkArgs(),
    '-f', 'bv*[ext=mp4]+ba/b[ext=mp4]/bv*+ba/best',
    '--merge-output-format', 'mp4',
    '--force-overwrites',
    '--no-playlist',
    '-o', target,
    '--download-sections', `*${start}-${end}`,
    '--force-keyframes-at-cuts',
    remote
  ];

  try {
    await runProcess('yt-dlp', args, { timeoutMs: PREVIEW_PROCESS_TIMEOUT_MS, signal });
  } catch (err) {
    for (const suffix of ['', '.mp4', '.part', '.ytdl']) fs.rm(target + suffix, { force: true }, () => {});
    throw err;
  }

  let mediaPath = target;
  if (!fs.existsSync(target) && fs.existsSync(`${target}.mp4`)) {
    mediaPath = `${target}.mp4`;
  }
  const stat = fs.existsSync(mediaPath) ? fs.statSync(mediaPath) : null;
  if (!stat || !stat.isFile() || stat.size === 0) {
    throw new Error('yt-dlp produced no preview media for this source.');
  }
  if (MAX_REMOTE_PREVIEW_CACHE_ENTRIES <= 0) {
    return { path: mediaPath, seekSeconds: Math.max(0, requestedSeconds - start), temporary: true };
  }
  remotePreviewCache.set(cacheKey, {
    path: mediaPath,
    createdAt: Date.now(),
    lastUsed: Date.now()
  });
  pruneRemotePreviewCache();
  return {
    path: mediaPath,
    seekSeconds: Math.max(0, requestedSeconds - start)
  };
}

async function createPreviewFrame(input, time = '0', signal) {
  const seconds = parseTimeValue(time, { allowBlank: true, label: 'Preview time' }) || 0;
  const local = isLocalSource(input);
  let source;
  let cleanupSource = '';
  let seekSeconds = seconds;

  if (local) {
    source = resolveInputPath(input, 'Preview input');
    const ext = path.extname(source).toLowerCase();
    if (!LOCAL_VIDEO_INPUT_EXTS_WITH_DOTS.includes(ext)) {
      throw new Error('Preview input must be a supported URL or a GIF, MOV, MP4, or WebM file.');
    }
  } else {
    const previewClip = await downloadRemotePreviewClip(input, seconds, signal);
    source = previewClip.path;
    if (previewClip.temporary) cleanupSource = source;
    seekSeconds = previewClip.seekSeconds;
  }

  const dir = path.join(UPLOAD_ROOT, 'previews');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.png`);
  const args = ['-y'];
  if (seekSeconds > 0) args.push('-ss', String(seekSeconds));
  args.push('-i', source, '-frames:v', '1', '-update', '1', target);
  try {
    await runProcess('ffmpeg', args, { timeoutMs: PREVIEW_PROCESS_TIMEOUT_MS, signal });
    if (!fs.existsSync(target)) throw new Error('No frame at this time. Choose an earlier frame.');
  } catch (err) {
    fs.rm(target, { force: true }, () => {});
    throw err;
  } finally {
    if (cleanupSource) fs.rm(cleanupSource, { force: true }, () => {});
  }
  const rel = path.relative(REPO_ROOT, target).split(path.sep).join('/');
  return {
    path: rel,
    fileUrl: publicFileUrl(rel)
  };
}

function pruneRemotePreviewCache() {
  const maxEntries = Math.max(0, Number(MAX_REMOTE_PREVIEW_CACHE_ENTRIES) || 0);
  if (maxEntries === 0) {
    for (const entry of remotePreviewCache.values()) {
      fs.rm(entry.path, { force: true }, () => {});
    }
    remotePreviewCache.clear();
    return;
  }

  for (const [key, entry] of remotePreviewCache) {
    if (!fs.existsSync(entry.path)) remotePreviewCache.delete(key);
  }

  const entries = [...remotePreviewCache.entries()]
    .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));
  while (entries.length > maxEntries) {
    const [key, entry] = entries.shift();
    remotePreviewCache.delete(key);
    fs.rm(entry.path, { force: true }, () => {});
  }
}

module.exports = { sourceInfo, createPreviewFrame };
