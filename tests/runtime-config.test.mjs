import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeConfig } from '../asset-lab/core/runtime-config.js';

test('runtime endpoints are configurable without source edits', () => {
  const config = resolveRuntimeConfig(
    { hostname: 'studio.example.com', port: '', origin: 'https://studio.example.com' },
    { apiBase: 'https://api.example.com/', gameOrigin: 'https://game.example.com/', gamePath: '/build/' },
  );
  assert.equal(config.apiBase, 'https://api.example.com');
  assert.equal(config.gameOrigin, 'https://game.example.com');
  assert.equal(config.gameUrl, 'https://game.example.com/build/');
});

test('backend-hosted asset lab uses the current origin on a custom local port', () => {
  const config = resolveRuntimeConfig({
    hostname: '127.0.0.1',
    port: '4274',
    origin: 'http://127.0.0.1:4274',
    pathname: '/asset-lab/',
  });

  assert.equal(config.apiBase, '');
});
