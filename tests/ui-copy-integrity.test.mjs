import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const userFacingSources = [
  'README.md',
  'HANDOFF.md',
  'asset-lab/characters.js',
  'asset-lab/data/character-catalog.js',
  'asset-lab/features/natural-creation.js',
  'asset-lab/features/provider-session-controller.js',
  'asset-lab/pages/workflow-shell.js',
  'asset-lab/review.html',
];
const presentationDisclaimers = /本地样例|本地模拟|模拟数据|模拟检查|样例资产|样例角色|样例母版|样例序列|非真实|NO API|SIMULATED ASSET|Demo 画布|本地模式|不调用外部 API|本地生成进程|本地状态已保存|旧试验角色|独立样例|请确认本地/i;

test('user-facing product copy has no presentation disclaimers', async () => {
  for (const path of userFacingSources) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.doesNotMatch(source, presentationDisclaimers, path);
  }
});

test('static HTML has no unnamed interactive control or empty accessible label', async () => {
  const assetLab = new URL('../asset-lab/', import.meta.url);
  const htmlFiles = (await readdir(assetLab)).filter((name) => name.endsWith('.html'));

  for (const name of htmlFiles) {
    const source = await readFile(new URL(name, assetLab), 'utf8');
    assert.doesNotMatch(source, /(?:aria-label|title|placeholder)="\s*"/i, `${name} has an empty accessible label`);
    assert.doesNotMatch(source, /<(button|a)\b[^>]*>\s*<\/\1>/i, `${name} has an unnamed interactive control`);
  }
});

test('Studio source keeps empty-state fallbacks and removes the obsolete empty toolbar', async () => {
  const source = await readFile(new URL('../asset-lab/pages/workflow-shell.js', import.meta.url), 'utf8');

  assert.match(source, /workflowState\.message \|\| '请稍后重新读取。'/);
  assert.match(source, /snapshot\.activeStep\?\.copy \|\| '正在处理当前生成阶段。'/);
  assert.match(source, /projectContext\.projectName \|\| '未命名项目'/);
  assert.doesNotMatch(source, /natural-agent-tools/);
});
