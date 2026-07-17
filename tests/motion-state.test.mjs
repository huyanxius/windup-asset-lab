import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnimationState,
  LocomotionState,
  advanceMotion,
  createMotionState,
  reduceMotion,
} from '../asset-lab/core/motion-state.js';

test('character click starts, pauses and resumes without resetting position', () => {
  let state = createMotionState({ x: 48 });
  state = reduceMotion(state, { type: 'CHARACTER_TOGGLE' });
  assert.equal(state.animation, AnimationState.PLAYING);
  assert.equal(state.locomotion, LocomotionState.AUTO);
  assert.equal(state.x, 48);

  state = reduceMotion(state, { type: 'CHARACTER_TOGGLE' });
  assert.equal(state.animation, AnimationState.PAUSED);
  assert.equal(state.locomotion, LocomotionState.IDLE);
  assert.equal(state.x, 48);

  state = reduceMotion(state, { type: 'CHARACTER_TOGGLE' });
  assert.equal(state.animation, AnimationState.PLAYING);
  assert.equal(state.locomotion, LocomotionState.AUTO);
  assert.equal(state.x, 48);
});

test('manual input has one deterministic start and stop path', () => {
  let state = reduceMotion(createMotionState(), { type: 'MANUAL_INPUT', direction: 'left', pressed: true });
  assert.equal(state.locomotion, LocomotionState.MANUAL);
  assert.equal(state.direction, -1);
  state = reduceMotion(state, { type: 'MANUAL_INPUT', direction: 'left', pressed: false });
  assert.equal(state.locomotion, LocomotionState.IDLE);
});

test('keyboard repeat keeps manual input state stable instead of restarting playback', () => {
  const held = reduceMotion(createMotionState(), { type: 'MANUAL_INPUT', direction: 'right', pressed: true });
  const repeated = reduceMotion(held, { type: 'MANUAL_INPUT', direction: 'right', pressed: true });
  assert.equal(repeated, held);

  const released = reduceMotion(held, { type: 'MANUAL_INPUT', direction: 'right', pressed: false });
  const repeatedRelease = reduceMotion(released, { type: 'MANUAL_INPUT', direction: 'right', pressed: false });
  assert.equal(repeatedRelease, released);
});

test('movement stays inside the stage and turns around at the edge', () => {
  const state = createMotionState({ animation: AnimationState.PLAYING, locomotion: LocomotionState.AUTO, x: 99, direction: 1 });
  const next = advanceMotion(state, 0.1, 100);
  assert.equal(next.x, 100);
  assert.equal(next.direction, -1);
});
