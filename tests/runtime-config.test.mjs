import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveRuntimeConfig } from '../asset-lab/core/runtime-config.js';

test('game runtime remains configurable without a network API endpoint', () => {
  const config = resolveRuntimeConfig(
    { hostname: 'studio.example.com', port: '', origin: 'https://studio.example.com' },
    { gameOrigin: 'https://game.example.com/', gamePath: '/build/' },
  );
  assert.equal('apiBase' in config, false);
  assert.equal(config.gameOrigin, 'https://game.example.com');
  assert.equal(config.gameUrl, 'https://game.example.com/build/');
});

test('local runtime does not expose a configurable generation API base', () => {
  const config = resolveRuntimeConfig({
    hostname: '127.0.0.1',
    port: '4274',
    origin: 'http://127.0.0.1:4274',
    pathname: '/asset-lab/',
  });

  assert.equal('apiBase' in config, false);
});
