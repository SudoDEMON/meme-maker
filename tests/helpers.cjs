'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { once } = require('events');
const repo = path.resolve(__dirname, '..');

async function waitFor(check, label, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Timed out: ${label}`);
}
async function fixture({ fps = 10, duration = 2 } = {}) {
  // Node resolves module paths through /private on macOS; use the same spelling
  // for fixture inputs so source files remain inside the server's project root.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meme-web-test-')));
  for (const name of ['web.js','server','web','mememaker.sh','convert.sh','combine_videos.sh','audio_video.sh','build.sh','capture.js','lib.sh']) {
    fs.cpSync(path.join(repo, name), path.join(root, name), { recursive: true });
  }
  const input = path.join(root, 'input.mp4');
  execFileSync('ffmpeg', ['-v','error','-f','lavfi','-i',`color=c=black:s=1280x720:r=${fps}:d=${duration}`,'-f','lavfi','-i',`sine=frequency=440:duration=${duration}`,'-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',input]);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  const marker = path.join(root, 'probe-started');
  const previewMarker = path.join(root, 'preview-started');
  const probeLog = path.join(root, 'probe.log');
  fs.writeFileSync(path.join(bin,'yt-dlp'), `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const source = args.at(-1);
if (args.includes('--dump-single-json')) {
  fs.appendFileSync(${JSON.stringify(probeLog)}, source+'\\n');
  const print = () => console.log(JSON.stringify({id:'fixture',title:'Remote fixture',width:1280,height:720,fps:${fps},duration:${duration}}));
  if (source.includes('slow')) {
    fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid));
    setTimeout(print, 900);
  } else print();
} else {
  const output = args[args.indexOf('-o')+1];
  if (source.includes('cancel-preview')) {
    fs.writeFileSync(${JSON.stringify(previewMarker)}, String(process.pid));
    setTimeout(() => fs.copyFileSync(${JSON.stringify(input)}, output), 30000);
  } else fs.copyFileSync(${JSON.stringify(input)}, output);
}
`);
  fs.chmodSync(path.join(bin,'yt-dlp'),0o755);
  const server = spawn(process.execPath, ['web.js'], { cwd: root, env: { ...process.env, MM_WEB_PORT: '0', PATH: bin + path.delimiter + process.env.PATH } });
  let output = '';
  server.stdout.on('data', data => { output += data; });
  server.stderr.on('data', data => { output += data; });
  const url = await waitFor(() => output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0], 'server startup');
  async function post(route, body) {
    const response = await fetch(url + route, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  async function job(action, fields) {
    const created = await post('/api/jobs', {action, fields});
    return waitFor(async () => {
      const current = await (await fetch(`${url}/api/jobs/${created.id}`)).json();
      if (current.status === 'running') return null;
      if (current.status !== 'complete') throw new Error(`Job ${current.status}: ${JSON.stringify(current)}`);
      return current;
    }, 'job completion');
  }
  async function close() {
    const exited = once(server, 'close');
    server.kill('SIGTERM');
    await exited;
    fs.rmSync(root, {recursive:true, force:true});
  }
  return { root, input, marker, previewMarker, probeLog, url, post, job, close };
}
function brightBounds(filename, width) {
  const pixels = execFileSync('ffmpeg', ['-v','error','-i',filename,'-frames:v','1','-pix_fmt','gray','-f','rawvideo','-'], {maxBuffer:4*1024*1024});
  let minX=Infinity, minY=Infinity, maxX=-1, maxY=-1, count=0;
  for (let i=0;i<pixels.length;i++) if(pixels[i]>100) {
    const x=i%width, y=Math.floor(i/width);
    minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); count++;
  }
  return {minX,minY,maxX,maxY,count};
}
module.exports = {fixture,waitFor,brightBounds};
