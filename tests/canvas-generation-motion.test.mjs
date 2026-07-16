import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const stylesheet = new URL('../asset-lab/workflow-shell.css', import.meta.url);

test('guided canvas reveals generated assets from dots through blur to sharp output', async () => {
  const css = await readFile(stylesheet, 'utf8');
  assert.match(css, /@keyframes canvas-dot-materialize/);
  assert.match(css, /@keyframes canvas-image-resolve/);
  assert.match(css, /filter: blur\(16px\)/);
  assert.match(css, /\.production-node--frames\.is-current \.production-frame-grid img/);
  assert.match(css, /nth-child\(8\) \{ --frame-delay: 1270ms; \}/);
  assert.match(css, /\.production-node--quality\.is-current \.production-quality-list li:nth-child\(6\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
