import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiClient, resolveApiBase } from '../asset-lab/core/api-client.js';

test('local static runtime resolves to the Windup API service', () => {
  assert.equal(resolveApiBase({ hostname: 'localhost', port: '4173' }), 'http://127.0.0.1:4174');
  assert.equal(resolveApiBase({ hostname: '127.0.0.1', port: '4174' }), '');
});

test('asset URLs work for API paths and editor-relative catalogue paths', () => {
  const local = createApiClient('');
  const remote = createApiClient('http://127.0.0.1:4174');
  assert.equal(local.assetUrl('generation-data/characters/a/base.png'), '/generation-data/characters/a/base.png');
  assert.equal(local.assetUrl('../assets/a.png'), '../assets/a.png');
  assert.equal(remote.assetUrl('/generation-data/a.png'), 'http://127.0.0.1:4174/generation-data/a.png');
});
