'use strict';
const fs = require('node:fs');

// kill(pid, 0) also succeeds for an unreaped zombie in a container.
function processAlive(pid, options = {}) {
  const kill = options.kill || process.kill;
  const readFile = options.readFile || fs.readFileSync;
  const platform = options.platform || process.platform;
  try { kill(pid, 0); }
  catch (error) { return error.code === 'EPERM'; }
  if (platform === 'linux') {
    try {
      const status = readFile(`/proc/${pid}/status`, 'utf8');
      if (/^State:\s+[ZX]\b/m.test(status)) return false;
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ESRCH') return false;
      // Unreadable state is not proof that a process has stopped.
    }
  }
  return true;
}

module.exports = { processAlive };
