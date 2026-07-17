import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PRODUCTION_SOURCE_OPTIONS } from '../asset-lab/features/production-sources.js';

const assetLab = new URL('../asset-lab/', import.meta.url);

test('every production source resolves to an API-backed generation surface', () => {
  assert.deepEqual(PRODUCTION_SOURCE_OPTIONS.map((source) => source.id), ['zero', 'upload', 'existing']);
  assert.deepEqual(
    PRODUCTION_SOURCE_OPTIONS.map((source) => source.href),
    ['./create-character.html?source=zero', './create-character.html?source=upload', './generate.html'],
  );
});

test('the product entry does not run a timed demo production controller', async () => {
  const app = await readFile(new URL('workflow-app.js', assetLab), 'utf8');
  assert.doesNotMatch(app, /DemoProductionController|demoProduction|scheduleNext|setTimeout/);
  assert.match(app, /api\.get\('\/api\/characters'\)/);
});
