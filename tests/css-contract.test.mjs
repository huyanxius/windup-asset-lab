import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../asset-lab/', import.meta.url);

function braceBalance(source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutStrings = withoutComments.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
  let depth = 0;
  for (const char of withoutStrings) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth < 0) return depth;
  }
  return depth;
}

test('editor loads an explicit cascade-layer stack without inline styles', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /styles\.css/);

  const hrefs = [...html.matchAll(/href="(\.\/styles\/[^"]+\.css)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, ['./styles/editor.css']);

  for (const href of hrefs) {
    const file = new URL(href.replace('./', ''), root);
    await access(file);
    const css = await readFile(file, 'utf8');
    assert.equal(braceBalance(css), 0, `${href} has unbalanced braces`);
    assert.doesNotMatch(css, /generation-modal|generation-shell|provider-key-field/);
  }

  const entry = await readFile(new URL('styles/editor.css', root), 'utf8');
  const layers = ['foundation', 'surface', 'drawer', 'workspace', 'components', 'integrations', 'motion'];
  assert.match(entry, new RegExp(`@layer ${layers.join(', ')}`));
  for (const layer of layers) {
    assert.match(entry, new RegExp(`@import url\\('\\./${layer}\\.css'\\) layer\\(${layer}\\)`));
    const css = await readFile(new URL(`styles/${layer}.css`, root), 'utf8');
    assert.equal(braceBalance(css), 0, `${layer}.css has unbalanced braces`);
  }
  const allCss = await Promise.all(layers.map((layer) => readFile(new URL(`styles/${layer}.css`, root), 'utf8')));
  const importantRules = allCss.join('\n').match(/!important/g) || [];
  assert.ok(importantRules.length <= 6, 'important declarations are limited to hidden and reduced-motion semantics');
});
