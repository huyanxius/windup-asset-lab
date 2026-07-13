import test from 'node:test';
import assert from 'node:assert/strict';

import { EditorSession } from '../asset-lab/core/editor-session.js';

function asset(key, count = 2) {
  return { key, frames: Array.from({ length: count }, (_, index) => `${key}-${index}.png`) };
}

const catalog = {
  hero: {
    label: 'Hero',
    library: {
      side: { label: 'Side', truth: 'Side', idle: asset('idle'), walk: asset('walk') },
      topdown: { label: 'Top', truth: 'Top', walk: asset('walk-top') },
    },
  },
  guest: {
    label: 'Guest',
    library: {
      side: { label: 'Side', truth: 'Side', walk: asset('guest-walk') },
      topdown: { label: 'Top', truth: 'Top' },
    },
  },
};

test('session owns character, view, action and bounded frame transitions', () => {
  const session = new EditorSession(catalog, { characterId: 'hero', action: 'idle' });
  assert.equal(session.asset.key, 'idle');
  session.selectFrame(99);
  assert.equal(session.frame, 1);
  session.stepFrame(1);
  assert.equal(session.frame, 0);
  session.selectView('topdown');
  assert.equal(session.action, 'walk');
  assert.equal(session.reviewKey, 'hero:topdown:walk');
});

test('frame offsets and anchors are isolated per asset identity', () => {
  const session = new EditorSession(catalog, { characterId: 'hero', action: 'walk' });
  session.nudgeFrame(2, -1);
  session.setAnchor(130, 236);
  session.selectAction('idle');
  assert.deepEqual(session.frameOffset(), { x: 0, y: 0 });
  assert.deepEqual(session.anchor, { x: 128, y: 238 });
  session.selectAction('walk');
  assert.deepEqual(session.frameOffset(), { x: 2, y: -1 });
  assert.deepEqual(session.anchor, { x: 130, y: 236 });
});

test('switching character selects a real action instead of preserving a missing one', () => {
  const session = new EditorSession(catalog, { characterId: 'hero', action: 'idle' });
  session.selectCharacter('guest');
  assert.equal(session.characterId, 'guest');
  assert.equal(session.action, 'walk');
  assert.equal(session.frame, 0);
});
