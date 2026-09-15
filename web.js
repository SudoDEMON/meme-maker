#!/usr/bin/env node
'use strict';

const http = require('http');
const { HOST, PORT, REPO_ROOT } = require('./server/config');
const { clean, required, optional, safeDecodeURIComponent } = require('./server/inputs');
const { sourceInfo, createPreviewFrame } = require('./server/media');
const { detectDefaultFont, serveFont } = require('./server/fonts');
const { sendJson, sendText, readJson, handleUpload, serveStatic, serveOutputFile } = require('./server/files');
const { startJob, terminateJob, jobs } = require('./server/jobs');

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      repoRoot: REPO_ROOT,
      localOnly: HOST === '127.0.0.1' || HOST === 'localhost',
      defaultFont: await detectDefaultFont(),
      actions: [
        'download-convert',
        'text-to-media',
        'audio-to-video',
        'combine-videos',
        'build-html',
        'meme-editor',
        'experimental-gif-editor'
      ]
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/font') {
    await serveFont(res, url.searchParams);
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
    const controller = new AbortController();
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abort);
    try {
      const body = await readJson(req);
      const preview = await createPreviewFrame(required(body, 'input', 'Preview input'), optional(body, 'time'), controller.signal);
      sendJson(res, 201, preview);
    } catch (err) {
      if (!controller.signal.aborted) sendJson(res, 400, { error: err.message });
    } finally {
      res.off('close', abort);
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
      const job = await startJob(clean(body.action), body.fields || {});
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
      terminateJob(job);
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
    const decoded = safeDecodeURIComponent(pathname);
    if (decoded === null) {
      sendText(res, 400, 'Bad request');
      return;
    }
    serveStatic(req, res, decoded);
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
  console.log(`meme-maker web UI: http://${HOST}:${server.address().port}`);
  if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn('Warning: this local runner can access files and run media tools. Do not expose it publicly without adding authentication and a remote-safe job runner.');
  }
});
