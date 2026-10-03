'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { processAlive } = require('./process-state.cjs');

const error = code => Object.assign(new Error(code), { code });
const linux = { platform: 'linux', kill() {} };
test('Linux live and zombie states differ despite successful kill zero', () => {
  for (const state of ['R', 'S', 'D']) {
    assert.equal(processAlive(123, { ...linux, readFile: () => `Name:\tfixture\nState:\t${state} (live)\n` }), true);
  }
  for (const state of ['Z', 'X']) {
    assert.equal(processAlive(123, { ...linux, readFile: () => `Name:\tfixture\nState:\t${state} (dead)\n` }), false);
  }
});
test('missing PID and a process that exits during inspection are stopped', () => {
  assert.equal(processAlive(123, { ...linux, kill() { throw error('ESRCH'); } }), false);
  assert.equal(processAlive(123, { ...linux, readFile() { throw error('ENOENT'); } }), false);
});
test('permission failures cannot count as proof of termination', () => {
  assert.equal(processAlive(123, { ...linux, kill() { throw error('EPERM'); } }), true);
  assert.equal(processAlive(123, { ...linux, readFile() { throw error('EACCES'); } }), true);
});
test('non-Linux platforms do not require procfs', () => {
  assert.equal(processAlive(123, { ...linux, platform: 'darwin', readFile() { throw Error('unexpected procfs read'); } }), true);
});
test('a real child is live until terminated and reaped', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
  try {
    await once(child, 'spawn');
    assert.equal(processAlive(child.pid), true);
    const closed = once(child, 'close');
    child.kill('SIGTERM');
    await closed;
    assert.equal(processAlive(child.pid), false);
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
});
