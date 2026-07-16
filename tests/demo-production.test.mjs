import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEMO_CHARACTER_ASSETS,
  DEMO_PRODUCTION_STEPS,
  DEMO_SOURCE_OPTIONS,
  DemoProductionController,
} from '../asset-lab/features/demo-production.js';
import { DEFAULT_DEMO_ASSET_VERSION } from '../asset-lab/data/default-demo-character.js';

test('default boy demo exposes complete idle and walk sequences', () => {
  assert.equal(DEMO_CHARACTER_ASSETS.idleFrames.length, 8);
  assert.equal(DEMO_CHARACTER_ASSETS.walkFrames.length, 8);
  assert.equal(DEMO_CHARACTER_ASSETS.frames, DEMO_CHARACTER_ASSETS.walkFrames);
  assert.ok(DEMO_CHARACTER_ASSETS.idleFrames[0].endsWith(`idle-01.png?v=${DEFAULT_DEMO_ASSET_VERSION}`));
  assert.ok(DEMO_CHARACTER_ASSETS.walkFrames[7].endsWith(`walk-08.png?v=${DEFAULT_DEMO_ASSET_VERSION}`));
});

test('one click advances the demo through the complete production chain', () => {
  const scheduled = [];
  const snapshots = [];
  const controller = new DemoProductionController({
    onChange: (snapshot) => snapshots.push(snapshot),
    schedule: (callback) => scheduled.push(callback),
  });

  controller.selectSource('zero');
  controller.configure({ name: 'Demo Hero', role: 'platformer courier' });
  controller.start();
  while (scheduled.length) scheduled.shift()();

  const result = controller.snapshot();
  assert.equal(result.status, 'completed');
  assert.equal(result.progress, 100);
  assert.equal(result.profile.name, 'Demo Hero');
  assert.equal(result.stepIndex, DEMO_PRODUCTION_STEPS.length - 1);
  assert.deepEqual(DEMO_PRODUCTION_STEPS.map((step) => step.id), [
    'identity', 'master', 'action', 'slice', 'quality', 'promote', 'package',
  ]);
  assert.ok(snapshots.some((snapshot) => snapshot.activeStep.id === 'quality'));
  assert.ok(snapshots.some((snapshot) => snapshot.activeStep.id === 'promote'));
});

test('every shared production stage keeps a visible two-to-three second loading state', () => {
  for (const step of DEMO_PRODUCTION_STEPS) {
    assert.ok(step.duration >= 2000, `${step.id} should remain visible for at least two seconds`);
    assert.ok(step.duration <= 3000, `${step.id} should finish within three seconds`);
  }
});

test('reconfiguring a completed demo creates a fresh draft without stale progress', () => {
  const controller = new DemoProductionController({ schedule: () => {} });
  controller.selectSource('upload');
  controller.start();
  controller.configure({ name: 'Second Hero', description: 'new identity' });
  const result = controller.snapshot();
  assert.equal(result.status, 'draft');
  assert.equal(result.stepIndex, -1);
  assert.equal(result.progress, 0);
  assert.equal(result.profile.name, 'Second Hero');
  assert.equal(result.sourceId, 'upload');
});

test('the canonical creation flow keeps the three required source choices', () => {
  assert.deepEqual(DEMO_SOURCE_OPTIONS.map((source) => source.id), ['zero', 'upload', 'existing']);
  const controller = new DemoProductionController({ schedule: () => {} });
  assert.equal(controller.start().status, 'draft');
  assert.equal(controller.snapshot().stepIndex, -1);
  controller.selectSource('existing');
  assert.equal(controller.snapshot().source.label, '复用资产库');
});
