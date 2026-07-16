import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCROLL_BIRD_FRAME_COUNT,
  scrollBirdPose,
} from '../asset-lab/features/scroll-bird.js';

test('scroll bird exposes a complete twenty-frame wing cycle', () => {
  const poses = Array.from(
    { length: SCROLL_BIRD_FRAME_COUNT },
    (_, frameIndex) => scrollBirdPose(frameIndex),
  );

  assert.equal(poses.length, 20);
  assert.ok(Math.min(...poses.map((pose) => pose.wingAngle)) < -0.6);
  assert.ok(Math.max(...poses.map((pose) => pose.wingAngle)) > 0.6);
  assert.equal(new Set(poses.map((pose) => pose.wingAngle.toFixed(4))).size, 11);
});

test('each flap moves the whole bird while head and tail counterbalance it', () => {
  const poses = Array.from(
    { length: SCROLL_BIRD_FRAME_COUNT },
    (_, frameIndex) => scrollBirdPose(frameIndex),
  );

  assert.ok(Math.max(...poses.map((pose) => pose.bodyLift)) > 0.01);
  assert.ok(Math.min(...poses.map((pose) => pose.bodyLift)) < -0.01);
  assert.ok(Math.max(...poses.map((pose) => pose.bodyPitch)) > 0.03);
  assert.ok(Math.min(...poses.map((pose) => pose.bodyPitch)) < -0.03);
  assert.ok(poses.some((pose) => Math.sign(pose.headCounterPitch) !== Math.sign(pose.bodyPitch)));
  assert.ok(poses.some((pose) => Math.abs(pose.tailAngle) > 0.07));
});

test('the first and twenty-first frame share the same loop pose', () => {
  assert.deepEqual(scrollBirdPose(0), scrollBirdPose(SCROLL_BIRD_FRAME_COUNT));
});
