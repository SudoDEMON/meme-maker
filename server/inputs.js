'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO_ROOT } = require('./config');

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

function validateTimeRange(fields) {
  const start = optional(fields, 'start') || '0:00';
  const end = optional(fields, 'end');
  const startSeconds = parseTimeValue(start, { label: 'Start time' });
  const endSeconds = parseTimeValue(end, { allowBlank: true, allowInf: true, label: 'End time' });
  if (endSeconds !== null && startSeconds >= endSeconds) {
    throw new Error('Start time must be before end time.');
  }
  return { start, end };
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

function spawnCommand(cmd, args) {
  if (process.platform === 'win32' && path.extname(cmd).toLowerCase() === '.sh') {
    return { cmd: 'bash', args: [cmd, ...args] };
  }
  return { cmd, args };
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

function isFalseEnv(value) {
  return /^(?:0|false|no|off)$/i.test(clean(value));
}

function ytDlpNetworkArgs() {
  const args = [];
  if (!isFalseEnv(process.env.MM_YTDLP_FORCE_IPV4 || '1')) {
    args.push('--force-ipv4');
  }
  const socketTimeout = clean(process.env.MM_YTDLP_SOCKET_TIMEOUT || '15');
  if (socketTimeout && socketTimeout !== '0') {
    args.push('--socket-timeout', socketTimeout);
  }
  return args;
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
    allowedExts: [fallbackFormat],
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

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

module.exports = { clean, basenameNoExt, required, optional, optionalInteger, optionalPositiveNumber, parseFrameBoundary, parseTimeValue, validateTimeRange, safeStem, safeSegment, outputStem, repoPath, spawnCommand, extractYouTubeId, looksLikeUrl, sourceFallbackStem, ytDlpSource, ytDlpProbeSource, isFalseEnv, ytDlpNetworkArgs, resolveJobSource, isLocalSource, defaultDirForExt, normalizeOutputPath, normalizeVideoOutput, normalizeMediaOutput, outputExt, uploadName, resolveInputPath, validateMediaInputExtension, parseCropFields, addCaptionOptions, addFontOptions, addPerLineFontOptions, validateFormat, safeDecodeURIComponent };
