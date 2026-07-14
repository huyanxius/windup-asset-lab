import test from 'node:test';
import assert from 'node:assert/strict';

import { PlaybackClock } from '../asset-lab/core/playback-clock.js';

test('playback clock has one timer owner and replaces previous playback', () => {
  const callbacks = new Map();
  let nextId = 0;
  const timers = {
    setInterval(callback, delay) {
      nextId += 1;
      callbacks.set(nextId, { callback, delay });
      return nextId;
    },
    clearInterval(id) { callbacks.delete(id); },
  };
  const clock = new PlaybackClock(8, timers);
  let ticks = 0;
  clock.start(() => { ticks += 1; });
  const firstId = nextId;
  assert.equal(callbacks.get(firstId).delay, 125);
  clock.start(() => { ticks += 10; });
  assert.equal(callbacks.has(firstId), false);
  callbacks.get(nextId).callback();
  assert.equal(ticks, 10);
  clock.stop();
  assert.equal(clock.running, false);
  assert.equal(callbacks.size, 0);
});
