'use strict';

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, WEB_ROOT, UPLOAD_ROOT, MAX_BODY_BYTES, MAX_UPLOAD_BYTES, MIME } = require('./config');
const { uploadName, safeDecodeURIComponent } = require('./inputs');
const publicPaths = new Set();

function repoRelativePath(outputPath) {
  if (!outputPath) return null;

  const resolved = path.resolve(REPO_ROOT, outputPath);
  const rel = path.relative(REPO_ROOT, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  return rel.split(path.sep).join('/');
}

function publicUrl(prefix, outputPath) {
  const rel = repoRelativePath(outputPath);
  if (!rel) return null;

  publicPaths.add(rel);
  return `${prefix}/${rel.split('/').map(encodeURIComponent).join('/')}`;
}

function publicFileUrl(outputPath) {
  return publicUrl('/files', outputPath);
}

function publicDownloadUrl(outputPath) {
  return publicUrl('/download', outputPath);
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
    if (!tooLarge && !out.write(chunk)) {
      req.pause();
      out.once('drain', () => req.resume());
    }
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
  const decoded = safeDecodeURIComponent(requestPath.slice(prefix.length));
  if (decoded === null) {
    sendText(res, 400, 'Bad request');
    return;
  }
  const rel = decoded.replace(/^\/+/, '');
  const target = path.resolve(REPO_ROOT, rel);
  const relative = path.relative(REPO_ROOT, target);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  const publicRel = relative.split(path.sep).join('/');
  if (!publicPaths.has(publicRel)) {
    sendText(res, 404, 'Not found');
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

    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    headers['accept-ranges'] = 'bytes';
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      status = 206;
      headers['content-range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['content-length'] = end - start + 1;
    }
    res.writeHead(status, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fs.createReadStream(target, stat.size ? { start, end } : {});
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
}

module.exports = { repoRelativePath, publicUrl, publicFileUrl, publicDownloadUrl, sendJson, sendText, readJson, handleUpload, serveStatic, serveOutputFile };
