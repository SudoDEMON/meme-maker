'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { fixture, brightBounds } = require('./helpers.cjs');

async function fill(page, selector, value) {
  await page.$eval(selector, (el, text) => {
    el.value=text;
    el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
}

test('two-section browser workflows', {skip:process.platform === 'win32' ? 'Integration fixtures require Unix-native Node.' : false}, async t => {
  const f=await fixture();
  t.after(()=>f.close());
  const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
  t.after(()=>browser.close());
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  await page.setViewport({width:1280,height:900});
  await page.goto(f.url);
  await page.waitForSelector('#mediaForm');

  await t.test('duration inspection never overwrites a trim or steals field focus',async()=>{
    assert.equal(await page.$$eval('nav [data-section]',els=>els.length),2);
    await page.evaluate(()=>{
      const original=window.fetch;
      window.fetch=async(url,opts)=>{
        const response=await original(url,opts);
        if(url==='/api/source-info') {
          await new Promise(resolve=>{window.releaseMetadata=resolve;});
        }
        return response;
      };
      window.restoreFetch=()=>{window.fetch=original;};
    });
    await fill(page,'#sourceInput',f.input);
    await page.click('#addSourceForm button');
    await page.waitForFunction(()=>typeof window.releaseMetadata==='function');
    await page.click('.trim-settings summary');
    await fill(page,'#mediaForm [name="end"]','0:00.25');
    await page.focus('#mediaForm [name="end"]');
    await page.evaluate(()=>{window.releaseMetadata();window.restoreFetch();});
    await page.waitForFunction(()=>document.querySelector('.asset-select small').textContent.includes('1280'));
    assert.equal(await page.$eval('#mediaForm [name="end"]',el=>el.value),'0:00.25');
    assert.equal(await page.evaluate(()=>document.activeElement.name),'end');
  });
  await t.test('captions, crop, and export settings survive navigation and refresh',async()=>{
    await page.click('[data-section="editor"]');
    await page.waitForFunction(()=>document.querySelector('#previewStatus')?.textContent==='Preview ready.');
    assert.ok(await page.$eval('#editorCanvas',el=>el.getBoundingClientRect().top<600));
    await fill(page,'#editorForm [name="topText"]','KEEP THIS CAPTION');
    await fill(page,'#editorForm [name="width"]','640');
    await page.focus('[data-crop="e"]');
    await page.keyboard.press('ArrowLeft');
    const crop=await page.$eval('#cropSummary',el=>el.textContent);
    await page.click('[data-section="media"]');
    assert.equal(await page.$eval('#mediaForm [name="end"]',el=>el.value),'0:00.25');
    await page.click('[data-section="editor"]');
    await page.waitForFunction(()=>document.querySelector('#previewStatus')?.textContent==='Preview ready.');
    assert.equal(await page.$eval('[name="topText"]',el=>el.value),'KEEP THIS CAPTION');
    assert.equal(await page.$eval('[name="width"]',el=>el.value),'640');
    assert.equal(await page.$eval('#cropSummary',el=>el.textContent),crop);
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#previewStatus')?.textContent==='Preview ready.');
    assert.equal(await page.$eval('[name="topText"]',el=>el.value),'KEEP THIS CAPTION');
    assert.equal(await page.$eval('#cropSummary',el=>el.textContent),crop);
  });
  await t.test('completed output opens in the editor without another upload',async()=>{
    let uploads=0;
    const count=request=>{if(request.url().includes('/api/uploads'))uploads++;};
    page.on('request',count);
    await fill(page,'#editorForm [name="output"]','browser-caption');
    await page.click('#editorForm [data-run]');
    await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent==='Ready to save');
    assert.equal(await page.$eval('#jobDetails',el=>el.open),false);
    assert.ok(await page.$('#resultPreview video'));
    const bounds=brightBounds(path.join(f.root,'videos/browser-caption.mp4'),640);
    assert.ok(Math.abs((bounds.minX+bounds.maxX)/2-320)<8, `Classic caption should stay centered: ${JSON.stringify(bounds)}`);
    await page.click('#editOutputButton');
    await page.waitForFunction(()=>document.querySelector('#editorSource').selectedOptions[0].textContent==='browser-caption.mp4' && document.querySelector('#previewStatus').textContent==='Preview ready.');
    assert.equal(uploads,0);
    await page.waitForFunction(()=>!document.querySelector('[data-editor-action="play"]').disabled);
    await page.click('[data-editor-action="play"]');
    await page.waitForFunction(()=>document.querySelector('#editorVideo').currentTime>0);
    await page.click('[data-editor-action="play"]');
    page.off('request',count);
  });
  await t.test('combine uses multiple uploaded files in the chosen order',async()=>{
    await page.click('[data-section="media"]');
    await page.click('[data-operation="combine"]');
    const second=path.join(f.root,'second.mp4');
    fs.copyFileSync(f.input,second);
    await (await page.$('#mediaUpload')).uploadFile(second);
    await page.waitForFunction(()=>document.querySelector('#libraryStatus').textContent==='Added second.mp4');
    const selectedBefore=await page.$$eval('.source-summary li',els=>els.map(el=>el.textContent));
    assert.deepEqual(selectedBefore,['input.mp4','second.mp4']);
    await page.click('[aria-label="Move second.mp4 earlier"]');
    assert.deepEqual(await page.$$eval('.source-summary li',els=>els.map(el=>el.textContent)),['second.mp4','input.mp4']);
    await fill(page,'#mediaForm [name="output"]','browser-combined');
    await page.click('#mediaForm [data-run]');
    await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent==='Ready to save' && document.querySelector('#jobMessage').textContent==='browser-combined.mp4');
  });
  await t.test('extract and replace audio use the shared media library',async()=>{
    await page.click('[data-operation="extract"]');
    await fill(page,'#mediaForm [name="output"]','browser-audio');
    await page.click('#mediaForm [data-run]');
    await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent==='Ready to save' && document.querySelector('#jobMessage').textContent==='browser-audio.mp3');
    assert.ok(await page.$('#resultPreview audio'));
    await page.click('[data-operation="audio"]');
    const audioId=await page.$eval('#mediaForm [name="audioId"]',el=>[...el.options].find(option=>option.textContent==='browser-audio.mp3').value);
    await page.select('#mediaForm [name="audioId"]',audioId);
    await fill(page,'#mediaForm [name="output"]','browser-new-audio');
    await page.click('#mediaForm [data-run]');
    await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent==='Ready to save' && document.querySelector('#jobMessage').textContent==='browser-new-audio.mp4');
    assert.ok(await page.$('#resultPreview video'));
  });
  await t.test('an obsolete remote frame cannot replace the latest scrub position',async()=>{
    await page.click('[data-operation="convert"]');
    await fill(page,'#sourceInput','https://example.test/remote.mp4');
    await page.click('#addSourceForm button');
    await page.waitForFunction(()=>[...document.querySelectorAll('.asset-select strong')].some(el=>el.textContent==='Remote fixture'));
    // Open the remote asset directly, preserving the prior editor draft until this choice.
    await page.click('.asset-card:last-child [data-edit]');
    await page.waitForFunction(()=>document.querySelector('#previewStatus').textContent.includes('Frame preview ready'));
    await page.evaluate(()=>{
      const original=window.fetch;
      window.fetch=async(url,opts)=>{
        const response=await original(url,opts);
        if(url==='/api/preview-frame') {
          const time=Number(JSON.parse(opts.body).time);
          // Buffer the response before abort, mimicking a response already delivered.
          const buffered=new Response(await response.text(),{status:response.status,headers:response.headers});
          if(time<.3) await new Promise(resolve=>{window.releaseOldFrame=resolve;});
          else window.newFrameReceived=true;
          return buffered;
        }
        return response;
      };
      window.restoreFetch=()=>{window.fetch=original;};
    });
    await fill(page,'#previewTime','0.2');
    await page.waitForFunction(()=>typeof window.releaseOldFrame==='function');
    await fill(page,'#previewTime','0.7');
    await page.waitForFunction(()=>window.newFrameReceived && document.querySelector('#previewStatus').textContent.includes('Frame preview ready'));
    const latestImage=await page.$eval('#editorPreview',el=>el.src);
    await page.evaluate(async()=>{
      window.releaseOldFrame();window.restoreFetch();
      // Wait for queued promise continuations, without timing the network.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    assert.equal(await page.$eval('#previewTime',el=>el.value),'0.7');
    assert.equal(await page.$eval('#editorPreview',el=>el.src),latestImage);
  });
  await t.test('a disconnected event stream keeps Run locked and the real job cancellable',async()=>{
    fs.writeFileSync(path.join(f.root,'mememaker.sh'),"#!/usr/bin/env bash\ntrap 'exit 143' TERM INT\nsleep 30\n");
    await page.evaluate(()=>{
      window.originalEvents=window.EventSource;
      window.EventSource=class extends window.EventSource {
        constructor(...args) { super(...args); window.activeStream=this; }
      };
    });
    await page.click('#editorForm [data-run]');
    await page.waitForFunction(()=>window.activeStream && document.querySelector('#resultTitle').textContent==='Processing…');
    await page.evaluate(()=>window.activeStream.dispatchEvent(new Event('error')));
    assert.equal(await page.$eval('#resultTitle',el=>el.textContent),'Reconnecting…');
    assert.equal(await page.$eval('#editorForm [data-run]',el=>el.disabled),true);
    assert.equal(await page.$eval('#cancelButton',el=>el.hidden),false);
    await page.click('#cancelButton');
    await page.waitForFunction(()=>document.querySelector('#resultTitle').textContent==='Cancelled');
    assert.equal(await page.$eval('#editorForm [data-run]',el=>el.disabled),false);
    await page.evaluate(()=>{window.EventSource=window.originalEvents;});
  });
  await t.test('mobile layout stays within the viewport',async()=>{
    await page.setViewport({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  });
});
