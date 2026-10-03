'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function run(t, options = {}) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'mm fallback '));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const bin = path.join(scratch, 'bin');
  const temps = path.join(scratch, 'temps');
  fs.mkdirSync(bin); fs.mkdirSync(temps);
  const stub = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const downloader = path.basename(process.argv[1]) === 'yt-dlp';
fs.appendFileSync(process.env.PROBE_LOG, JSON.stringify({downloader, args}) + '\\n');
const out = downloader ? args[args.indexOf('-o') + 1] : args.at(-1);
const section = args.includes('--download-sections');
const client = args.includes('--extractor-args');
const mode = process.env.PROBE_FAILURE;
fs.writeFileSync(out, 'partial');
if (downloader && (mode === 'all' || mode === 'empty' ||
    (mode === 'sections' && section) ||
    (mode === 'default-section' && section && !client) ||
    (mode === 'default' && !client))) {
  if (mode === 'empty') { fs.writeFileSync(out, ''); process.exit(0); }
  process.exit(8);
}
if (downloader && process.env.PROBE_SUFFIX === '1') {
  fs.renameSync(out, out + (args.includes('-x') ? '.mp3' : '.mp4'));
} else fs.writeFileSync(out, 'media');
`;
  for (const name of ['yt-dlp', 'ffmpeg']) fs.writeFileSync(path.join(bin, name), stub, { mode: 0o755 });
  const log = path.join(scratch, 'log');
  const output = path.join(scratch, `out.${options.type || 'mp3'}`);
  const result = spawnSync('bash', ['convert.sh', options.source || 'e3zN3rn2g7M',
    options.start ?? '0:10', options.end ?? '0:20', options.type || 'mp3', output], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: temps,
      PROBE_LOG: log, PROBE_FAILURE: options.failure || 'default-section',
      PROBE_SUFFIX: options.suffix ? '1' : '0', ...options.env }
  });
  assert.equal(result.status, options.fails ? 1 : 0, result.stderr);
  assert.deepEqual(fs.readdirSync(temps), [], 'all attempt files must be cleaned');
  assert.equal(fs.existsSync(output), !options.fails);
  const entries = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  return { downloads: entries.filter(e => e.downloader).map(e => e.args),
    encodes: entries.filter(e => !e.downloader).map(e => e.args) };
}

for (const [label, start, end, env, expected] of [
  ['short', '0:10', '0:20', {}, 2],
  ['exact cap', '10', '610', {}, 2],
  ['over cap', '10', '611', {}, 2],
  ['hours', '1:00:00', '1:10:01', {}, 2],
  ['decimal boundary', '0.5', '1.5', { MM_YTDLP_SECTION_RETRY_MAX_SECONDS: '1' }, 2],
  ['decimal over cap', '0.5', '1.51', { MM_YTDLP_SECTION_RETRY_MAX_SECONDS: '1' }, 2],
  ['open end', '0:10', '', {}, 2],
  ['infinite end', '0:10', 'inf', {}, 2],
  ['invalid limit', '0:10', '0:20', { MM_YTDLP_SECTION_RETRY_MAX_SECONDS: 'bad' }, 2],
  ['negative limit', '0:10', '0:20', { MM_YTDLP_SECTION_RETRY_MAX_SECONDS: '-1' }, 2],
  ['disabled retry', '0:10', '0:20', { MM_YTDLP_SECTION_RETRY_CLIENT: '0' }, 2],
  ['empty retry client', '0:10', '0:20', { MM_YTDLP_SECTION_RETRY_CLIENT: '' }, 2],
]) {
  test(`fallback eligibility: ${label}`, t => {
    const r = run(t, { start, end, env });
    assert.equal(r.downloads.length, expected);
    assert.ok(r.downloads[0].includes('--download-sections'));
    const short = ['short', 'exact cap', 'decimal boundary'].includes(label);
    assert.equal(r.downloads[1].includes('--download-sections'), short);
    assert.equal(r.encodes[0].includes('-ss'), !short);
    const enabled = !['disabled retry', 'empty retry client'].includes(label);
    assert.equal(r.downloads[1].includes('--extractor-args'), enabled);
  });
}
for (const type of ['mp3', 'mp4', 'webm', 'gif']) {
  test(`failed sections fall back and trim ${type}`, t => {
    const r = run(t, { type, failure: 'sections', suffix: true });
    assert.equal(r.downloads.length, 3);
    assert.ok(r.downloads[1].includes('--download-sections'));
    assert.ok(!r.downloads[2].includes('--download-sections'));
    assert.ok(r.encodes.every(args => args.includes('-ss') && args.includes('-to')));
    assert.equal(new Set(r.downloads.map(args => args[args.indexOf('-o') + 1])).size, 3);
  });
}
for (const source of ['https://example.com/video', 'https://youtube.com.evil.invalid/video']) {
  test(`non-YouTube source keeps generic fallback: ${source}`, t => {
    const r = run(t, { source });
    assert.equal(r.downloads.length, 2);
    assert.ok(r.downloads.every(args => !args.includes('--extractor-args')));
    assert.ok(r.encodes[0].includes('-ss'));
  });
}
test('full YouTube download retries client without local trim', t => {
  const r = run(t, { start: '0:00', end: '', failure: 'default' });
  assert.equal(r.downloads.length, 2);
  assert.ok(r.downloads.every(args => !args.includes('--download-sections')));
  assert.ok(r.downloads[1].includes('--extractor-args'));
  assert.ok(!r.encodes[0].includes('-ss') && !r.encodes[0].includes('-to'));
});
for (const options of [{ failure: 'all' }, { failure: 'empty' },
  { failure: 'all', start: '0:00', end: '' },
  { failure: 'all', source: 'https://example.com/video', start: '0:00', end: '' }]) {
  test(`failed or empty media never reaches encoding: ${JSON.stringify(options)}`, t => {
    const r = run(t, { ...options, fails: true });
    assert.equal(r.encodes.length, 0);
  });
}
