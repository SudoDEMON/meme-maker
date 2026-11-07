'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer');
const { fixture, brightBounds, probeVideo, rotatedFixture } = require('./helpers.cjs');

async function fill(page, selector, value) {
  await page.$eval(selector, (element, text) => {
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

function probe(file) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]));
}

test('rotated browser preview exports full-frame and cropped captions in display coordinates', {skip:process.platform === 'win32'}, async t => {
  const f = await fixture();
  t.after(() => f.close());
  const input = rotatedFixture(f.root, 90);
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(f.url);
  await fill(page, '#sourceInput', input);
  await page.click('#addSourceForm button');
  await page.click('[data-section="editor"]');
  await page.waitForFunction(() => document.querySelector('#previewStatus').textContent === 'Preview ready.');
  assert.deepEqual(await page.$eval('#editorPreview', el => [el.naturalWidth,el.naturalHeight]), [720,1280]);
  await page.waitForFunction(() => document.querySelector('#editorVideo').readyState >= 1);
  assert.deepEqual(await page.$eval('#editorVideo', el => [el.videoWidth,el.videoHeight]), [720,1280]);
  assert.equal(await page.$eval('#cropSummary', el => el.textContent), '720 × 1280');
  await fill(page, '#editorForm [name="width"]', '360');
  await fill(page, '#editorForm [name="topText"]', '100% READY');
  await fill(page, '#editorForm [name="bottomText"]', '%{n} stays literal');
  await page.click('[data-editor-action="classic"]');
  for (const cropped of [false,true]) {
    if (cropped) {
      await page.focus('[data-crop="s"]');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.$eval('#cropSummary', el => el.textContent), '720 × 1278');
    }
    const name = cropped ? 'portrait-cropped' : 'portrait-full';
    await fill(page, '#editorForm [name="output"]', name);
    await page.click('#editorForm [data-run]');
    await page.waitForFunction(name => document.querySelector('#resultTitle').textContent === 'Ready to save' && document.querySelector('#jobMessage').textContent === `${name}.mp4`, {}, name);
    const output = path.join(f.root, `videos/${name}.mp4`);
    const stream = probeVideo(output);
    assert.deepEqual([stream.width,stream.height], [360,640]);
    assert.ok(!stream.side_data_list?.some(data => data.rotation));
    execFileSync('ffmpeg', ['-v','error','-xerror','-i',output,'-f','null','-']);
    for (const [line,y] of [['top',0],['bottom',570]]) {
      const frame = path.join(f.root, `${name}-${line}.png`);
      // Exclude the fixture's left-edge orientation marker from caption bounds.
      execFileSync('ffmpeg', ['-v','error','-i',output,'-vf',`crop=210:70:76:${y}`,'-frames:v','1','-update','1',frame]);
      const bounds = brightBounds(frame,210);
      assert.ok(bounds.count > 100, `${line} caption is visible`);
      assert.ok(Math.abs((bounds.minX+bounds.maxX)/2+76-180)<8, `${line}: ${JSON.stringify(bounds)}`);
    }
    if (process.env.MM_TEST_EVIDENCE_DIR) {
      fs.mkdirSync(process.env.MM_TEST_EVIDENCE_DIR,{recursive:true});
      fs.copyFileSync(output,path.join(process.env.MM_TEST_EVIDENCE_DIR,`${name}.mp4`));
      await page.screenshot({path:path.join(process.env.MM_TEST_EVIDENCE_DIR,`${name}.png`),fullPage:true});
    }
  }
  assert.deepEqual(errors, []);
});

test('WebM export accepts fractional preview times and blank trim boundaries', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture({ fps: 30, duration: 2.1 });
  t.after(() => f.close());
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(f.url);
  await fill(page, '#sourceInput', f.input);
  await page.click('#addSourceForm button');
  await page.waitForFunction(() => document.querySelector('.asset-select small')?.textContent.includes('1280'));
  await page.click('[data-section="editor"]');
  await page.waitForFunction(() => document.querySelector('#previewStatus')?.textContent.includes('ready'));
  for (const name of ['outputStart', 'outputEnd']) {
    assert.equal(await page.$eval(`[name="${name}"]`, el => el.value), '');
  }
  await fill(page, '#editorForm [name="topText"]', 'WEBM EXPORT');
  await fill(page, '#editorForm [name="width"]', '320');
  await fill(page, '#editorForm [name="output"]', 'full-webm');
  await page.select('#editorForm [name="format"]', 'webm');
  await fill(page, '#previewTime', '61');
  assert.match(await page.$eval('#previewTimeLabel', el => el.textContent), /0:02\.033/);
  assert.deepEqual(await page.$$eval('#editorForm :invalid', els => els.map(el => ({ id:el.id, name:el.name, value:el.value, max:el.max, message:el.validationMessage }))), []);
  await fill(page, '#previewTime', '999');
  assert.equal(await page.$eval('#previewFrame', el => el.value), '62');
  assert.deepEqual(await page.$$eval('#editorForm :invalid', els => els.map(el => ({ id:el.id, name:el.name, value:el.value, max:el.max, message:el.validationMessage }))), []);
  await page.click('#editorForm [data-run]');
  await page.waitForFunction(() => document.querySelector('#resultTitle').textContent === 'Ready to save');
  const output = path.join(f.root, 'videos/full-webm.webm');
  const media = probe(output);
  const video = media.streams.find(stream => stream.codec_type === 'video');
  assert.equal(video.codec_name, 'vp9');
  assert.equal(Number(video.nb_read_frames), 63, 'scrubbing must not trim a blank range');
  assert.ok(brightBounds(output, 320).count > 100, 'the exported WebM contains the caption');
  const download = await fetch(f.url + await page.$eval('#downloadLink', el => el.getAttribute('href')));
  assert.equal(download.status, 200);
  assert.equal(Number(download.headers.get('content-length')), fs.statSync(output).size);

  // A fractional FPS is valid too; a hidden advanced control must not block submit.
  await fill(page, '#editorForm [name="outputFps"]', '29.97');
  await fill(page, '#editorForm [name="outputStart"]', '');
  await fill(page, '#editorForm [name="outputEnd"]', '1');
  await fill(page, '#editorForm [name="output"]', 'trimmed-webm');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#previewStatus')?.textContent.includes('ready'));
  assert.equal(await page.$eval('[name="outputStart"]', el => el.value), '');
  assert.equal(await page.$eval('[name="outputEnd"]', el => el.value), '1');
  assert.deepEqual(await page.$$eval('#editorForm :invalid', els => els.map(el => ({ id:el.id, name:el.name, value:el.value, max:el.max, message:el.validationMessage }))), []);
  await page.click('#editorForm [data-run]');
  await page.waitForFunction(() => document.querySelector('#resultTitle').textContent === 'Ready to save' && document.querySelector('#jobMessage').textContent === 'trimmed-webm.webm');
  assert.ok(Number(probe(path.join(f.root, 'videos/trimmed-webm.webm')).format.duration) < 1.15);

  // All media tools share the same optional-boundary behavior in the form and API.
  await page.click('[data-section="media"]');
  for (const operation of ['convert', 'extract', 'audio']) {
    await page.click(`[data-operation="${operation}"]`);
    await page.$eval('.trim-settings', el => { el.open = true; });
    await fill(page, '#mediaForm [name="start"]', '');
    await fill(page, '#mediaForm [name="end"]', '');
    await fill(page, '#mediaForm [name="output"]', `full-${operation}`);
    if (operation === 'audio') {
      const audioId = await page.$eval('[name="audioId"]', el => [...el.options].find(option => option.textContent === 'full-extract.mp3').value);
      await page.select('[name="audioId"]', audioId);
    }
    await page.click('#mediaForm [data-run]');
    const filename = `full-${operation}.${operation === 'extract' ? 'mp3' : 'mp4'}`;
    await page.waitForFunction(name => document.querySelector('#resultTitle').textContent === 'Ready to save' && document.querySelector('#jobMessage').textContent === name, {}, filename);
    const folder = operation === 'extract' ? 'Audio' : 'videos';
    const duration = Number(probe(path.join(f.root, folder, filename)).format.duration);
    assert.ok(duration >= 2.05 && duration < 2.25, `${operation}: ${duration}`);
  }
  assert.deepEqual(errors, []);
});
