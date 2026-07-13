import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const assetLab = new URL('../asset-lab/', import.meta.url);

test('character creation exposes and enforces a starter action package', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('create-character.html', assetLab), 'utf8'),
    readFile(new URL('create-character.js', assetLab), 'utf8'),
  ]);
  assert.match(html, /id="starterIdle"[^>]*checked/);
  assert.match(html, /id="starterWalk"[^>]*checked/);
  assert.match(html, /id="resultGrid"/);
  assert.match(source, /starterActions:\s*generationDefaults\.starterPack\.actions\.filter/);
  assert.match(source, /completePackage/);
  assert.match(source, /contractVersion === CONTRACT_VERSION/);
});

test('full action generation selects the coherent sheet route and reports its cost', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('generate.html', assetLab), 'utf8'),
    readFile(new URL('generate.js', assetLab), 'utf8'),
  ]);
  assert.match(html, /一致性动作条 · 8 帧/);
  assert.match(html, /id="jobMetrics"/);
  assert.match(source, /route: generationDefaults\.defaultRoute/);
  assert.match(source, /sourceCallCount/);
});

test('character library only offers direct editor entry when actions exist', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('characters.html', assetLab), 'utf8'),
    readFile(new URL('characters.js', assetLab), 'utf8'),
  ]);
  assert.match(html, /id="previewEditorLink"[^>]*hidden/);
  assert.match(source, /previewEditorLink\.hidden = !inventory\.entries\.length/);
  assert.match(source, /尚无动作/);
});
