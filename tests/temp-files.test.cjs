'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const lib = path.resolve(__dirname, '../lib.sh');

test('temporary media paths keep their suffixes, remain distinct, and are cleaned up', { skip: process.platform === 'win32' }, () => {
  const output = execFileSync('bash', ['-c', `
source "$1"
printf '%s\\n' "$MM_TEMP_ROOT"
download=$(make_temp_name --ext mp4)
[[ ! -e "$download" ]]
prepared=$(make_temp_file --ext mp4)
[[ -f "$prepared" && "$download" != "$prepared" ]]
printf 'downloaded media' > "$download"
printf 'prepared media' > "$prepared"
[[ "$(cat "$download")" == 'downloaded media' ]]
printf '%s\\n' "$download" "$prepared"
for index in {1..10}; do
  file=$(make_temp_file --ext .mp4)
  directory=$(make_temp_dir --ext frames)
  name=$(make_temp_name --ext mp4)
  [[ -f "$file" && -d "$directory" && ! -e "$name" ]]
  printf '%s\\n' "$file" "$directory" "$name"
done
plain=$(make_temp_file)
[[ -f "$plain" ]]
printf '%s\\n' "$plain"
`, '--', lib], { encoding: 'utf8' });
  const [root, ...paths] = output.trim().split('\n');
  assert.equal(paths.length, 33);
  assert.equal(new Set(paths).size, paths.length);
  for (const filename of paths) assert.ok(filename.startsWith(root + path.sep));
  assert.ok(paths.slice(0, -1).every(filename => /\.(mp4|frames)$/.test(filename)));
  assert.equal(fs.existsSync(root), false, 'exit cleanup removes every artifact, including names reserved in subshells');
});
