import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { characterCatalog } from '../asset-lab/data/character-catalog.js';
import {
  DEFAULT_DEMO_ASSET_VERSION,
  DEFAULT_DEMO_CHARACTER_ASSETS,
  DEFAULT_DEMO_CHARACTER_ID,
} from '../asset-lab/data/default-demo-character.js';
import { EditorSession } from '../asset-lab/core/editor-session.js';

function repositoryFile(assetUrl) {
  const [path] = assetUrl.split('?');
  return new URL(path.replace(/^\.\.\//, '../'), import.meta.url);
}

function pngHeader(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
  };
}

test('default boy ships complete transparent idle and walk actions', async () => {
  const { idle, walk } = characterCatalog.boy.library.side;
  assert.equal(idle.frames.length, 8);
  assert.equal(walk.frames.length, 8);
  assert.equal(idle.fps, 8);
  assert.equal(walk.fps, 8);
  assert.equal(DEFAULT_DEMO_CHARACTER_ID, 'boy');
  assert.equal(characterCatalog.boy.base, DEFAULT_DEMO_CHARACTER_ASSETS.base);
  assert.ok(characterCatalog.boy.base.endsWith(`?v=${DEFAULT_DEMO_ASSET_VERSION}`));
  assert.deepEqual(idle.frames, DEFAULT_DEMO_CHARACTER_ASSETS.idleFrames);
  assert.deepEqual(walk.frames, DEFAULT_DEMO_CHARACTER_ASSETS.walkFrames);

  const files = [characterCatalog.boy.base, ...idle.frames, ...walk.frames];
  const headers = await Promise.all(files.map(async (assetUrl) => (
    pngHeader(await readFile(repositoryFile(assetUrl)))
  )));
  headers.forEach((header) => {
    assert.deepEqual(header, { width: 256, height: 256, colorType: 6 });
  });
});

test('the action review defaults to the same demo boy instead of the legacy character', () => {
  const session = new EditorSession(characterCatalog);
  assert.equal(session.characterId, DEFAULT_DEMO_CHARACTER_ID);
  assert.equal(session.character, characterCatalog.boy);
  assert.equal(session.asset, characterCatalog.boy.library.side.idle);
});
