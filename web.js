#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const REPO_ROOT = __dirname;
const WEB_ROOT = path.join(REPO_ROOT, 'web');
const UPLOAD_ROOT = path.join(REPO_ROOT, '.web-uploads');
const HOST = process.env.MM_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.MM_WEB_PORT || process.env.PORT || 3001);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = Number(process.env.MM_WEB_MAX_UPLOAD_BYTES || 500 * 1024 * 1024);
const SOURCE_INFO_TIMEOUT_MS = Number(process.env.MM_WEB_SOURCE_INFO_TIMEOUT_MS || 15000);

const jobs = new Map();
let defaultFontCache = null;

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttc': 'font/collection',
  '.ttf': 'font/ttf',
  '.webm': 'video/webm'
};

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function basenameNoExt(value) {
  return path.basename(clean(value)).replace(/\.[^.]+$/, '');
}

function required(fields, name, label = name) {
  const value = clean(fields[name]);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function optional(fields, name) {
  return clean(fields[name]);
}

function optionalInteger(fields, name, label = name, fallback = '') {
  const value = optional(fields, name) || fallback;
  if (value && !/^[0-9]+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function optionalPositiveNumber(fields, name, label = name, fallback = '') {
  const value = optional(fields, name) || fallback;
  if (value && !/^[0-9]+(?:\.[0-9]+)?$/.test(value)) {
    throw new Error(`${label} must be a positive number.`);
  }
  if (value && Number(value) <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return value;
}

function parseFrameBoundary(value, metadata, { allowBlank = true, label = 'Output boundary' } = {}) {
  const raw = clean(value);
  if (!raw) {
    if (allowBlank) return null;
    throw new Error(`${label} is required.`);
  }

  const frameMatch = raw.match(/^(?:#|frame\s*:?\s*)?([0-9]+)\s*(?:f|frames?)$/i)
    || raw.match(/^frame\s+([0-9]+)$/i);
  if (frameMatch) {
    const frame = Number(frameMatch[1]);
    if (!Number.isInteger(frame) || frame < 0) {
      throw new Error(`${label} frame must be a non-negative whole number.`);
    }
    const fps = Number(metadata && metadata.fps) || 0;
    if (fps <= 0) {
      throw new Error(`${label} uses a frame value, but source FPS is not available.`);
    }
    return { kind: 'frame', raw, frame, seconds: frame / fps };
  }

  return {
    kind: 'time',
    raw,
    frame: null,
    seconds: parseTimeValue(raw, { label })
  };
}

function parseTimeValue(value, { allowBlank = false, allowInf = false, label = 'Time' } = {}) {
  const raw = clean(value);
  if (!raw) {
    if (allowBlank) return null;
    throw new Error(`${label} is required.`);
  }
  if (allowInf && raw.toLowerCase() === 'inf') return Infinity;
  if (!/^[0-9]+(?::[0-9]+){0,2}(?:\.[0-9]+)?$/.test(raw)) {
    throw new Error(`${label} must be seconds, MM:SS, HH:MM:SS, or ${allowInf ? 'inf' : 'a valid time'}.`);
  }

  const parts = raw.split(':');
  const seconds = Number(parts[parts.length - 1]);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`${label} must be a valid time.`);
  }
  if (parts.length > 1 && seconds >= 60) {
    throw new Error(`${label} seconds must be less than 60 when using colon format.`);
  }

  let total = seconds;
  if (parts.length >= 2) {
    const minutes = Number(parts[parts.length - 2]);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 60) {
      throw new Error(`${label} minutes must be a whole number less than 60 when using colon format.`);
    }
    total += minutes * 60;
  }
  if (parts.length === 3) {
    const hours = Number(parts[0]);
    if (!Number.isInteger(hours) || hours < 0) {
      throw new Error(`${label} hours must be a non-negative whole number.`);
    }
    total += hours * 3600;
  }
  return total;
}

function validateTimeRange(fields, { requireStart = true, allowBlankEnd = true } = {}) {
  const start = requireStart ? required(fields, 'start', 'Start time') : optional(fields, 'start');
  const end = optional(fields, 'end');
  const startSeconds = parseTimeValue(start, { allowBlank: !requireStart, label: 'Start time' });
  const endSeconds = parseTimeValue(end, { allowBlank: allowBlankEnd, allowInf: true, label: 'End time' });
  if (startSeconds !== null && endSeconds !== null && endSeconds !== Infinity && startSeconds >= endSeconds) {
    throw new Error('Start time must be before end time.');
  }
  return { start: start || '0:00', end };
}

function detectDefaultFont() {
  if (defaultFontCache) return defaultFontCache;

  const fallback = { name: 'system font', path: '' };
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/TTF/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/SFNS.ttf',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (found) {
    defaultFontCache = { name: basenameNoExt(found), path: found };
    return defaultFontCache;
  }

  const fc = spawnSync('fc-match', ['-f', '%{family}\n%{file}\n', 'sans-serif:weight=bold'], {
    encoding: 'utf8',
    timeout: 3000
  });
  if (!fc.error && fc.status === 0) {
    const lines = fc.stdout.split('\n').map(line => clean(line)).filter(Boolean);
    if (lines.length > 0) {
      const name = lines[0].split(',')[0] || lines[0];
      defaultFontCache = { name, path: lines[1] || '' };
      return defaultFontCache;
    }
  }

  defaultFontCache = fallback;
  return defaultFontCache;
}

function safeStem(value, fallback = 'clip') {
  const stem = clean(value).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return stem || fallback;
}

function safeSegment(value, fallback = 'file') {
  return safeStem(value, fallback).replace(/^\.+/, '') || fallback;
}

function outputStem(value, fallback) {
  return safeStem(path.basename(clean(value)).replace(/\.[^.]+$/, '') || fallback, fallback);
}

function repoPath(...parts) {
  return path.join(REPO_ROOT, ...parts);
}

function publicFileUrl(outputPath) {
  if (!outputPath) return null;

  const resolved = path.resolve(REPO_ROOT, outputPath);
  const rel = path.relative(REPO_ROOT, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  return `/files/${rel.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function publicDownloadUrl(outputPath) {
  if (!outputPath) return null;

  const resolved = path.resolve(REPO_ROOT, outputPath);
  const rel = path.relative(REPO_ROOT, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  return `/download/${rel.split(path.sep).map(encodeURIComponent).join('/')}`;
}

function extractYouTubeId(value) {
  const raw = clean(value);
  if (!raw) return '';
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      id = url.searchParams.get('v') || '';
      if (!id) {
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex(part => ['shorts', 'embed', 'v'].includes(part));
        if (marker >= 0) id = parts[marker + 1] || '';
      }
    }
    id = clean(id).split(/[?&#/]/)[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

function looksLikeUrl(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(clean(value));
}

function sourceFallbackStem(value, fallback = 'media') {
  const raw = clean(value);
  const ytId = extractYouTubeId(raw);
  if (ytId) return safeStem(ytId, fallback);

  if (looksLikeUrl(raw)) {
    try {
      const url = new URL(raw);
      const pathStem = safeStem(path.posix.basename(url.pathname).replace(/\.[^.]+$/, ''), '');
      return pathStem || safeStem(url.hostname.replace(/^www\./, ''), fallback);
    } catch {
      return safeStem(raw, fallback);
    }
  }

  return safeStem(path.basename(raw).replace(/\.[^.]+$/, ''), fallback);
}

function ytDlpSource(value) {
  const raw = clean(value);
  const ytId = extractYouTubeId(raw);
  if (ytId) return ytId;
  if (looksLikeUrl(raw)) return raw;
  throw new Error('Source must be a local file, a YouTube ID, or a supported media URL.');
}

function ytDlpProbeSource(value) {
  const raw = clean(value);
  const ytId = extractYouTubeId(raw);
  if (ytId) return `https://www.youtube.com/watch?v=${ytId}`;
  if (looksLikeUrl(raw)) return raw;
  throw new Error('Source must be a local file, a YouTube ID, or a supported media URL.');
}

function resolveJobSource(value, label = 'Source') {
  const raw = clean(value);
  if (!raw) {
    throw new Error(`${label} is required.`);
  }

  const resolved = path.resolve(REPO_ROOT, raw);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return ytDlpSource(raw);
}

function isLocalSource(value) {
  const raw = clean(value);
  return Boolean(raw && fs.existsSync(path.resolve(REPO_ROOT, raw)));
}

function defaultDirForExt(ext) {
  switch (ext) {
    case 'gif': return 'gifs';
    case 'mp3': return 'Audio';
    case 'png': return 'frames';
    case 'mp4':
    case 'webm':
    default:
      return 'videos';
  }
}

function normalizeOutputPath(value, { defaultExt, allowedExts, fallbackStem, defaultDir }) {
  const raw = clean(value).replaceAll('\\', '/');
  const allowed = allowedExts || [defaultExt];
  const fallback = safeStem(fallbackStem, 'output');
  const baseDir = defaultDir || defaultDirForExt(defaultExt);

  if (!raw) {
    return `${baseDir}/${fallback}.${defaultExt}`;
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) || raw.startsWith('/')) {
    throw new Error('Output paths must be relative to this project.');
  }

  const parts = raw.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) {
    throw new Error('Output paths cannot contain . or .. segments.');
  }

  let filename = parts.pop() || fallback;
  const parsed = path.posix.parse(filename);
  const ext = parsed.ext ? parsed.ext.slice(1).toLowerCase() : '';
  const finalExt = allowed.includes(ext) ? ext : defaultExt;
  const rawName = ext ? parsed.name : filename;
  filename = `${safeSegment(rawName, fallback)}.${finalExt}`;

  const dirs = parts.map((part, index) => safeSegment(part, `folder${index + 1}`));
  if (dirs.length === 0) {
    dirs.push(defaultDir || defaultDirForExt(finalExt));
  }

  return path.posix.join(...dirs, filename);
}

function normalizeVideoOutput(out, fallbackStem = 'clip', fallbackFormat = 'mp4') {
  return normalizeOutputPath(out, {
    defaultExt: fallbackFormat,
    allowedExts: ['mp4', 'webm'],
    fallbackStem,
    defaultDir: 'videos'
  });
}

function normalizeMediaOutput(out, format, fallbackStem = 'media') {
  validateFormat(format, ['gif', 'mp3', 'mp4', 'webm']);
  return normalizeOutputPath(out, {
    defaultExt: format,
    allowedExts: [format],
    fallbackStem,
    defaultDir: defaultDirForExt(format)
  });
}

function outputExt(outputPath) {
  return path.posix.extname(outputPath).slice(1).toLowerCase();
}

function uploadName(originalName) {
  const parsed = path.parse(clean(originalName) || 'upload');
  const base = safeSegment(parsed.name, 'upload');
  const ext = parsed.ext ? parsed.ext.toLowerCase().replace(/[^.A-Za-z0-9]/g, '') : '';
  return `${Date.now()}-${crypto.randomUUID()}-${base}${ext}`;
}

function resolveInputPath(value, label = 'Input') {
  const raw = clean(value);
  if (!raw) {
    throw new Error(`${label} is required.`);
  }

  const resolved = path.resolve(REPO_ROOT, raw);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${label} not found: ${raw}`);
  }
  return resolved;
}

function validateMediaInputExtension(value, allowed, label = 'Input media') {
  const ext = path.extname(clean(value)).slice(1).toLowerCase();
  if (!allowed.includes(ext)) {
    throw new Error(`${label} must be one of: ${allowed.map(item => item.toUpperCase()).join(', ')}.`);
  }
}

function localFrameMetadata(inputPath) {
  const probe = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_frames',
    '-of', 'json',
    inputPath
  ], {
    encoding: 'utf8',
    timeout: 5000
  });
  if (probe.error || probe.status !== 0) {
    return {};
  }

  try {
    const info = JSON.parse(probe.stdout || '{}');
    const duration = Number(info.format && info.format.duration);
    return mediaFrameInfo(Array.isArray(info.streams) ? info.streams : [], duration);
  } catch {
    return {};
  }
}

function parseCropFields(fields, metadata = {}) {
  const rawX = optional(fields, 'cropX');
  const rawY = optional(fields, 'cropY');
  const rawWidth = optional(fields, 'cropWidth');
  const rawHeight = optional(fields, 'cropHeight');
  if (!rawX && !rawY && !rawWidth && !rawHeight) return null;

  const x = Number(optionalInteger(fields, 'cropX', 'Crop x', '0'));
  const y = Number(optionalInteger(fields, 'cropY', 'Crop y', '0'));
  const width = Number(optionalInteger(fields, 'cropWidth', 'Crop width', '0'));
  const height = Number(optionalInteger(fields, 'cropHeight', 'Crop height', '0'));

  if (width === 0 && height === 0) return null;
  if (width <= 0 || height <= 0) {
    throw new Error('Crop width and height must be greater than zero.');
  }

  const sourceWidth = Number(metadata.width) || 0;
  const sourceHeight = Number(metadata.height) || 0;
  if (sourceWidth > 0 && sourceHeight > 0) {
    if (x >= sourceWidth || y >= sourceHeight || x + width > sourceWidth || y + height > sourceHeight) {
      throw new Error('Crop area must stay inside the input media.');
    }
    if (x === 0 && y === 0 && width === sourceWidth && height === sourceHeight) {
      return null;
    }
  }

  return { x, y, width, height };
}

function addCaptionOptions(args, fields) {
  const options = [
    ['topY', '--top-y'],
    ['bottomY', '--bottom-y'],
    ['fontSize', '--font-size'],
    ['width', '--width']
  ];

  for (const [field, flag] of options) {
    const value = optional(fields, field);
    if (value) {
      if (!/^[0-9]+$/.test(value)) {
        throw new Error(`${flag} must be a non-negative integer.`);
      }
      args.push(flag, value);
    }
  }
}

function addFontOptions(args, fields) {
  const family = optional(fields, 'fontFamily');
  const style = optional(fields, 'fontStyle');
  if (family) args.push('--font-family', family);
  if (style === 'bold' || style === 'bold-italic') args.push('--bold');
  if (style === 'italic' || style === 'bold-italic') args.push('--italic');
}

function addPerLineFontOptions(args, fields) {
  const topFamily = optional(fields, 'topFontFamily');
  const topSize = optionalInteger(fields, 'topFontSize', 'Top font size');
  const topStyle = optional(fields, 'topFontStyle');
  const bottomFamily = optional(fields, 'bottomFontFamily');
  const bottomSize = optionalInteger(fields, 'bottomFontSize', 'Bottom font size');
  const bottomStyle = optional(fields, 'bottomFontStyle');

  if (topFamily) args.push('--top-font-family', topFamily);
  if (topSize) args.push('--top-font-size', topSize);
  if (topStyle === 'bold' || topStyle === 'bold-italic') args.push('--top-bold');
  if (topStyle === 'italic' || topStyle === 'bold-italic') args.push('--top-italic');
  if (bottomFamily) args.push('--bottom-font-family', bottomFamily);
  if (bottomSize) args.push('--bottom-font-size', bottomSize);
  if (bottomStyle === 'bold' || bottomStyle === 'bold-italic') args.push('--bottom-bold');
  if (bottomStyle === 'italic' || bottomStyle === 'bold-italic') args.push('--bottom-italic');
}

function validateFormat(format, allowed) {
  if (!allowed.includes(format)) {
    throw new Error(`Format must be one of: ${allowed.join(', ')}.`);
  }
}

function runProcess(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd || REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `${path.basename(cmd)} exited with ${code}`));
      }
    });
  });
}

function runCapture(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd || REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = options.timeoutMs || SOURCE_INFO_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`${path.basename(cmd)} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 2 * 1024 * 1024) stdout = stdout.slice(-2 * 1024 * 1024);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on('error', err => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || `${path.basename(cmd)} exited with ${code}`));
      }
    });
  });
}

function durationLabel(seconds) {
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

async function sourceInfo(value) {
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
    '--dump-single-json',
    '--skip-download',
    '--no-warnings',
    '--no-playlist',
    remote
  ]);
  const info = JSON.parse(stdout || '{}');
  const duration = Number(info.duration);
  const fps = Number(info.fps);
  const width = Number(info.width);
  const height = Number(info.height);
  const frameCount = Number.isFinite(duration) && Number.isFinite(fps) && fps > 0
    ? Math.round(duration * fps)
    : null;
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
    duration: Number.isFinite(duration) ? duration : null,
    durationLabel: durationLabel(duration),
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
    frameCount: Number.isFinite(frameCount) && frameCount > 0 ? frameCount : null
  };
}

async function createPreviewFrame(input, time = '0') {
  const source = resolveInputPath(input, 'Preview input');
  const ext = path.extname(source).toLowerCase();
  if (!['.gif', '.mp4', '.webm'].includes(ext)) {
    throw new Error('Preview input must be a GIF, MP4, or WebM file.');
  }
  const seconds = parseTimeValue(time, { allowBlank: true, label: 'Preview time' }) || 0;

  const dir = path.join(UPLOAD_ROOT, 'previews');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.png`);
  const args = ['-y'];
  if (seconds > 0) args.push('-ss', String(seconds));
  args.push('-i', source, '-frames:v', '1', '-update', '1', target);
  await runProcess('ffmpeg', args);
  const rel = path.relative(REPO_ROOT, target).split(path.sep).join('/');
  return {
    path: rel,
    fileUrl: publicFileUrl(rel)
  };
}

function buildJob(action, fields) {
  const data = fields && typeof fields === 'object' ? fields : {};

  switch (action) {
    case 'download-convert': {
      const sourceRaw = required(data, 'source', 'Source');
      const source = resolveJobSource(sourceRaw);
      const { start, end } = validateTimeRange(data);
      const format = optional(data, 'format') || 'mp4';
      validateFormat(format, ['gif', 'mp3', 'mp4', 'webm']);
      const output = normalizeMediaOutput(optional(data, 'output'), format, sourceFallbackStem(sourceRaw));

      return {
        cmd: repoPath('convert.sh'),
        args: [source, start, end, format, output],
        outputPath: output
      };
    }

    case 'text-to-media': {
      const sourceRaw = required(data, 'source', 'Source');
      const source = resolveJobSource(sourceRaw);
      const sourceIsLocal = isLocalSource(sourceRaw);
      const { start, end } = validateTimeRange(data);
      const format = optional(data, 'format') || 'gif';
      validateFormat(format, ['gif', 'mp4', 'webm']);
      const fallbackStem = `${sourceFallbackStem(sourceRaw)}-captioned`;
      const output = normalizeMediaOutput(optional(data, 'outputName') || optional(data, 'output'), format, fallbackStem);
      const top = typeof data.topText === 'string' ? data.topText : '';
      const bottom = typeof data.bottomText === 'string' ? data.bottomText : '';
      const font = optional(data, 'fontPath');
      const args = [];
      addCaptionOptions(args, data);
      addFontOptions(args, data);
      addPerLineFontOptions(args, data);

      if (sourceIsLocal) {
        args.unshift('--caption-local');
        args.push('--start', start);
        if (end) args.push('--end', end);
        args.push(source, output, top, bottom);
        if (font) args.push(font);
        return {
          cmd: repoPath('mememaker.sh'),
          args,
          outputPath: output
        };
      }

      const stem = outputStem(output, fallbackStem);
      args.push(source, start, end, format, top, bottom, stem);
      if (font) args.push(font);
      return {
        cmd: repoPath('mememaker.sh'),
        args,
        outputPath: `${format === 'gif' ? 'gifs' : 'videos'}/${stem}.${format}`
      };
    }

    case 'experimental-gif-editor': {
      const input = required(data, 'input', 'Input media');
      const inputPath = resolveInputPath(input, 'Input media');
      validateMediaInputExtension(input, ['gif', 'webm', 'mp4'], 'Input media');
      const requestedFormat = optional(data, 'format') || 'gif';
      validateFormat(requestedFormat, ['gif', 'mp4', 'webm']);
      const inputStem = safeStem(path.basename(input).replace(/\.[^.]+$/, ''), 'visual-caption');
      const output = normalizeOutputPath(optional(data, 'output'), {
        defaultExt: requestedFormat,
        allowedExts: ['gif', 'mp4', 'webm'],
        fallbackStem: `${inputStem}-visual`,
        defaultDir: requestedFormat === 'gif' ? 'gifs' : 'videos'
      });
      const top = typeof data.topText === 'string' ? data.topText : '';
      const bottom = typeof data.bottomText === 'string' ? data.bottomText : '';
      if (!top && !bottom) {
        throw new Error('At least one text field is required.');
      }

      const args = ['--caption-local', '--bottom-from-top'];
      const topX = Number(optionalInteger(data, 'topX', 'Text 1 x', '0'));
      const topY = Number(optionalInteger(data, 'topY', 'Text 1 y', '0'));
      const bottomX = Number(optionalInteger(data, 'bottomX', 'Text 2 x', '0'));
      const bottomY = Number(optionalInteger(data, 'bottomY', 'Text 2 y', '0'));
      const fontSize = optionalInteger(data, 'fontSize', 'Font size', '50');
      const outputFps = optionalPositiveNumber(data, 'outputFps', 'Output FPS');
      const metadata = localFrameMetadata(inputPath);
      const crop = parseCropFields(data, metadata);
      const width = crop ? String(crop.width) : optionalInteger(data, 'width', 'Width', '720');
      const outputStart = parseFrameBoundary(optional(data, 'outputStart'), metadata, { label: 'Output Start' });
      const outputEnd = parseFrameBoundary(optional(data, 'outputEnd'), metadata, { label: 'Output End' });
      const fontFamily = optional(data, 'fontFamily');
      const font = optional(data, 'fontPath');
      if (outputStart && outputEnd && outputStart.seconds >= outputEnd.seconds) {
        throw new Error('Output Start must be before Output End.');
      }

      if (outputStart) args.push('--start', String(outputStart.seconds));
      if (outputEnd) args.push('--end', String(outputEnd.seconds));
      if (crop) {
        args.push('--crop', String(crop.x), String(crop.y), String(crop.width), String(crop.height));
      }
      args.push('--top-x', String(Math.max(0, topX - (crop ? crop.x : 0))), '--top-y', String(Math.max(0, topY - (crop ? crop.y : 0))));
      args.push('--bottom-x', String(Math.max(0, bottomX - (crop ? crop.x : 0))), '--bottom-y', String(Math.max(0, bottomY - (crop ? crop.y : 0))));
      args.push('--font-size', fontSize, '--width', width);
      if (outputFps) args.push('--fps', outputFps);
      if (fontFamily) args.push('--font-family', fontFamily);
      if (data.bold) args.push('--bold');
      if (data.italic) args.push('--italic');
      if (data.underline) args.push('--underline');
      if (data.strike) args.push('--strikethrough');
      args.push(input, output, top, bottom);
      if (font) args.push(font);

      return {
        cmd: repoPath('mememaker.sh'),
        args,
        outputPath: output
      };
    }

    case 'audio-to-video': {
      const sourceRaw = required(data, 'source', 'Source');
      const source = resolveJobSource(sourceRaw);
      const { start, end } = validateTimeRange(data);
      const audio = resolveInputPath(required(data, 'audio', 'Input audio'), 'Input audio');
      const format = optional(data, 'format') || 'mp4';
      validateFormat(format, ['mp4', 'webm']);
      const output = normalizeVideoOutput(optional(data, 'output'), `${sourceFallbackStem(sourceRaw)}-with-audio`, format);

      return {
        cmd: repoPath('audio_video.sh'),
        args: [source, start, end, audio, output],
        outputPath: output
      };
    }

    case 'build-html': {
      const html = required(data, 'html', 'HTML file');
      const seconds = required(data, 'seconds', 'Seconds');
      const audio = optional(data, 'audio');
      const requestedFormat = optional(data, 'format') || 'mp4';
      validateFormat(requestedFormat, ['mp4', 'webm', 'gif', 'png']);
      const output = normalizeOutputPath(optional(data, 'output'), {
        defaultExt: requestedFormat,
        allowedExts: ['mp4', 'webm', 'gif', 'png'],
        fallbackStem: safeStem(path.basename(html).replace(/\.[^.]+$/, '') || 'render', 'render'),
        defaultDir: defaultDirForExt(requestedFormat)
      });
      const args = [html, output, seconds];
      if (audio) args.push(audio);

      return {
        cmd: repoPath('build.sh'),
        args,
        outputPath: output
      };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function sendJson(res, code, body) {
  const json = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json)
  });
  res.end(json);
}

function sendText(res, code, text) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function handleUpload(req, res, url) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_UPLOAD_BYTES) {
    sendJson(res, 413, { error: `Upload is too large. Limit is ${MAX_UPLOAD_BYTES} bytes.` });
    req.resume();
    return;
  }

  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

  const name = uploadName(url.searchParams.get('name') || 'upload');
  const target = path.join(UPLOAD_ROOT, name);
  let bytes = 0;
  let tooLarge = false;
  let streamClosed = false;
  const out = fs.createWriteStream(target, { flags: 'wx' });

  function cleanupFailed() {
    fs.rm(target, { force: true }, () => {});
  }

  out.on('error', err => {
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
    cleanupFailed();
  });

  req.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > MAX_UPLOAD_BYTES) {
      tooLarge = true;
      if (!streamClosed) {
        streamClosed = true;
        out.destroy();
      }
      return;
    }
    if (!tooLarge) out.write(chunk);
  });

  req.on('end', () => {
    if (tooLarge) {
      cleanupFailed();
      sendJson(res, 413, { error: `Upload is too large. Limit is ${MAX_UPLOAD_BYTES} bytes.` });
      return;
    }

    out.end(() => {
      const rel = path.relative(REPO_ROOT, target).split(path.sep).join('/');
      sendJson(res, 201, {
        path: rel,
        fileUrl: publicFileUrl(rel),
        bytes
      });
    });
  });

  req.on('error', () => {
    if (!streamClosed) out.destroy();
    cleanupFailed();
  });
}

function emit(job, event, data) {
  const payload = { event, data };
  job.events.push(payload);
  if (job.events.length > 500) job.events.shift();

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.clients) {
    client.write(message);
  }
}

function startJob(action, fields) {
  const built = buildJob(action, fields);
  const id = crypto.randomUUID();
  const fileUrl = publicFileUrl(built.outputPath);
  const downloadUrl = publicDownloadUrl(built.outputPath);
  const job = {
    id,
    action,
    cmd: built.cmd,
    args: built.args,
    outputPath: built.outputPath,
    fileUrl,
    downloadUrl,
    status: 'running',
    exitCode: null,
    signal: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    clients: new Set(),
    events: [],
    child: null,
    cancelRequested: false
  };

  jobs.set(id, job);

  const displayCommand = [path.basename(job.cmd), ...job.args].map(arg => JSON.stringify(arg)).join(' ');
  emit(job, 'status', {
    status: job.status,
    startedAt: job.startedAt,
    outputPath: job.outputPath,
    fileUrl: job.fileUrl,
    downloadUrl: job.downloadUrl,
    command: displayCommand
  });

  const child = spawn(job.cmd, job.args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  job.child = child;
  job.pid = child.pid;

  child.stdout.on('data', chunk => emit(job, 'log', { stream: 'stdout', text: chunk.toString() }));
  child.stderr.on('data', chunk => emit(job, 'log', { stream: 'stderr', text: chunk.toString() }));

  child.on('error', err => {
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    emit(job, 'log', { stream: 'stderr', text: `${err.message}\n` });
    emit(job, 'done', {
      status: job.status,
      exitCode: job.exitCode,
      signal: job.signal,
      finishedAt: job.finishedAt,
      outputPath: job.outputPath,
      fileUrl: job.fileUrl,
      downloadUrl: job.downloadUrl
    });
  });

  child.on('close', (code, signal) => {
    job.exitCode = code;
    job.signal = signal;
    job.status = job.cancelRequested ? 'cancelled' : (code === 0 ? 'complete' : 'failed');
    job.finishedAt = new Date().toISOString();
    emit(job, 'done', {
      status: job.status,
      exitCode: code,
      signal,
      finishedAt: job.finishedAt,
      outputPath: job.outputPath,
      fileUrl: job.fileUrl,
      downloadUrl: job.downloadUrl
    });
  });

  return job;
}

function serveStatic(req, res, requestPath) {
  const pathname = requestPath === '/' ? '/index.html' : requestPath;
  const target = path.resolve(WEB_ROOT, `.${pathname}`);
  const rel = path.relative(WEB_ROOT, target);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.stat(target, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': MIME[path.extname(target)] || 'application/octet-stream',
      'content-length': stat.size
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
}

function serveOutputFile(req, res, requestPath, options = {}) {
  const prefix = options.attachment ? '/download/' : '/files/';
  const rel = decodeURIComponent(requestPath.slice(prefix.length)).replace(/^\/+/, '');
  const target = path.resolve(REPO_ROOT, rel);
  const relative = path.relative(REPO_ROOT, target);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.stat(target, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      sendText(res, 404, 'Not found');
      return;
    }

    const headers = {
      'content-type': MIME[path.extname(target)] || 'application/octet-stream',
      'content-length': stat.size
    };
    if (options.attachment) {
      const filename = path.basename(target).replace(/["\r\n]/g, '_');
      headers['content-disposition'] = `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(target).pipe(res);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      repoRoot: REPO_ROOT,
      localOnly: HOST === '127.0.0.1' || HOST === 'localhost',
      defaultFont: detectDefaultFont(),
      actions: [
        'download-convert',
        'text-to-media',
        'audio-to-video',
        'build-html',
        'experimental-gif-editor'
      ]
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && pathname === '/api/uploads') {
    handleUpload(req, res, url);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/preview-frame') {
    try {
      const body = await readJson(req);
      const preview = await createPreviewFrame(required(body, 'input', 'Preview input'), optional(body, 'time'));
      sendJson(res, 201, preview);
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/source-info') {
    try {
      const body = await readJson(req);
      const info = await sourceInfo(required(body, 'source', 'Source'));
      sendJson(res, 200, info);
    } catch (err) {
      sendJson(res, 400, { ok: false, supported: false, error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/jobs') {
    try {
      const body = await readJson(req);
      const job = startJob(clean(body.action), body.fields || {});
      sendJson(res, 201, {
        id: job.id,
        status: job.status,
        outputPath: job.outputPath,
        fileUrl: job.fileUrl,
        downloadUrl: job.downloadUrl
      });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
    return;
  }

  const eventMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
  if (req.method === 'GET' && eventMatch) {
    const job = jobs.get(eventMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: 'Job not found.' });
      return;
    }

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    });

    job.clients.add(res);
    res.write(': connected\n\n');
    for (const payload of job.events) {
      res.write(`event: ${payload.event}\ndata: ${JSON.stringify(payload.data)}\n\n`);
    }
    req.on('close', () => job.clients.delete(res));
    return;
  }

  const cancelMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && cancelMatch) {
    const job = jobs.get(cancelMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: 'Job not found.' });
      return;
    }

    if (job.child && job.status === 'running') {
      job.cancelRequested = true;
      job.child.kill('SIGTERM');
    }
    sendJson(res, 200, { ok: true, status: job.status });
    return;
  }

  const jobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) {
      sendJson(res, 404, { error: 'Job not found.' });
      return;
    }
    sendJson(res, 200, {
      id: job.id,
      action: job.action,
      status: job.status,
      exitCode: job.exitCode,
      signal: job.signal,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      outputPath: job.outputPath,
      fileUrl: job.fileUrl,
      downloadUrl: job.downloadUrl
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/files/')) {
    serveOutputFile(req, res, pathname);
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/download/')) {
    serveOutputFile(req, res, pathname, { attachment: true });
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, decodeURIComponent(pathname));
    return;
  }

  sendText(res, 405, 'Method not allowed');
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch(err => {
    sendJson(res, 500, { error: err.message });
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try: MM_WEB_PORT=${PORT + 1} npm run web`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`meme-maker web UI: http://${HOST}:${PORT}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn('Warning: this local runner can access files and run media tools. Do not expose it publicly without adding authentication and a remote-safe job runner.');
  }
});
