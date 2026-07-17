import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stylesheet = new URL('../asset-lab/workflow-shell.css', import.meta.url);

test('node canvas makes master and frame generation visibly progressive', async () => {
  const css = await readFile(stylesheet, 'utf8');
  assert.doesNotMatch(css, /node-generation__scan|@keyframes node-scan/);
  assert.match(css, /@keyframes node-image-resolve/);
  assert.match(css, /@keyframes node-dot-ripple/);
  assert.doesNotMatch(css, /node-generation__grid/);
  assert.match(css, /\.dot-ring-4/);
  assert.match(css, /@keyframes node-frame-reveal/);
  assert.match(css, /filter: blur\(19px\)/);
  assert.match(css, /\.node-frame-strip\.is-revealing > span:nth-child\(8\)/);
  assert.match(css, /animation-delay: 12\.6s/);
  assert.match(css, /\.graph-port\.is-connectable/);
  assert.match(css, /\.node-wire\.is-suggested/);
  assert.match(css, /@keyframes node-wire-commit/);
  assert.match(css, /@keyframes project-pixel-drift/);
  assert.match(css, /project-setup__pixel-icon/);
  assert.match(css, /@keyframes project-pixel-cursor/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
