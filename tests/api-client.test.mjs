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

test('reference uploads keep binary content and session credentials', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ id: 'ref-123456789abc' }) };
  };
  try {
    const file = new Blob(['png'], { type: 'image/png' });
    Object.defineProperty(file, 'name', { value: 'hero.png' });
    const api = createApiClient('http://127.0.0.1:4174');
    await api.upload('/api/projects/windup-demo/references', file);
    assert.equal(calls[0].url, 'http://127.0.0.1:4174/api/projects/windup-demo/references');
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[0].options.body, file);
    assert.equal(calls[0].options.headers['Content-Type'], 'image/png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
