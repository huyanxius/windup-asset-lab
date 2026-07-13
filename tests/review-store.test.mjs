import test from 'node:test';
import assert from 'node:assert/strict';

import { ReviewStore } from '../asset-lab/core/review-store.js';

function memoryStorage() {
  const records = new Map();
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
}

test('review decisions persist without leaking into another asset', () => {
  const storage = memoryStorage();
  const asset = { frames: ['1.png', '2.png'], initial: 'pending', rejected: [1] };
  const store = new ReviewStore(storage);
  assert.deepEqual(store.list('hero:side:walk', asset), ['pending', 'reject']);
  store.set('hero:side:walk', asset, 0, 'pass');

  const restored = new ReviewStore(storage);
  assert.deepEqual(restored.list('hero:side:walk', asset), ['pass', 'reject']);
  assert.deepEqual(restored.list('hero:side:idle', asset), ['pending', 'reject']);
});

test('review store rejects invalid state values', () => {
  const store = new ReviewStore(memoryStorage());
  const asset = { frames: ['1.png'], initial: 'pending' };
  assert.throws(() => store.set('hero:side:walk', asset, 0, 'broken'), /未知审核状态/);
});

test('review store hydrates and flushes versioned server decisions', async () => {
  const storage = memoryStorage();
  let server = { key: 'hero:side:walk', version: 3, reviews: ['pending', 'reject'] };
  const api = {
    get: async () => structuredClone(server),
    post: async (_path, body) => {
      assert.equal(body.expectedVersion, server.version);
      server = { key: body.key, version: server.version + 1, reviews: body.reviews };
      return structuredClone(server);
    },
  };
  const asset = { frames: ['1.png', '2.png'], initial: 'pending' };
  const store = new ReviewStore(storage, 'reviews', api);
  await store.hydrate('hero:side:walk', asset);
  store.set('hero:side:walk', asset, 0, 'pass');
  await store.flush('hero:side:walk');
  assert.deepEqual(server.reviews, ['pass', 'reject']);
  assert.equal(server.version, 4);
});
