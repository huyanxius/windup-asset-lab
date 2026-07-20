import test from 'node:test';
import assert from 'node:assert/strict';

import { calculatePointerCardMotion } from '../asset-lab/features/pointer-card-motion.js';

test('pointer card motion stays centered at the card midpoint', () => {
  const motion = calculatePointerCardMotion(
    { left: 100, top: 40, width: 400, height: 200 },
    300,
    140,
  );

  assert.deepEqual(motion, {
    glowX: 50,
    glowY: 50,
    rotateX: 0,
    rotateY: 0,
  });
});

test('pointer card motion tilts toward the pointer and clamps outside coordinates', () => {
  const topLeft = calculatePointerCardMotion(
    { left: 100, top: 40, width: 400, height: 200 },
    -20,
    -10,
    3,
  );
  const bottomRight = calculatePointerCardMotion(
    { left: 100, top: 40, width: 400, height: 200 },
    900,
    500,
    3,
  );

  assert.deepEqual(topLeft, {
    glowX: 0,
    glowY: 0,
    rotateX: 3,
    rotateY: -3,
  });
  assert.deepEqual(bottomRight, {
    glowX: 100,
    glowY: 100,
    rotateX: -3,
    rotateY: 3,
  });
});
