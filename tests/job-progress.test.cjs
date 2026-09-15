'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JobProgress } = require('../server/job-progress');

function tracker(action = 'download-convert', fields = {}, outputPath = 'videos/output.webm', args = []) {
  let latest;
  const progress = new JobProgress(action, { source: __filename, ...fields }, { outputPath, args }, value => { latest = value; });
  progress.publish();
  return { progress, latest: () => latest, feed: text => progress.push('stderr', text) };
}
const input = (index, duration, format = 'mov', name = 'input.mp4') => `Input #${index}, ${format}, from '${name}':\n  Duration: ${duration}, start: 0.000000, bitrate: 200 kb/s\n`;
const output = (name = 'videos/output.webm') => `Output #0, webm, to '${name}':\n`;
const stats = (time, speed) => `frame= 50 fps=10 q=1.0 size=100KiB time=${time} bitrate=100kbits/s speed=${speed}x\r`;

test('trim and soundtrack passes have separate estimates and ordered steps', () => {
  const t = tracker('audio-to-video', { start: '1:00:00', end: '1:02:00' });
  assert.deepEqual(t.latest().steps.map(step => [step.label, step.status]), [['Trim video', 'running'], ['Replace audio and encode WEBM', 'waiting']]);
  t.feed(input(0, '09:23:57.00') + output('/tmp/prepared.mp4'));
  const line = stats('00:00:20.00', '0.5');
  t.feed(line.slice(0, 61));
  t.feed(line.slice(61));
  assert.equal(t.latest().remainingSeconds, 200);
  t.feed('ffmpeg version fixture\n' + input(0, '00:02:00.00') + input(1, '00:01:40.00', 'mp3', 'song.mp3') + output());
  assert.deepEqual(t.latest().steps.map(step => step.status), ['complete', 'running']);
  assert.equal(t.latest().remainingSeconds, null, 'the prior pass estimate must reset');
  t.feed(stats('00:00:50.00', '2'));
  assert.equal(t.latest().remainingSeconds, 25);
  assert.equal(t.latest().percent, 50);
  t.progress.finish('complete');
  assert.deepEqual(t.latest().steps.map(step => step.status), ['complete', 'complete']);
});

test('local conversion clamps trim endpoints to source duration', () => {
  const t = tracker('download-convert', { start: '00:10', end: '5:00' });
  t.feed(input(0, '00:00:30.00') + output() + stats('00:00:05.00', '0.25'));
  assert.equal(t.latest().remainingSeconds, 60);
  assert.equal(t.latest().percent, 25);
});

test('editor uses validated frame boundaries converted into seconds', () => {
  const t = tracker('meme-editor', { input: __filename, outputStart: '18f', outputEnd: '35f' }, 'videos/output.webm', ['--start', '1.8', '--end', '3.5']);
  t.feed(input(0, '00:00:09.00') + output() + stats('00:00:00.70', '0.5'));
  assert.equal(t.latest().remainingSeconds, 2);
});

test('download ETAs reset for processing and are not applied twice to remote clips', () => {
  const t = tracker('download-convert', { source: 'https://example.test/video', start: '1:00:00', end: '1:02:00' });
  t.progress.push('stdout', '[download] 50.0% of 10MiB at 1MiB/s ETA 01:02:03\r');
  assert.equal(t.latest().remainingSeconds, 3723);
  assert.equal(t.latest().percent, 50);
  t.progress.push('stdout', '[download] 51.0% of 10MiB at Unknown B/s ETA Unknown\n');
  assert.equal(t.latest().remainingSeconds, null);
  t.feed('ffmpeg version fixture\n' + input(0, '00:02:00.00') + output() + stats('00:00:20.00', '0.5'));
  assert.equal(t.latest().remainingSeconds, 200);
  assert.deepEqual(t.latest().steps.map(step => step.status), ['complete', 'running']);
  t.progress.push('stdout', '[download] 100.0% of 10MiB in 00:10\n');
  assert.equal(t.latest().remainingSeconds, 200, 'late download logs must not replace the encode estimate');
});

test('remote ffmpeg downloads avoid estimates based on full-source timestamps', () => {
  const t = tracker('download-convert', { source: 'https://example.test/video', start: '1:00:00', end: '1:02:00' });
  t.feed(input(0, '09:00:00.00', 'mov', 'https://example.test/stream') + output('/tmp/download.mp4') + stats('01:01:00.00', '0.5'));
  assert.equal(t.latest().remainingSeconds, null);
  assert.equal(t.latest().percent, null);
  assert.equal(t.latest().steps[0].status, 'running');
});

test('GIF palette and final passes remain distinct; looped GIF uses audio duration', () => {
  const t = tracker('download-convert', { start: '10', end: '25' }, 'gifs/output.gif');
  t.feed(input(0, '00:01:00.00') + output('/tmp/palette.png'));
  assert.deepEqual(t.latest().steps.map(step => step.status), ['running', 'waiting']);
  t.feed('ffmpeg version fixture\n' + input(0, '00:01:00.00') + input(1, 'N/A', 'png_pipe', '/tmp/palette.png') + output('gifs/output.gif') + stats('00:00:05.00', '2'));
  assert.equal(t.latest().remainingSeconds, 5);
  assert.deepEqual(t.latest().steps.map(step => step.status), ['complete', 'running']);
  const loop = tracker('audio-to-video');
  loop.feed(input(0, '00:00:02.00', 'gif') + input(1, '00:00:30.00', 'mp3') + output() + stats('00:00:10.00', '2'));
  assert.equal(loop.latest().remainingSeconds, 10);
});

test('combining adds known input durations and leaves unknown durations unestimated', () => {
  const t = tracker('combine-videos');
  t.feed(input(0, '00:00:20.00') + input(1, '00:00:30.00') + output() + stats('00:00:10.00', '2'));
  assert.equal(t.latest().remainingSeconds, 20);
  t.feed('ffmpeg version fixture\n' + input(0, 'N/A', 'concat') + output() + stats('00:00:10.00', '2'));
  assert.equal(t.latest().remainingSeconds, null);
});

test('missing, zero, negative, and non-finite speed never produce a fabricated ETA', () => {
  const t = tracker();
  t.feed(input(0, '00:01:00.00') + output());
  for (const speed of ['N/A', '0', '-2', 'Infinity']) {
    t.feed(stats('00:00:10.00', speed));
    assert.equal(t.latest().remainingSeconds, null);
  }
  t.feed(stats('N/A', '1'));
  assert.equal(t.latest().remainingSeconds, null);
  t.feed(stats('00:01:01.00', '1'));
  assert.equal(t.latest().remainingSeconds, 0);
  assert.equal(t.latest().percent, 100);
});

test('failed and cancelled steps leave subsequent steps marked not run', () => {
  for (const status of ['failed', 'cancelled']) {
    const t = tracker('audio-to-video', { start: '10' });
    t.progress.finish(status);
    assert.deepEqual(t.latest().steps.map(step => step.status), [status, 'not-run']);
  }
});

test('HTML capture, encoding, and optional MP4 audio are separate steps', () => {
  const t = tracker('build-html', { audio: 'song.mp3' }, 'videos/output.mp4');
  assert.deepEqual(t.latest().steps.map(step => step.id), ['capture', 'encode', 'audio']);
  t.feed(input(0, '00:00:05.00', 'image2') + output('/tmp/animation.mp4') + stats('00:00:01.00', '0.5'));
  assert.equal(t.latest().remainingSeconds, 8);
  assert.deepEqual(t.latest().steps.map(step => step.status), ['complete', 'running', 'waiting']);
  t.feed('ffmpeg version fixture\n' + input(0, '00:00:05.00') + input(1, '00:00:03.00', 'mp3') + output('videos/output.mp4') + stats('00:00:01.00', '2'));
  assert.equal(t.latest().remainingSeconds, 1);
  assert.deepEqual(t.latest().steps.map(step => step.status), ['complete', 'complete', 'running']);
});
