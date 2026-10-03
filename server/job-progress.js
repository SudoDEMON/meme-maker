'use strict';

const path = require('path');
const { REPO_ROOT } = require('./config');
const { isLocalSource } = require('./inputs');

function clockSeconds(value) {
  if (!/^\d+(?::\d+){0,2}(?:\.\d+)?$/.test(String(value))) return null;
  const seconds = String(value).split(':').reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isFinite(seconds) ? seconds : null;
}

function plannedSteps(action, local, trimmed, format, audio) {
  const steps = [];
  const add = (id, label) => steps.push({ id, label, status: steps.length ? 'waiting' : 'running' });
  if (action === 'build-html') {
    add('capture', 'Capture animation frames');
    if (format === 'PNG') add('save', 'Save image');
    else {
      if (format === 'GIF') add('palette', 'Generate GIF palette');
      add('encode', `Encode ${format}${audio && format === 'WEBM' ? ' with audio' : ''}`);
      if (audio && format === 'MP4') add('audio', 'Add audio');
    }
  } else if (action === 'combine-videos') {
    add('prepare', 'Prepare clips');
    add('combine', `Combine clips into ${format}`);
  } else {
    if (!local) add('download', 'Download media');
    if (action === 'audio-to-video') {
      if (local && trimmed) add('prepare', 'Trim video');
      add('encode', `Replace audio and encode ${format}`);
    } else {
      if (!local && action !== 'download-convert') add('prepare', 'Prepare video');
      if (format === 'GIF') add('palette', 'Generate GIF palette');
      add('encode', format === 'MP3' ? 'Extract audio' : `${action === 'download-convert' ? 'Convert to' : 'Render'} ${format}`);
    }
  }
  return steps;
}

// Read the tools' existing progress output without changing their commands.
// Estimates describe one step: a download, trim, palette pass, or final encode.
class JobProgress {
  constructor(action, fields, built, onProgress) {
    this.action = action;
    this.local = isLocalSource(fields.source || fields.input);
    this.outputPath = path.resolve(REPO_ROOT, built.outputPath);
    const option = name => built.args.includes(name) ? built.args[built.args.indexOf(name) + 1] : '';
    const editor = ['meme-editor', 'experimental-gif-editor'].includes(action);
    this.start = clockSeconds(editor ? option('--start') : fields.start) || 0;
    this.end = clockSeconds(editor ? option('--end') : fields.end);
    const format = path.extname(built.outputPath).slice(1).toUpperCase();
    this.steps = plannedSteps(action, this.local, this.start > 0 || this.end !== null, format, fields.audio);
    this.stepIndex = 0;
    this.onProgress = onProgress;
    this.buffers = { stdout: '', stderr: '' };
    this.inputs = [];
    this.inputFormats = [];
    this.inputPaths = [];
    this.inputIndex = -1;
    this.duration = null;
    this.phase = 'Preparing';
  }

  publish(remainingSeconds = null, percent = null) {
    this.onProgress({
      phase: this.phase,
      remainingSeconds: Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : null,
      percent: Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : null,
      steps: this.steps.map(step => ({ ...step })),
      updatedAt: new Date().toISOString()
    });
  }

  advance(id) {
    const index = this.steps.findIndex(step => step.id === id);
    if (index < this.stepIndex) return false;
    this.stepIndex = index;
    this.steps.forEach((step, i) => { step.status = i < index ? 'complete' : i === index ? 'running' : 'waiting'; });
    return true;
  }

  finish(status) {
    this.flush();
    this.steps.forEach(step => {
      if (status === 'complete') step.status = 'complete';
      else if (step.status === 'running') step.status = status;
      else if (step.status === 'waiting') step.status = 'not-run';
    });
    this.publish();
  }

  reset(phase) {
    this.phase = phase;
    this.duration = null;
    this.inputs = [];
    this.inputFormats = [];
    this.inputPaths = [];
    this.inputIndex = -1;
    this.publish();
  }

  trimmed(duration) {
    const end = this.end === null ? duration : duration === null ? this.end : Math.min(duration, this.end);
    return end === null ? null : Math.max(0, end - this.start);
  }

  outputDuration(final) {
    const first = this.inputs[0] ?? null;
    // Remote section downloads can report timestamps from the full source.
    if (this.inputPaths.some(input => /^https?:\/\//i.test(input))) return null;
    if (this.action === 'combine-videos' && final) {
      return this.inputs.length && this.inputs.every(value => value !== null)
        ? this.inputs.reduce((total, value) => total + value, 0) : null;
    }
    if (this.action === 'audio-to-video') {
      if (!final) return this.local ? this.trimmed(first) : first;
      const audio = this.inputs[1] ?? null;
      if (this.inputFormats[0] === 'gif') return audio;
      return first !== null && audio !== null ? Math.min(first, audio) : null;
    }
    if (this.action === 'build-html') {
      if (final && /\.(mp4|webm)$/i.test(this.outputPath) && this.inputs.length > 1) {
        return first !== null && this.inputs[1] !== null ? Math.min(first, this.inputs[1]) : null;
      }
      return first;
    }
    return this.local ? this.trimmed(first) : first;
  }

  push(stream, text) {
    const lines = (this.buffers[stream] + text).split(/[\r\n]/);
    this.buffers[stream] = lines.pop().slice(-16384);
    for (const line of lines) this.line(line);
  }

  flush() {
    for (const stream of Object.keys(this.buffers)) {
      this.line(this.buffers[stream]);
      this.buffers[stream] = '';
    }
  }

  line(raw) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (/^ffmpeg version\b/.test(line)) { this.reset('Preparing media'); return; }
    const input = line.match(/^Input #(\d+), (.+), from '(.*)':$/);
    if (input) {
      const index = Number(input[1]);
      if (index === 0) this.reset('Preparing media');
      this.inputIndex = index;
      this.inputs[index] = null;
      this.inputFormats[index] = input[2];
      this.inputPaths[index] = input[3];
      return;
    }
    const duration = line.match(/^Duration: ([^,]+)/);
    if (duration && this.inputIndex >= 0) { this.inputs[this.inputIndex] = clockSeconds(duration[1]); return; }
    const output = line.match(/^Output #0, .+, to '(.*)':$/);
    if (output) {
      const final = path.resolve(REPO_ROOT, output[1]) === this.outputPath;
      let step = this.steps.at(-1).id;
      if (!final) {
        if (this.inputPaths.some(input => /^https?:\/\//i.test(input))) step = 'download';
        else if (/\.png$/i.test(output[1]) && this.steps.some(item => item.id === 'palette')) step = 'palette';
        else if (this.action === 'build-html') step = 'encode';
        else if (this.steps.some(item => item.id === 'prepare')) step = 'prepare';
        else step = 'download';
      }
      this.advance(step);
      this.duration = this.outputDuration(final);
      this.phase = final ? `Encoding ${path.extname(this.outputPath).slice(1).toUpperCase()}` : 'Preparing media';
      this.publish();
      return;
    }
    const time = line.match(/\btime=\s*(\S+)/);
    const speed = line.match(/\bspeed=\s*(\S+)x(?:\s|$)/);
    if (time) {
      const seconds = clockSeconds(time[1]);
      const rate = speed ? Number(speed[1]) : 0;
      const known = seconds !== null && this.duration > 0;
      const remaining = known && Number.isFinite(rate) && rate > 0 ? (this.duration - seconds) / rate : null;
      this.publish(remaining, known ? seconds / this.duration * 100 : null);
      return;
    }
    if (/^\[download\]/.test(line)) {
      if (!this.advance('download')) return;
      if (this.phase !== 'Downloading' || /Destination:/.test(line)) this.reset('Downloading');
      const percent = line.match(/\[download\]\s+([\d.]+)%/);
      const eta = line.match(/\bETA\s+(\S+)/);
      this.publish(eta ? clockSeconds(eta[1]) : null, percent ? Number(percent[1]) : null);
      return;
    }
    if (/^\[(Merger|ExtractAudio|VideoConvertor|VideoRemuxer)\]/.test(line)) this.reset('Preparing media');
    else if (/^(?:• )?Capturing /.test(line)) { this.advance('capture'); this.reset('Capturing frames'); }
    else if (/^(?:\[out#.*\]\s*)?video:.*muxing overhead:/.test(line)) {
      this.phase = 'Finishing step';
      this.publish();
    }
  }
}

module.exports = { JobProgress };
