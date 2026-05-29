/**
 * capture.js
 * ----------
 * Usage:  node capture.js <htmlFile> <durationSec>
 *
 * Captures a 1280x1000 PNG sequence at 60 fps from a local HTML file
 * using headless Chromium (via puppeteer).
 *
 * Environment:
 *   BBV_DEBUG=1          More verbose logging
 *   PUPPETEER_HEADLESS   Set to "false" to watch it render (debugging)
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const htmlFile     = process.argv[2] || 'terminal.html';
const durationSec  = Number(process.argv[3] || 8);
const DURATION_MS  = durationSec * 1000;

const WIDTH  = 1280;
const HEIGHT = 1000;
const FPS    = 60;
const FRAME_DIR = path.join(__dirname, 'frames');

const delay = ms => new Promise(res => setTimeout(res, ms));
const isDebug = process.env.BBV_DEBUG === '1';

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      defaultViewport: { width: WIDTH, height: HEIGHT },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    const fileURL = 'file://' + path.resolve(htmlFile);

    await page.goto(fileURL, { waitUntil: 'domcontentloaded' });
    await delay(250);

    fs.rmSync(FRAME_DIR, { recursive: true, force: true });
    fs.mkdirSync(FRAME_DIR, { recursive: true });

    const totalFrames = Math.ceil(DURATION_MS / (1000 / FPS));
    console.log(`Capturing ${totalFrames} frames (${durationSec}s @ ${FPS}fps)…`);

    for (let i = 0; i < totalFrames; i++) {
      const name = path.join(FRAME_DIR, `${String(i).padStart(5, '0')}.png`);
      await page.screenshot({ path: name, omitBackground: true });

      if (isDebug && i % 30 === 0) {
        console.log(`  frame ${i}/${totalFrames}`);
      }
      await delay(1000 / FPS);
    }

    console.log('Capture complete → frames/');
  } catch (err) {
    console.error('Capture failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
