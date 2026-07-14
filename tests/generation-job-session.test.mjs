import test from 'node:test';
import assert from 'node:assert/strict';

import { GenerationJobSession } from '../asset-lab/core/generation-job-session.js';

function snapshot(overrides = {}) {
  return {
    id: 'job-001',
    request: { character: 'hero', view: 'side', action: 'walk', mode: 'full' },
    status: 'queued',
    progress: 0,
    outputs: [],
    ...overrides,
  };
}

test('generation job session restores a server snapshot without retaining caller-owned references', () => {
  const source = snapshot({
    status: 'generating',
    progress: 35,
    outputs: [{ kind: 'frame', frameIndex: 0, path: 'normalized/walk-01.png' }],
  });
  const session = GenerationJobSession.fromSnapshot(source);

  source.request.action = 'idle';
  source.outputs[0].frameIndex = 7;

  assert.equal(session.jobId, 'job-001');
  assert.deepEqual(session.request, { character: 'hero', view: 'side', action: 'walk', mode: 'full' });
  assert.equal(session.status, 'generating');
  assert.equal(session.progress, 35);
  assert.equal(session.outputs[0].frameIndex, 0);
  assert.equal(session.active, true);
  assert.equal(session.terminal, false);
});

test('generation job session accepts forward snapshots and rejects state, progress and output rollback', () => {
  const session = GenerationJobSession.fromSnapshot(snapshot());
  session.applySnapshot(snapshot({
    status: 'generating',
    progress: 40,
    outputs: [{ kind: 'frame', frameIndex: 0, path: 'normalized/walk-01.png' }],
  }));
  session.applySnapshot(snapshot({
    status: 'awaiting_review',
    progress: 100,
    outputs: [
      { kind: 'frame', frameIndex: 0, path: 'normalized/walk-01.png' },
      { kind: 'frame', frameIndex: 1, path: 'normalized/walk-02.png' },
    ],
  }));

  assert.equal(session.status, 'awaiting_review');
  assert.equal(session.progress, 100);
  assert.equal(session.outputs.length, 2);
  assert.throws(
    () => session.applySnapshot(snapshot({ status: 'generating', progress: 100, outputs: session.outputs })),
    /非法任务状态回退/,
  );

  const progressing = GenerationJobSession.fromSnapshot(snapshot({ status: 'generating', progress: 40 }));
  assert.throws(
    () => progressing.applySnapshot(snapshot({ status: 'generating', progress: 20 })),
    /任务进度不能回退/,
  );

  const streaming = GenerationJobSession.fromSnapshot(snapshot({
    status: 'generating',
    progress: 40,
    outputs: [{ kind: 'frame', frameIndex: 0, path: 'normalized/walk-01.png' }],
  }));
  assert.throws(
    () => streaming.applySnapshot(snapshot({ status: 'generating', progress: 50, outputs: [] })),
    /任务输出不能回退/,
  );
});

test('generation job session owns reconnect state and clears it after recovery', () => {
  const session = GenerationJobSession.fromSnapshot(snapshot({ status: 'generating', progress: 20 }));
  session.markReconnect(new Error('temporary outage'), { attempt: 2, delay: 1800 });

  assert.deepEqual(session.reconnect, {
    active: true,
    attempt: 2,
    delay: 1800,
    error: 'temporary outage',
  });
  assert.equal(session.error, null);

  session.applySnapshot(snapshot({ status: 'generating', progress: 30 }));
  assert.deepEqual(session.reconnect, {
    active: false,
    attempt: 0,
    delay: 0,
    error: null,
  });
});

test('generation job session records terminal failure and refuses a different job identity', () => {
  const session = GenerationJobSession.fromSnapshot(snapshot({ status: 'generating', progress: 60 }));
  session.applySnapshot(snapshot({ status: 'failed', progress: 60, error: 'provider quota exceeded' }));

  assert.equal(session.error, 'provider quota exceeded');
  assert.equal(session.active, false);
  assert.equal(session.terminal, true);
  assert.throws(
    () => session.applySnapshot(snapshot({ id: 'job-002', status: 'queued' })),
    /任务标识不一致/,
  );
});
