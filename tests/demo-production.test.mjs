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

test('production pauses after every generated result until the user confirms it', () => {
  const scheduled = [];
  const controller = new DemoProductionController({
    schedule: (callback, delay) => scheduled.push({ callback, delay }),
  });

  controller.selectSource('zero');
  controller.configure({ name: 'Workbench Hero', role: 'platformer courier' });
  controller.startMaster();
  assert.equal(controller.snapshot().master, 'generating');
  scheduled.shift().callback();
  assert.equal(controller.snapshot().master, 'review');
  controller.selectMasterCandidate('boy');
  controller.confirmMaster();
  assert.equal(controller.snapshot().actions.walk.keyframe, 'ready');
  assert.equal(scheduled.length, 0);

  for (const action of ['walk', 'idle']) {
    controller.generateKeyframe(action, { brief: `${action} motion brief` });
    scheduled.shift().callback();
    assert.equal(controller.snapshot().actions[action].keyframe, 'review');
    assert.equal(controller.snapshot().actions[action].animation, 'locked');
    controller.confirmKeyframe(action);
    assert.equal(controller.snapshot().actions[action].animation, 'ready');
    controller.generateAnimation(action, { fps: 8 });
    scheduled.shift().callback();
    assert.equal(controller.snapshot().actions[action].animation, 'review');
    controller.confirmAnimation(action);
  }

  controller.publish();
  assert.equal(controller.snapshot().completed, false);
  scheduled.shift().callback();

  const result = controller.snapshot();
  assert.equal(result.status, 'completed');
  assert.equal(result.profile.name, 'Workbench Hero');
  assert.equal(result.actions.walk.animation, 'confirmed');
  assert.equal(result.actions.idle.animation, 'confirmed');
});

test('walk and idle can generate concurrently without cancelling each other', () => {
  const scheduled = [];
  const controller = new DemoProductionController({ schedule: (callback) => scheduled.push(callback) });
  controller.selectSource('zero');
  controller.startMaster();
  scheduled.shift()();
  controller.selectMasterCandidate('boy');
  controller.confirmMaster();

  controller.generateKeyframe('walk', { brief: 'quick forward walk' });
  controller.generateKeyframe('idle', { brief: 'quiet breathing idle' });
  assert.equal(controller.snapshot().jobs.length, 2);
  assert.equal(controller.snapshot().actions.walk.keyframe, 'generating');
  assert.equal(controller.snapshot().actions.idle.keyframe, 'generating');

  scheduled.shift()();
  assert.equal(controller.snapshot().actions.walk.keyframe, 'review');
  assert.equal(controller.snapshot().actions.idle.keyframe, 'generating');
  scheduled.shift()();
  assert.equal(controller.snapshot().actions.idle.keyframe, 'review');
  assert.equal(controller.snapshot().jobs.length, 0);
});

test('confirmation commands cannot skip an unfinished stage', () => {
  const controller = new DemoProductionController({ schedule: () => {} });
  controller.selectSource('zero');
  assert.equal(controller.confirmMaster().master, 'idle');
  assert.equal(controller.generateKeyframe('walk').actions.walk.keyframe, 'locked');
  assert.equal(controller.generateAnimation('walk').actions.walk.animation, 'locked');
  assert.equal(controller.publish().completed, false);
});

test('generation timing is long enough to feel credible', () => {
  assert.deepEqual(DEMO_PRODUCTION_STEPS.map(({ id, duration }) => [id, duration]), [
    ['master', 9000],
    ['keyframe', 7000],
    ['animation', 15000],
    ['publish', 2500],
  ]);
});

test('the canonical creation flow keeps the three required source choices', () => {
  assert.deepEqual(DEMO_SOURCE_OPTIONS.map((source) => source.id), ['zero', 'upload', 'existing']);
  const controller = new DemoProductionController({ schedule: () => {} });
  assert.equal(controller.startMaster().master, 'idle');
  controller.selectSource('existing');
  assert.equal(controller.snapshot().source.label, '复用资产库');
});

test('reset clears a previously selected source and reusable workflow', () => {
  const controller = new DemoProductionController({ schedule: () => {} });
  controller.applyWorkflowTemplate({
    id: 'abc123def456',
    name: 'Side starter',
    pipeline: { source: 'zero', fps: 8, briefs: {} },
    execution: { mode: 'automatic' },
  });
  const result = controller.reset({ notify: false });
  assert.equal(result.source, null);
  assert.equal(result.workflow, null);
  assert.equal(result.profile.name, '阿岚');
});

test('an approved workflow template can run the full visual pipeline automatically', () => {
  const scheduled = [];
  const controller = new DemoProductionController({ schedule: (callback) => scheduled.push(callback) });
  controller.applyWorkflowTemplate({
    id: 'abc123def456',
    name: 'Side starter',
    pipeline: { source: 'zero', fps: 8, briefs: { walk: 'measured walk', idle: 'quiet breathing' } },
    execution: { mode: 'automatic' },
  });
  controller.configure({ name: 'Reusable Hero', description: 'A readable side-view character.' });
  controller.startWorkflowRun();

  while (scheduled.length) scheduled.shift()();

  const result = controller.snapshot();
  assert.equal(result.completed, false);
  assert.equal(result.workflow.status, 'awaiting_review');
  assert.equal(result.actions.walk.animation, 'confirmed');
  assert.equal(result.actions.idle.animation, 'confirmed');
  controller.publish();
  scheduled.shift()();
  assert.equal(controller.snapshot().workflow.status, 'completed');
});
