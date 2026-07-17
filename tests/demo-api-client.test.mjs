import test from 'node:test';
import assert from 'node:assert/strict';

import { createDemoApiClient } from '../asset-lab/core/demo-api-client.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

async function finish(api, jobId) {
  let job;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    job = await api.get(`/api/generations/${jobId}`);
    if (job.status === 'awaiting_review') return job;
  }
  throw new Error(`demo job ${jobId} did not finish`);
}

test('demo API completes character creation, promotion, and persistent library reload without fetch', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network access is forbidden in demo mode'); };
  try {
    const storage = memoryStorage();
    const api = createDemoApiClient({ storage });
    const initial = await api.get('/api/characters');
    assert.ok(initial.characters.some((character) => character.id === 'boy'));

    const created = await api.post('/api/characters/generations', {
      name: 'Demo Hero',
      description: 'A complete demo character description for the offline fixture workflow.',
      style: 'demo pixel art',
      palette: 'blue and gold',
      starterActions: ['idle', 'walk'],
    });
    const ready = await finish(api, created.id);
    assert.equal(ready.outputs.length, 17);

    const approved = await api.post(`/api/generations/${created.id}/promote`, {});
    assert.equal(approved.status, 'approved');
    assert.equal(approved.character.label, 'Demo Hero');

    const restored = createDemoApiClient({ storage });
    const library = await restored.get('/api/characters');
    assert.ok(library.characters.some((character) => character.id === approved.character.id));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('demo API falls back to memory when browser storage is unavailable', async () => {
  const unavailable = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const api = createDemoApiClient({ storage: unavailable });
  const health = await api.get('/api/health');
  const library = await api.get('/api/characters');

  assert.equal(health.demo, true);
  assert.equal(health.fallback, true);
  assert.equal(api.mode, 'memory-fallback');
  assert.ok(library.characters.length >= 1);
});

test('demo API supports action jobs and versioned review state', async () => {
  const api = createDemoApiClient({ storage: memoryStorage() });
  const created = await api.post('/api/generations', {
    character: 'boy',
    view: 'side',
    action: 'walk',
    mode: 'full',
    frameIndex: 0,
  });
  const ready = await finish(api, created.id);
  assert.equal(ready.outputs.length, 8);
  assert.equal((await api.post(`/api/generations/${created.id}/promote`, {})).status, 'approved');

  const review = await api.get('/api/reviews?key=boy%3Aside%3Awalk&length=2&defaults=pending%2Creject');
  const saved = await api.post('/api/reviews', {
    key: review.key,
    expectedVersion: review.version,
    reviews: ['pass', 'reject'],
  });
  assert.equal(saved.version, review.version + 1);
  assert.deepEqual(saved.reviews, ['pass', 'reject']);
});
