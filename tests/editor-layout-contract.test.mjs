import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const assetLab = new URL('../asset-lab/', import.meta.url);

test('editor preserves the collapsed drawer, left filmstrip and full-screen stage contract', async () => {
  const [html, drawerController, workspace] = await Promise.all([
    readFile(new URL('index.html', assetLab), 'utf8'),
    readFile(new URL('features/drawer-controller.js', assetLab), 'utf8'),
    readFile(new URL('styles/workspace.css', assetLab), 'utf8'),
  ]);

  assert.match(drawerController, /bind\(\)[\s\S]*this\.setCollapsed\(true\)/);
  assert.match(workspace, /body\.sidebar-collapsed \.sidebar\s*{[\s\S]*?transform: translateX\(-120%\) !important/);
  assert.match(workspace, /\.workspace\s*{[\s\S]*?position: fixed !important;[\s\S]*?inset: 0 !important/);
  assert.match(workspace, /\.timeline-panel\s*{[\s\S]*?left: 20px !important;[\s\S]*?width: 96px !important/);
  assert.doesNotMatch(html, /styles\/editor\.css/);
  assert.match(html, /styles\/workspace\.css\?v=4/);
});
