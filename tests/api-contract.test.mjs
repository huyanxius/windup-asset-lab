import test from 'node:test';
import assert from 'node:assert/strict';

import {
  contractPayload,
  generationJob,
  characterRecords,
} from '../asset-lab/core/api-contract.js';

const VERSION = '1.1.0';

test('contract payload rejects missing and stale backend versions', () => {
  assert.throws(() => contractPayload({}, VERSION), /版本不匹配/);
  assert.throws(() => contractPayload({ contractVersion: '1.0.0' }, VERSION), /1\.0\.0.*1\.1\.0/);
  assert.equal(contractPayload({ contractVersion: VERSION, ok: true }, VERSION).ok, true);
});

test('character records reject old or malformed catalogue responses', () => {
  assert.throws(() => characterRecords({ contractVersion: VERSION, characters: null }, VERSION), /角色资产接口格式/);
  assert.throws(() => characterRecords({
    contractVersion: VERSION,
    characters: [{ id: 'custom-a', label: 'A', base: '/a.png', assets: { side: { walk: { frames: null } } } }],
  }, VERSION), /角色资产接口格式/);
  assert.deepEqual(characterRecords({
    contractVersion: VERSION,
    characters: [{ id: 'custom-a', label: 'A', base: '/a.png', assets: { side: { walk: { frames: ['/1.png'] } } } }],
  }, VERSION).map((record) => record.id), ['custom-a']);
});

test('generation jobs require the current contract and stable request shape', () => {
  assert.throws(() => generationJob({ id: 'abc', request: {} }, VERSION), /版本不匹配/);
  assert.throws(() => generationJob({ contractVersion: VERSION, id: '', request: {} }, VERSION), /任务接口格式/);
  const job = generationJob({
    contractVersion: VERSION,
    id: 'a44fb8605647',
    status: 'awaiting_review',
    request: { character: 'boy' },
    outputs: [],
  }, VERSION);
  assert.equal(job.request.character, 'boy');
});
