import test from 'node:test';
import assert from 'node:assert/strict';

import { focusTransform } from '../asset-lab/features/guided-canvas.js';

test('guided canvas centers the active production node at the requested scale', () => {
  const transform = focusTransform({
    nodeHeight: 300,
    nodeWidth: 400,
    nodeX: 800,
    nodeY: 180,
    scale: 0.8,
    viewportHeight: 760,
    viewportWidth: 1200,
  });

  assert.equal(transform.x, -200);
  assert.equal(transform.y, 116);
});
