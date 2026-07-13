import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { EDITOR_ELEMENT_IDS } from '../asset-lab/pages/editor-elements.js';

test('editor HTML satisfies the declared DOM contract', async () => {
  const html = await readFile(new URL('../asset-lab/index.html', import.meta.url), 'utf8');
  const idList = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const ids = new Set(idList);
  const missing = EDITOR_ELEMENT_IDS.filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
  assert.equal(idList.length, ids.size, 'HTML contains duplicate IDs');
});
