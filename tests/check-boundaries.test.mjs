import test from 'node:test';
import assert from 'node:assert/strict';
import { join, win32 } from 'node:path';

import {
  findFrontendBoundaryViolations,
  relativePosix,
  toPosixPath,
} from '../tools/check-boundaries.mjs';

test('normalizes Windows path.relative output to POSIX separators', () => {
  assert.equal(toPosixPath(String.raw`asset-lab\core\api-client.js`), 'asset-lab/core/api-client.js');
  assert.equal(
    toPosixPath(win32.relative(String.raw`C:\repo`, String.raw`C:\repo\asset-lab\core\api-client.js`)),
    'asset-lab/core/api-client.js',
  );
  assert.equal(
    relativePosix('repo', join('repo', 'asset-lab', 'core', 'api-client.js')),
    'asset-lab/core/api-client.js',
  );
});

test('enforces core and feature dependency direction with Windows-style paths', () => {
  assert.deepEqual(
    findFrontendBoundaryViolations(
      String.raw`core\editor-session.js`,
      String.raw`import { controller } from '..\features\drawer-controller.js';`,
    ),
    ['core may not depend on pages or features'],
  );
  assert.deepEqual(
    findFrontendBoundaryViolations(
      String.raw`features\drawer-controller.js`,
      String.raw`import { render } from '..\pages\editor-view.js';`,
    ),
    ['features may not depend on pages'],
  );
});

test('recognizes owner allowlists with Windows-style paths', () => {
  assert.deepEqual(
    findFrontendBoundaryViolations(String.raw`core\api-client.js`, 'return fetch(request);'),
    [],
  );
  assert.deepEqual(
    findFrontendBoundaryViolations(String.raw`core\playback-clock.js`, 'this.timer = setInterval(tick, 125);'),
    [],
  );
  assert.deepEqual(
    findFrontendBoundaryViolations(String.raw`core\runtime-config.js`, "const origin = 'http://127.0.0.1:5174';"),
    [],
  );

  assert.deepEqual(
    findFrontendBoundaryViolations(String.raw`pages\editor.js`, "fetch('/api'); setInterval(tick, 125); const origin = 'http://127.0.0.1:5173';"),
    [
      'HTTP calls must go through core/api-client.js',
      'animation intervals must be owned by PlaybackClock',
      'runtime origins must be resolved by core/runtime-config.js',
    ],
  );
});
