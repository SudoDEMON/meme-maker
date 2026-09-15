'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { fixture, waitFor, brightBounds } = require('./helpers.cjs');

test('media server regressions', {skip:process.platform === 'win32' ? 'Integration fixtures require Unix-native Node.' : false}, async t => {
  const f = await fixture();
  t.after(() => f.close());
  await t.test('resize and crop preserve the visible caption position', async () => {
    const fields = { input:f.input, topText:'HELLO', bottomText:'', topX:'960', topY:'400', bottomX:'0', bottomY:'0', fontSize:'48', width:'640', format:'mp4', output:'resized' };
    const resized = await f.job('meme-editor', fields);
    const bounds = brightBounds(path.join(f.root, resized.outputPath),640);
    assert.ok(bounds.count>100, 'caption must be visible after shrinking the video');
    assert.ok(bounds.minX>=475 && bounds.minX<490, JSON.stringify(bounds));
    assert.ok(bounds.minY>=195 && bounds.minY<215, JSON.stringify(bounds));
    const cropped = await f.job('meme-editor', {...fields, cropX:'800', cropY:'200', cropWidth:'480', cropHeight:'480', width:'240',output:'cropped'});
    const cropBounds = brightBounds(path.join(f.root,cropped.outputPath),240);
    assert.ok(cropBounds.count>100);
    assert.ok(cropBounds.minX>=75 && cropBounds.minX<90,JSON.stringify(cropBounds));
    assert.ok(cropBounds.minY>=95 && cropBounds.minY<115,JSON.stringify(cropBounds));
  });
  await t.test('slow metadata leaves the server responsive and is reused for export', async () => {
    const source='https://example.test/slow.mp4';
    const probing=f.post('/api/jobs',{action:'meme-editor',fields:{input:source,cropWidth:'99999',cropHeight:'99999'}}).catch(error=>error);
    await waitFor(()=>fs.existsSync(f.marker),'slow probe start');
    let finished=false;
    probing.then(()=>{finished=true;});
    const health=await fetch(`${f.url}/api/health`);
    assert.equal(health.status,200);
    assert.equal(finished,false,'health must respond before the slow probe completes');
    assert.match((await probing).message,/Crop area/);
    await f.post('/api/source-info',{source});
    // Invalid crop stops before creating a remote download but must reuse metadata.
    await assert.rejects(f.post('/api/jobs',{action:'meme-editor',fields:{input:source,cropWidth:'99999',cropHeight:'99999'}}),/Crop area/);
    assert.equal(fs.readFileSync(f.probeLog,'utf8').split('\n').filter(line=>line===source).length,1);
  });
  await t.test('playback supports byte ranges and only registered files', async () => {
    const metadata=await f.post('/api/source-info',{source:f.input});
    const original=fs.readFileSync(f.input);
    const partial=await fetch(f.url+metadata.fileUrl,{headers:{range:'bytes=10-29'}});
    assert.equal(partial.status,206);
    assert.equal(partial.headers.get('content-range'),`bytes 10-29/${original.length}`);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()),original.subarray(10,30));
    const bad=await fetch(f.url+metadata.fileUrl,{headers:{range:`bytes=${original.length}-`}});
    assert.equal(bad.status,416);
    assert.equal((await fetch(f.url+'/files/web.js')).status,404);
  });
  await t.test('aborted preview requests terminate their download process', async () => {
    const controller=new AbortController();
    const pending=fetch(f.url+'/api/preview-frame',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({input:'https://example.test/cancel-preview.mp4',time:'0'}),signal:controller.signal});
    // Attach rejection handling before aborting to avoid an unhandled rejection.
    const cancelled=assert.rejects(pending,/abort/i);
    await waitFor(()=>fs.existsSync(f.previewMarker),'preview child start');
    const pid=Number(fs.readFileSync(f.previewMarker,'utf8'));
    controller.abort();
    await cancelled;
    await waitFor(()=>{try{process.kill(pid,0);return false;}catch{return true;}},'preview child exit');
  });
});

test('job timing and step progress survive status requests and event reconnection', {skip:process.platform === 'win32' ? 'Integration fixtures require Unix-native Node.' : false}, async () => {
  const f = await fixture();
  let active;
  try {
    const completed = await f.job('download-convert', { source:f.input, start:'0', end:'1', format:'mp4', output:'timing-complete' });
    assert.ok(Date.parse(completed.finishedAt) >= Date.parse(completed.startedAt));
    assert.deepEqual(completed.progress.steps.map(step => step.status), ['complete']);

    fs.writeFileSync(path.join(f.root, 'convert.sh'), `#!/usr/bin/env bash
trap 'exit 143' TERM INT
printf "Input #0, mov, from 'input.mp4':\\n  Duration: 00:00:02.00, start: 0.000000\\nOutput #0, webm, to 'videos/timed.webm':\\nframe=5 time=00:00:00.50 speed=0.25x\\r" >&2
sleep 30
`);
    active = await f.post('/api/jobs', { action:'download-convert', fields:{ source:f.input, start:'0', end:'1', format:'webm', output:'timed' } });
    assert.ok(Number.isFinite(Date.parse(active.startedAt)));
    const current = await waitFor(async () => {
      const job = await (await fetch(`${f.url}/api/jobs/${active.id}`)).json();
      return job.progress?.remainingSeconds === 2 ? job : null;
    }, 'render estimate');
    assert.equal(current.progress.percent, 50);
    assert.equal(current.progress.steps[0].status, 'running');
    const response = await fetch(`${f.url}/api/jobs/${active.id}/events`);
    const reader = response.body.getReader();
    let events = '';
    try {
      while (!events.includes('event: snapshot\n')) {
        const { value, done } = await reader.read();
        if (done) break;
        events += new TextDecoder().decode(value);
      }
    } finally { await reader.cancel(); }
    const snapshot = JSON.parse(events.match(/event: snapshot\ndata: (.*)\n/)[1]);
    assert.equal(snapshot.startedAt, active.startedAt);
    assert.equal(snapshot.progress.remainingSeconds, 2);
    await f.post(`/api/jobs/${active.id}/cancel`, {});
    const cancelled = await waitFor(async () => {
      const job = await (await fetch(`${f.url}/api/jobs/${active.id}`)).json();
      return job.status === 'cancelled' ? job : null;
    }, 'cancelled timing job');
    assert.deepEqual(cancelled.progress.steps.map(step => step.status), ['cancelled']);
    assert.ok(Date.parse(cancelled.finishedAt) >= Date.parse(cancelled.startedAt));
    active = null;
  } finally {
    if (active) {
      await f.post(`/api/jobs/${active.id}/cancel`, {});
      await waitFor(async () => (await (await fetch(`${f.url}/api/jobs/${active.id}`)).json()).status !== 'running', 'test process cleanup');
    }
    await f.close();
  }
});
