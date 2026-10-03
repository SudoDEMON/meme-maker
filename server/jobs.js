'use strict';

const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const { REPO_ROOT, LOCAL_VIDEO_INPUT_EXTS } = require('./config');
const {
  basenameNoExt, required, optional, optionalInteger, optionalPositiveNumber, parseFrameBoundary, validateTimeRange, safeStem, outputStem, repoPath, spawnCommand, sourceFallbackStem, resolveJobSource, isLocalSource, defaultDirForExt, normalizeOutputPath, normalizeVideoOutput, normalizeMediaOutput, resolveInputPath, validateMediaInputExtension, parseCropFields, addCaptionOptions, addFontOptions, addPerLineFontOptions, validateFormat
} = require('./inputs');
const { sourceInfo } = require('./media');
const { publicFileUrl, publicDownloadUrl } = require('./files');
const { signalChildTree, canSignalProcessGroup } = require('./processes');
const { JobProgress } = require('./job-progress');
const jobs = new Map();

async function buildJob(action, fields) {
  const data = fields && typeof fields === 'object' ? fields : {};

  switch (action) {
    case 'download-convert': {
      const sourceRaw = required(data, 'source', 'Source');
      const source = resolveJobSource(sourceRaw);
      const { start, end } = validateTimeRange(data);
      const format = optional(data, 'format') || 'mp4';
      validateFormat(format, ['gif', 'mp3', 'mp4', 'webm']);
      const output = normalizeMediaOutput(optional(data, 'output'), format, sourceFallbackStem(sourceRaw));

      return {
        cmd: repoPath('convert.sh'),
        args: [source, start, end, format, output],
        outputPath: output
      };
    }

    case 'text-to-media': {
      const sourceRaw = required(data, 'source', 'Source');
      const source = resolveJobSource(sourceRaw);
      const sourceIsLocal = isLocalSource(sourceRaw);
      const { start, end } = validateTimeRange(data);
      const format = optional(data, 'format') || 'gif';
      validateFormat(format, ['gif', 'mp4', 'webm']);
      const fallbackStem = `${sourceFallbackStem(sourceRaw)}-captioned`;
      const output = normalizeMediaOutput(optional(data, 'outputName') || optional(data, 'output'), format, fallbackStem);
      const top = typeof data.topText === 'string' ? data.topText : '';
      const bottom = typeof data.bottomText === 'string' ? data.bottomText : '';
      const font = optional(data, 'fontPath');
      const args = [];
      addCaptionOptions(args, data);
      addFontOptions(args, data);
      addPerLineFontOptions(args, data);

      if (sourceIsLocal) {
        args.unshift('--caption-local');
        args.push('--start', start);
        if (end) args.push('--end', end);
        args.push(source, output, top, bottom);
        if (font) args.push(font);
        return {
          cmd: repoPath('mememaker.sh'),
          args,
          outputPath: output
        };
      }

      const stem = outputStem(output, fallbackStem);
      args.push(source, start, end, format, top, bottom, stem);
      if (font) args.push(font);
      return {
        cmd: repoPath('mememaker.sh'),
        args,
        outputPath: `${format === 'gif' ? 'gifs' : 'videos'}/${stem}.${format}`
      };
    }

    case 'meme-editor':
    case 'experimental-gif-editor': {
      const input = required(data, 'input', 'Input media');
      const sourceIsLocal = isLocalSource(input);
      const inputPath = sourceIsLocal ? resolveInputPath(input, 'Input media') : '';
      const source = sourceIsLocal ? inputPath : resolveJobSource(input, 'Input media');
      if (sourceIsLocal) {
        validateMediaInputExtension(input, LOCAL_VIDEO_INPUT_EXTS, 'Input media');
      }
      const requestedFormat = optional(data, 'format') || 'gif';
      validateFormat(requestedFormat, ['gif', 'mp4', 'webm']);
      const inputStem = sourceIsLocal
        ? safeStem(path.basename(input).replace(/\.[^.]+$/, ''), 'visual-caption')
        : sourceFallbackStem(input, 'visual-caption');
      const output = normalizeOutputPath(optional(data, 'output'), {
        defaultExt: requestedFormat,
        allowedExts: [requestedFormat],
        fallbackStem: `${inputStem}-visual`,
        defaultDir: requestedFormat === 'gif' ? 'gifs' : 'videos'
      });
      const top = typeof data.topText === 'string' ? data.topText : '';
      const bottom = typeof data.bottomText === 'string' ? data.bottomText : '';

      const args = sourceIsLocal ? ['--caption-local', '--bottom-from-top'] : ['--bottom-from-top'];
      const topX = Number(optionalInteger(data, 'topX', 'Text 1 x', '0'));
      const topY = Number(optionalInteger(data, 'topY', 'Text 1 y', '0'));
      const bottomX = Number(optionalInteger(data, 'bottomX', 'Text 2 x', '0'));
      const bottomY = Number(optionalInteger(data, 'bottomY', 'Text 2 y', '0'));
      const fontSize = optionalInteger(data, 'fontSize', 'Font size', '50');
      const outputFps = optionalPositiveNumber(data, 'outputFps', 'Output FPS');
      const metadata = await sourceInfo(input);
      const crop = parseCropFields(data, metadata);
      const width = optionalInteger(data, 'width', 'Width', '720');
      const outputStart = parseFrameBoundary(optional(data, 'outputStart'), metadata, { label: 'Output Start' });
      const outputEnd = parseFrameBoundary(optional(data, 'outputEnd'), metadata, { label: 'Output End' });
      const fontFamily = optional(data, 'fontFamily');
      const font = optional(data, 'fontPath');
      if (outputEnd && (outputStart?.seconds ?? 0) >= outputEnd.seconds) {
        throw new Error('Output Start must be before Output End.');
      }

      if (sourceIsLocal && outputStart) args.push('--start', String(outputStart.seconds));
      if (sourceIsLocal && outputEnd) args.push('--end', String(outputEnd.seconds));
      if (crop) {
        args.push('--crop', String(crop.x), String(crop.y), String(crop.width), String(crop.height));
      }
      // The editor stores source pixels. Draw captions before cropping/scaling so
      // the image, text positions, font sizes, and borders transform together.
      args.push('--source-coordinates');
      args.push('--top-x', String(topX), '--top-y', String(topY));
      args.push('--bottom-x', String(bottomX), '--bottom-y', String(bottomY));
      args.push('--font-size', fontSize, '--width', width);
      if (outputFps) args.push('--fps', outputFps);
      if (fontFamily) args.push('--font-family', fontFamily);
      if (data.bold) args.push('--bold');
      if (data.italic) args.push('--italic');
      if (data.underline) args.push('--underline');
      if (data.strike) args.push('--strikethrough');
      addPerLineFontOptions(args, data);

      if (sourceIsLocal) {
        args.push(input, output, top, bottom);
        if (font) args.push(font);
        return {
          cmd: repoPath('mememaker.sh'),
          args,
          outputPath: output
        };
      }

      const remoteStart = outputStart ? String(outputStart.seconds) : '0:00';
      const remoteEnd = outputEnd ? String(outputEnd.seconds) : '';
      const stem = outputStem(output, `${inputStem}-visual`);
      args.push(source, remoteStart, remoteEnd, requestedFormat, top, bottom, stem);
      if (font) args.push(font);
      return {
        cmd: repoPath('mememaker.sh'),
        args,
        outputPath: `${requestedFormat === 'gif' ? 'gifs' : 'videos'}/${stem}.${requestedFormat}`
      };
    }

    case 'audio-to-video': {
      const sourceRaw = required(data, 'source', 'Source');
      const source = resolveJobSource(sourceRaw);
      const { start, end } = validateTimeRange(data);
      const audio = resolveInputPath(required(data, 'audio', 'Input audio'), 'Input audio');
      const format = optional(data, 'format') || 'mp4';
      validateFormat(format, ['mp4', 'webm']);
      const output = normalizeVideoOutput(optional(data, 'output'), `${sourceFallbackStem(sourceRaw)}-with-audio`, format);

      return {
        cmd: repoPath('audio_video.sh'),
        args: [source, start, end, audio, output],
        outputPath: output
      };
    }

    case 'combine-videos': {
      const inputs = Array.isArray(data.inputs) ? data.inputs : [data.first, data.second];
      if (inputs.length < 2 || inputs.length > 30) throw new Error('Choose between 2 and 30 videos to combine.');
      const sources = inputs.map(input => {
        validateMediaInputExtension(input, ['mov', 'mp4', 'webm'], 'Input video');
        return resolveInputPath(input, 'Input video');
      });
      const format = optional(data, 'format') || 'mp4';
      validateFormat(format, ['mp4', 'webm']);
      const output = normalizeVideoOutput(
        optional(data, 'output'),
        `${safeStem(basenameNoExt(inputs[0]), 'video')}-combined`,
        format
      );

      return {
        cmd: repoPath('combine_videos.sh'),
        args: [...sources, output],
        outputPath: output
      };
    }

    case 'build-html': {
      const html = required(data, 'html', 'HTML file');
      const seconds = required(data, 'seconds', 'Seconds');
      const audio = optional(data, 'audio');
      const requestedFormat = optional(data, 'format') || 'mp4';
      validateFormat(requestedFormat, ['mp4', 'webm', 'gif', 'png']);
      const output = normalizeOutputPath(optional(data, 'output'), {
        defaultExt: requestedFormat,
        allowedExts: ['mp4', 'webm', 'gif', 'png'],
        fallbackStem: safeStem(path.basename(html).replace(/\.[^.]+$/, '') || 'render', 'render'),
        defaultDir: defaultDirForExt(requestedFormat)
      });
      const args = [html, output, seconds];
      if (audio) args.push(audio);

      return {
        cmd: repoPath('build.sh'),
        args,
        outputPath: output
      };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

function emit(job, event, data) {
  const payload = { event, data };
  job.events.push(payload);
  if (job.events.length > 500) job.events.shift();

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.clients) {
    client.write(message);
  }
}

function terminateJob(job) {
  if (!job || !job.child || job.status !== 'running') return;
  signalChildTree(job.child, 'SIGTERM');
  if (job.killTimer) clearTimeout(job.killTimer);
  job.killTimer = setTimeout(() => {
    if (job.status === 'running') {
      signalChildTree(job.child, 'SIGKILL');
    }
  }, 3000);
  if (typeof job.killTimer.unref === 'function') job.killTimer.unref();
}

async function startJob(action, fields) {
  const startedAt = new Date().toISOString();
  const built = await buildJob(action, fields);
  const id = crypto.randomUUID();
  const fileUrl = publicFileUrl(built.outputPath);
  const downloadUrl = publicDownloadUrl(built.outputPath);
  const job = {
    id,
    action,
    cmd: built.cmd,
    args: built.args,
    outputPath: built.outputPath,
    fileUrl,
    downloadUrl,
    status: 'running',
    exitCode: null,
    signal: null,
    startedAt,
    finishedAt: null,
    progress: null,
    clients: new Set(),
    events: [],
    child: null,
    killTimer: null,
    cancelRequested: false
  };

  jobs.set(id, job);

  const displayCommand = [path.basename(job.cmd), ...job.args].map(arg => JSON.stringify(arg)).join(' ');
  emit(job, 'status', {
    status: job.status,
    startedAt: job.startedAt,
    outputPath: job.outputPath,
    fileUrl: job.fileUrl,
    downloadUrl: job.downloadUrl,
    command: displayCommand
  });

  const spawnSpec = spawnCommand(job.cmd, job.args);
  const child = spawn(spawnSpec.cmd, spawnSpec.args, {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: canSignalProcessGroup()
  });
  job.child = child;
  job.pid = child.pid;

  const progress = new JobProgress(action, fields || {}, built, data => {
    job.progress = data;
    emit(job, 'progress', data);
  });
  progress.publish();
  for (const stream of ['stdout', 'stderr']) child[stream].on('data', chunk => {
    const text = chunk.toString();
    progress.push(stream, text);
    emit(job, 'log', { stream, text });
  });

  child.on('error', err => {
    if (job.killTimer) clearTimeout(job.killTimer);
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
    progress.finish(job.status);
    emit(job, 'log', { stream: 'stderr', text: `${err.message}\n` });
    emit(job, 'done', {
      status: job.status,
      exitCode: job.exitCode,
      signal: job.signal,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: job.progress,
      outputPath: job.outputPath,
      fileUrl: job.fileUrl,
      downloadUrl: job.downloadUrl
    });
  });

  child.on('close', (code, signal) => {
    if (job.status !== 'running') return;
    if (job.killTimer) clearTimeout(job.killTimer);
    job.exitCode = code;
    job.signal = signal;
    job.status = job.cancelRequested ? 'cancelled' : (code === 0 ? 'complete' : 'failed');
    job.finishedAt = new Date().toISOString();
    progress.finish(job.status);
    emit(job, 'done', {
      status: job.status,
      exitCode: code,
      signal,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: job.progress,
      outputPath: job.outputPath,
      fileUrl: job.fileUrl,
      downloadUrl: job.downloadUrl
    });
  });

  return job;
}

module.exports = { buildJob, startJob, terminateJob, jobs };
