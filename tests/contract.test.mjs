import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import {
  CONTRACT_VERSION,
  FIXED_FPS,
  actionLabels,
  actionLoops,
  actionOrder,
  viewLabels,
  generationDefaults,
} from '../asset-lab/data/generated-contract.js';

const execFileAsync = promisify(execFile);

test('generated frontend contract exactly follows the versioned source', async () => {
  const source = JSON.parse(await readFile(new URL('../contracts/windup.v1.json', import.meta.url), 'utf8'));
  assert.equal(CONTRACT_VERSION, source.version);
  assert.equal(FIXED_FPS, source.fps);
  assert.deepEqual(actionOrder, Object.keys(source.actions));
  assert.deepEqual(actionLoops, Object.fromEntries(actionOrder.map((key) => [key, source.actions[key].loop])));
  assert.deepEqual(actionLabels, Object.fromEntries(actionOrder.map((key) => [key, [source.actions[key].label, source.actions[key].type]])));
  assert.deepEqual(viewLabels, Object.fromEntries(Object.entries(source.views).map(([key, value]) => [key, [value.label, value.truth]])));
  assert.deepEqual(generationDefaults, source.generation);
  assert.equal(generationDefaults.defaultRoute, 'sheet');
  assert.deepEqual(generationDefaults.starterPack.actions, ['idle', 'walk']);
});

test('generated contract check accepts the current platform line endings', async () => {
  const { stderr } = await execFileAsync(
    process.execPath,
    ['tools/generate-contract.mjs', '--check'],
    { cwd: new URL('..', import.meta.url), windowsHide: true },
  );

  assert.equal(stderr, '');
});
