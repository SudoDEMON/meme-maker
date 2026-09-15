'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { REPO_ROOT, SOURCE_INFO_TIMEOUT_MS } = require('./config');

function canSignalProcessGroup() {
  return process.platform !== 'win32';
}

function signalChildTree(child, signal = 'SIGTERM') {
  if (!child?.pid) return false;
  try {
    if (canSignalProcessGroup()) process.kill(-child.pid, signal);
    else child.kill(signal);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    throw err;
  }
}

function runCapture(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Request cancelled.'));
      return;
    }
    const child = spawn(cmd, args, {
      cwd: options.cwd || REPO_ROOT,
      env: process.env,
      stdio: ['ignore', options.discardOutput ? 'ignore' : 'pipe', 'pipe'],
      detached: canSignalProcessGroup()
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let killTimer;
    const stop = error => {
      if (settled) return;
      settled = true;
      signalChildTree(child);
      killTimer = setTimeout(() => signalChildTree(child, 'SIGKILL'), 2000);
      killTimer.unref();
      reject(error);
    };
    const abort = () => stop(new Error('Request cancelled.'));
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeoutMs = options.timeoutMs || SOURCE_INFO_TIMEOUT_MS;
    const timer = setTimeout(() => stop(new Error(`${path.basename(cmd)} timed out after ${timeoutMs}ms.`)), timeoutMs);
    timer.unref();
    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
      if (stdout.length > 2 * 1024 * 1024) stop(new Error(`${path.basename(cmd)} returned too much metadata.`));
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-20000); });
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      options.signal?.removeEventListener('abort', abort);
    };
    child.on('error', err => {
      cleanup();
      if (!settled) { settled = true; reject(err); }
    });
    child.on('close', code => {
      cleanup();
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `${path.basename(cmd)} exited with ${code}`));
    });
  });
}

function runProcess(cmd, args, options = {}) {
  return runCapture(cmd, args, { ...options, discardOutput: true });
}

module.exports = { runProcess, runCapture, canSignalProcessGroup, signalChildTree };
