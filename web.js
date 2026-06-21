#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const REPO_ROOT = __dirname;
const WEB_ROOT = path.join(REPO_ROOT, 'web');
const UPLOAD_ROOT = path.join(REPO_ROOT, '.web-uploads');
const HOST = process.env.MM_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.MM_WEB_PORT || process.env.PORT || 3000);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = Number(process.env.MM_WEB_MAX_UPLOAD_BYTES || 500 * 1024 * 1024);

const jobs = new Map();

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

function youtubeId(value) {
  const raw = clean(value);
  if (!raw) {
    throw new Error('YouTube ID is required.');
  }

  let id = raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
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
  } catch {
    id = raw;
  }

  id = clean(id).split(/[?&#/]/)[0];
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    throw new Error(`Could not extract a valid YouTube ID from: ${raw}`);
  }
  return id;
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

function outputExt(outputPath) {
  return path.posix.extname(outputPath).slice(1).toLowerCase();
}

function uploadName(originalName) {
  const parsed = path.parse(clean(originalName) || 'upload');
  const base = safeSegment(parsed.name, 'upload');
  const ext = parsed.ext ? parsed.ext.toLowerCase().replace(/[^.A-Za-z0-9]/g, '') : '';
  return `${Date.now()}-${crypto.randomUUID()}-${base}${ext}`;
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

function validateFormat(format, allowed) {
  if (!allowed.includes(format)) {
    throw new Error(`Format must be one of: ${allowed.join(', ')}.`);
  }
}

function buildJob(action, fields) {
  const data = fields && typeof fields === 'object' ? fields : {};

  switch (action) {
    case 'download-video': {
      const id = youtubeId(required(data, 'videoId', 'YouTube ID'));
      const start = required(data, 'start', 'Start time');
      const end = optional(data, 'end');
      const format = optional(data, 'format') || 'mp4';
      validateFormat(format, ['mp4', 'webm']);
      const output = normalizeVideoOutput(optional(data, 'output'), safeStem(id), format);

      return {
        cmd: repoPath('video.sh'),
        args: [id, start, end, output],
        outputPath: output
      };
    }

    case 'download-gif': {
      const id = youtubeId(required(data, 'videoId', 'YouTube ID'));
      const start = required(data, 'start', 'Start time');
      const end = optional(data, 'end');
      const output = normalizeOutputPath(optional(data, 'outputName'), {
        defaultExt: 'gif',
        allowedExts: ['gif'],
        fallbackStem: safeStem(id),
        defaultDir: 'gifs'
      });
      const stem = outputStem(output, safeStem(id));

      return {
        cmd: repoPath('mememaker.sh'),
        args: ['--no-text', id, start, end, 'gif', stem],
        outputPath: `gifs/${stem}.gif`
      };
    }

    case 'download-audio': {
      const id = youtubeId(required(data, 'videoId', 'YouTube ID'));
      const start = required(data, 'start', 'Start time');
      const end = optional(data, 'end');
      const output = normalizeOutputPath(optional(data, 'output'), {
        defaultExt: 'mp3',
        allowedExts: ['mp3'],
        fallbackStem: safeStem(id),
        defaultDir: 'Audio'
      });

      return {
        cmd: repoPath('music.sh'),
        args: [id, start, end, output],
        outputPath: output
      };
    }

    case 'caption-youtube': {
      const id = youtubeId(required(data, 'videoId', 'YouTube ID'));
      const start = required(data, 'start', 'Start time');
      const end = optional(data, 'end');
      const format = optional(data, 'format') || 'gif';
      validateFormat(format, ['gif', 'mp4', 'webm']);

      const args = [];
      addCaptionOptions(args, data);
      const top = typeof data.topText === 'string' ? data.topText : '';
      const bottom = typeof data.bottomText === 'string' ? data.bottomText : '';
      const font = optional(data, 'fontPath');
      const output = normalizeOutputPath(optional(data, 'outputName'), {
        defaultExt: format,
        allowedExts: [format],
        fallbackStem: safeStem(id),
        defaultDir: format === 'gif' ? 'gifs' : 'videos'
      });
      const stem = outputStem(output, safeStem(id));

      args.push(id, start, end, format, top, bottom, stem);
      if (font) args.push(font);

      return {
        cmd: repoPath('mememaker.sh'),
        args,
        outputPath: `${format === 'gif' ? 'gifs' : 'videos'}/${stem}.${format}`
      };
    }

    case 'caption-local': {
      const input = required(data, 'input', 'Input media');
      const requestedFormat = optional(data, 'format') || 'gif';
      validateFormat(requestedFormat, ['gif', 'mp4', 'webm']);
      const inputStem = safeStem(path.basename(input).replace(/\.[^.]+$/, ''), 'captioned');
      const output = normalizeOutputPath(optional(data, 'output'), {
        defaultExt: requestedFormat,
        allowedExts: ['gif', 'mp4', 'webm'],
        fallbackStem: `${inputStem}-captioned`,
        defaultDir: requestedFormat === 'gif' ? 'gifs' : 'videos'
      });
      const top = typeof data.topText === 'string' ? data.topText : '';
      const bottom = typeof data.bottomText === 'string' ? data.bottomText : '';
      const font = optional(data, 'fontPath');
      const args = ['--caption-local'];
      addCaptionOptions(args, data);
      args.push(input, output, top, bottom);
      if (font) args.push(font);

      return {
        cmd: repoPath('mememaker.sh'),
        args,
        outputPath: output
      };
    }

    case 'add-audio': {
      const media = required(data, 'media', 'Input media');
      const audio = required(data, 'audio', 'Input audio');
      const mediaStem = safeStem(path.basename(media).replace(/\.[^.]+$/, ''), 'clip');
      const output = normalizeVideoOutput(optional(data, 'output'), `${mediaStem}-with-audio`, 'mp4');
      const args = ['combine', media, audio];
      args.push(output);

      return {
        cmd: repoPath('video.sh'),
        args,
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
      actions: ['download-video', 'download-gif', 'download-audio', 'caption-youtube', 'caption-local', 'add-audio', 'build-html']
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
