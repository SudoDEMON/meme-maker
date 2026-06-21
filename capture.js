/**
 * capture.js
 * ----------
 * Usage:  node capture.js <htmlFile> <durationSec> [frameDir] [fps]
 *
 * Captures a 1280x1000 PNG sequence from a local HTML file
 * using headless Chromium (via puppeteer).
 *
 * Environment:
 *   MM_DEBUG=1           More verbose logging
 *   PUPPETEER_HEADLESS   Set to "false" to watch it render (debugging)
 */

const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

const htmlFile     = process.argv[2] || 'terminal.html';
const durationSec  = Number(process.argv[3] || 8);
const frameDirArg  = process.argv[4] || path.join(__dirname, 'frames');
const fpsArg       = Number(process.argv[5] || 60);
const DURATION_MS  = durationSec * 1000;

const WIDTH  = 1280;
const HEIGHT = 1000;
const FPS    = fpsArg;
const FRAME_DIR = path.resolve(frameDirArg);

const delay = ms => new Promise(res => setTimeout(res, ms));
const isDebug = process.env.MM_DEBUG === '1';

(async () => {
  let browser;
  try {
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new Error(`Invalid duration: ${process.argv[3]}`);
    }
    if (!Number.isInteger(FPS) || FPS <= 0) {
      throw new Error(`Invalid fps: ${process.argv[5]}`);
    }
    if (!fs.existsSync(htmlFile)) {
      throw new Error(`HTML file not found: ${htmlFile}`);
    }

    const launchOptions = {
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      defaultViewport: { width: WIDTH, height: HEIGHT },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    const fileURL = 'file://' + path.resolve(htmlFile);

    await page.goto(fileURL, { waitUntil: 'domcontentloaded' });
    await delay(250);

    fs.rmSync(FRAME_DIR, { recursive: true, force: true });
    fs.mkdirSync(FRAME_DIR, { recursive: true });

    const totalFrames = Math.max(1, Math.ceil(DURATION_MS / (1000 / FPS)));
    console.log(`Capturing ${totalFrames} frames (${durationSec}s @ ${FPS}fps)...`);

    for (let i = 0; i < totalFrames; i++) {
      const name = path.join(FRAME_DIR, `${String(i).padStart(5, '0')}.png`);
      await page.screenshot({ path: name, omitBackground: true });

      if (isDebug && i % 30 === 0) {
        console.log(`  frame ${i}/${totalFrames}`);
      }
      await delay(1000 / FPS);
    }

    console.log(`Capture complete: ${FRAME_DIR}`);
  } catch (err) {
    console.error('Capture failed:', err.message || err);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
