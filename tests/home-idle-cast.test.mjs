import test from 'node:test';
import assert from 'node:assert/strict';

import { startHomeIdleCast } from '../asset-lab/features/home-idle-cast.js';

test('home idle characters start in a staggered order', () => {
  const scheduled = [];
  const cancelled = [];
  const nodes = ['reaper.gif', 'schoolgirl.gif', 'boy.gif'].map((idleSrc) => ({
    classList: { add: () => {} },
    dataset: { idleSrc },
    src: '',
  }));
  const stop = startHomeIdleCast(nodes, {
    cancel: (timer) => cancelled.push(timer),
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay });
      return delay;
    },
  });

  assert.deepEqual(scheduled.map(({ delay }) => delay), [0, 180, 360]);
  scheduled.forEach(({ callback }) => callback());
  assert.deepEqual(nodes.map(({ src }) => src), ['reaper.gif', 'schoolgirl.gif', 'boy.gif']);
  stop();
  assert.deepEqual(cancelled, [0, 180, 360]);
});
