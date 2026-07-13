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

test('editor loads an ordered, valid CSS module stack without inline styles', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  assert.doesNotMatch(html, /\sstyle=/);
  assert.doesNotMatch(html, /styles\.css/);

  const hrefs = [...html.matchAll(/href="(\.\/styles\/[^"]+\.css)(?:\?[^" ]*)?"/g)].map((match) => match[1]);
  assert.deepEqual(hrefs, [
    './styles/foundation.css',
    './styles/surface.css',
    './styles/drawer.css',
    './styles/workspace.css',
    './styles/components.css',
    './styles/integrations.css',
    './styles/motion.css',
  ]);

  for (const href of hrefs) {
    const file = new URL(href.replace('./', ''), root);
    await access(file);
    const css = await readFile(file, 'utf8');
    assert.equal(braceBalance(css), 0, `${href} has unbalanced braces`);
    assert.doesNotMatch(css, /generation-modal|generation-shell|provider-key-field/);
  }
});
