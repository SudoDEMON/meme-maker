'use strict';
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(REPO_ROOT, 'web');
const UPLOAD_ROOT = path.join(REPO_ROOT, '.web-uploads');
const HOST = process.env.MM_WEB_HOST || '127.0.0.1';
const PORT = Number(process.env.MM_WEB_PORT || process.env.PORT || 3001);
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = Number(process.env.MM_WEB_MAX_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024);
const SOURCE_INFO_TIMEOUT_MS = Number(process.env.MM_WEB_SOURCE_INFO_TIMEOUT_MS || 15000);
const LOCAL_VIDEO_INPUT_EXTS = ['gif', 'mov', 'mp4', 'webm'];
const LOCAL_VIDEO_INPUT_EXTS_WITH_DOTS = LOCAL_VIDEO_INPUT_EXTS.map(ext => `.${ext}`);
const PREVIEW_PROCESS_TIMEOUT_MS = Number(process.env.MM_WEB_PREVIEW_TIMEOUT_MS || 45000);
const MAX_REMOTE_PREVIEW_CACHE_ENTRIES = Number(process.env.MM_WEB_PREVIEW_CACHE_ENTRIES || 24);


const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttc': 'font/collection',
  '.ttf': 'font/ttf',
  '.webm': 'video/webm'
};


module.exports = { REPO_ROOT, WEB_ROOT, UPLOAD_ROOT, HOST, PORT, MAX_BODY_BYTES, MAX_UPLOAD_BYTES, SOURCE_INFO_TIMEOUT_MS, LOCAL_VIDEO_INPUT_EXTS, LOCAL_VIDEO_INPUT_EXTS_WITH_DOTS, PREVIEW_PROCESS_TIMEOUT_MS, MAX_REMOTE_PREVIEW_CACHE_ENTRIES, MIME };
