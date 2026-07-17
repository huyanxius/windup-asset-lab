import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

test('architecture boundary checks accept the repository on the current platform', async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['tools/check-boundaries.mjs'],
    { cwd: new URL('..', import.meta.url), windowsHide: true },
  );

  assert.equal(stderr, '');
  assert.match(stdout, /Architecture boundaries OK/);
});
