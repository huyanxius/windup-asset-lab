import test from 'node:test';
import assert from 'node:assert/strict';

import { createJobPoller } from '../asset-lab/core/job-poller.js';

function fakeTimers() {
  let nextId = 0;
  const tasks = new Map();
  const delays = [];
  return {
    delays,
    get size() { return tasks.size; },
    setTimeout(callback, delay) {
      nextId += 1;
      tasks.set(nextId, callback);
      delays.push(delay);
      return nextId;
    },
    clearTimeout(id) {
      tasks.delete(id);
    },
    async runNext() {
      const entry = tasks.entries().next().value;
      assert.ok(entry, 'expected a scheduled poll');
      const [id, callback] = entry;
      tasks.delete(id);
      await callback();
    },
  };
}

function temporaryError(message = 'temporary') {
  return Object.assign(new Error(message), { status: 503 });
}

test('job poller keeps the existing API and stops after a terminal snapshot', async () => {
  const timers = fakeTimers();
  const responses = [
    { id: 'abc', status: 'queued' },
    { id: 'abc', status: 'generating' },
    { id: 'abc', status: 'awaiting_review' },
  ];
  const api = { get: async () => responses.shift() };
  const updates = [];
  const poller = createJobPoller(api, {
    interval: 100,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  await poller.poll('abc', (job, error) => updates.push({ job, error }));
  assert.equal(timers.size, 1);
  await timers.runNext();
  assert.equal(timers.size, 1);
  await timers.runNext();

  assert.deepEqual(updates.map(({ job }) => job?.status), ['queued', 'generating', 'awaiting_review']);
  assert.equal(updates.every(({ error }) => error === null), true);
  assert.equal(timers.size, 0);
  assert.equal(poller.isActive('processing'), true);
  assert.equal(poller.isActive('approved'), false);
});

test('job poller retries transient errors with capped exponential backoff and resets after recovery', async () => {
  const timers = fakeTimers();
  const responses = [
    temporaryError('one'),
    temporaryError('two'),
    temporaryError('three'),
    { id: 'abc', status: 'generating' },
    { id: 'abc', status: 'approved' },
  ];
  const api = {
    get: async () => {
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
  };
  const updates = [];
  const poller = createJobPoller(api, {
    interval: 90,
    retryBase: 100,
    maxRetryDelay: 250,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  await poller.poll('abc', (job, error, reconnect) => updates.push({ job, error, reconnect }));
  await timers.runNext();
  await timers.runNext();
  await timers.runNext();
  await timers.runNext();

  assert.deepEqual(timers.delays, [100, 200, 250, 90]);
  assert.deepEqual(
    updates.slice(0, 3).map(({ reconnect }) => reconnect),
    [
      { reconnecting: true, attempt: 1, delay: 100 },
      { reconnecting: true, attempt: 2, delay: 200 },
      { reconnecting: true, attempt: 3, delay: 250 },
    ],
  );
  assert.deepEqual(updates.slice(3).map(({ job }) => job.status), ['generating', 'approved']);
  assert.equal(timers.size, 0);
});

test('job poller stop cancels scheduled work and ignores an in-flight stale response', async () => {
  const timers = fakeTimers();
  let resolveRequest;
  const api = {
    get: () => new Promise((resolve) => { resolveRequest = resolve; }),
  };
  const updates = [];
  const poller = createJobPoller(api, {
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  const pending = poller.poll('abc', (job, error) => updates.push({ job, error }));
  poller.stop();
  resolveRequest({ id: 'abc', status: 'generating' });
  await pending;

  assert.deepEqual(updates, []);
  assert.equal(timers.size, 0);
});

test('job poller does not retry non-transient client errors', async () => {
  const timers = fakeTimers();
  const error = Object.assign(new Error('bad request'), { status: 400 });
  const updates = [];
  const poller = createJobPoller(
    { get: async () => { throw error; } },
    { setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout },
  );

  await poller.poll('abc', (job, nextError, reconnect) => updates.push({ job, error: nextError, reconnect }));

  assert.equal(updates.length, 1);
  assert.equal(updates[0].error, error);
  assert.deepEqual(updates[0].reconnect, { reconnecting: false, attempt: 0, delay: 0 });
  assert.equal(timers.size, 0);
});
