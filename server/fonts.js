'use strict';
const fs = require('fs');
const path = require('path');
const { runCapture } = require('./processes');
const { sendText } = require('./files');
const allowed = new Set(['sans-serif','serif','monospace','Impact','DejaVu Sans','Arial']);
const cache = new Map();
let defaultFont;

async function detectDefaultFont() {
  if (defaultFont) return defaultFont;
  const candidates = [process.env.FONT,
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/TTF/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/System/Library/Fonts/SFNS.ttf', '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf'
  ];
  let found = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!found) {
    try {
      const { stdout } = await runCapture('fc-match',['-f','%{file}\n','sans-serif:weight=bold'],{timeoutMs:3000});
      found = stdout.trim().split('\n')[0];
    } catch { /* The CLI will report a missing system font when captions are rendered. */ }
  }
  defaultFont = { name: found ? path.basename(found).replace(/\.[^.]+$/, '') : 'system font', path: found || '' };
  return defaultFont;
}

async function captionFont(family, bold, italic) {
  if (!allowed.has(family)) throw new Error('Unsupported font family.');
  const style = bold && italic ? 'Bold Italic' : bold ? 'Bold' : italic ? 'Italic' : 'Regular';
  const key = `${family}:${style}`;
  if (!cache.has(key)) cache.set(key, (async () => {
    try {
      const { stdout } = await runCapture('fc-match',['-f','%{file}\n',`${family}:style=${style}`],{timeoutMs:3000});
      const file = stdout.trim().split('\n')[0];
      if (file && fs.existsSync(file)) return file;
    } catch { /* Match mememaker.sh's default-font fallback when fontconfig is absent. */ }
    return (await detectDefaultFont()).path;
  })());
  return cache.get(key);
}

async function serveFont(res, params) {
  try {
    const file = await captionFont(params.get('family') || 'sans-serif', params.get('bold') === '1', params.get('italic') === '1');
    if (!file) { sendText(res,404,'Font unavailable'); return; }
    const stat = await fs.promises.stat(file);
    res.writeHead(200, { 'content-type':'application/octet-stream', 'content-length':stat.size, 'cache-control':'private, max-age=3600' });
    const stream = fs.createReadStream(file);
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  } catch (err) { sendText(res,400,err.message); }
}
module.exports = { detectDefaultFont, serveFont };
