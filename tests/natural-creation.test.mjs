import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  NATURAL_CREATION_ASSET_SEQUENCE,
  NATURAL_CREATION_DURATION_MS,
  NATURAL_CREATION_STEPS,
  NaturalCreationController,
  parseNaturalCreationCommand,
} from '../asset-lab/features/natural-creation.js';

test('natural language command becomes a deterministic asset intent', () => {
  const intent = parseNaturalCreationCommand('创建一个名叫雾灯守夜人的低饱和像素角色，采用横版侧视，生成待机和行走动作并导出 Sprite Sheet 与 JSON。');

  assert.equal(intent.name, '雾灯守夜人');
  assert.equal(intent.view, 'side');
  assert.equal(intent.directions, '1');
  assert.deepEqual(intent.actions, ['idle', 'walk']);
  assert.deepEqual(intent.exportFormats, ['Sprite Sheet', 'JSON']);
  assert.match(intent.style, /低饱和/);
  assert.match(intent.style, /像素/);
});

test('natural creation publishes every intermediate asset before completion', () => {
  const scheduled = [];
  const controller = new NaturalCreationController({
    schedule: (callback, delay) => scheduled.push({ callback, delay }),
  });

  assert.equal(NATURAL_CREATION_DURATION_MS, 20_300);
  assert.ok(NATURAL_CREATION_DURATION_MS >= 20_000 && NATURAL_CREATION_DURATION_MS <= 21_000);

  controller.start('创建一个名叫纸鸢信使的角色，生成待机和行走并导出。');
  assert.equal(controller.snapshot().status, 'running');
  assert.equal(controller.snapshot().stepIndex, 0);
  assert.equal(controller.snapshot().artifacts.length, 0);

  while (scheduled.length) scheduled.shift().callback();

  const result = controller.snapshot();
  assert.equal(result.status, 'completed');
  assert.equal(result.progress, 100);
  assert.equal(result.intent.name, '纸鸢信使');
  assert.equal(result.steps.length, NATURAL_CREATION_STEPS.length);
  assert.ok(result.steps.every((step) => step.status === 'completed'));
  assert.equal(result.artifacts.length, 17);
  assert.deepEqual(
    result.artifacts.map((artifact) => artifact.id),
    NATURAL_CREATION_ASSET_SEQUENCE.map((artifact) => artifact.id),
  );
  assert.equal(new Set(result.artifacts.map((artifact) => artifact.id)).size, 17);
  assert.equal(result.qualityChecks.length, 5);
  assert.ok(result.qualityChecks.every((check) => check.status === 'passed'));
});

test('natural creation cannot skip live asset arrivals and can reset for another command', () => {
  const controller = new NaturalCreationController({ schedule: () => {} });
  controller.start('做一个像素骑士并导出');
  assert.equal(typeof controller.skip, 'undefined');
  assert.equal(controller.snapshot().status, 'running');

  const reset = controller.reset({ notify: false });
  assert.equal(reset.status, 'idle');
  assert.equal(reset.intent, null);
  assert.equal(reset.savedName, '');
  assert.deepEqual(reset.artifacts, []);
  assert.deepEqual(reset.qualityChecks, []);
});

test('studio exposes both creation entrances while the quick path avoids direct HTTP side effects', async () => {
  const [shell, app, feature] = await Promise.all([
    readFile(new URL('../asset-lab/pages/workflow-shell.js', import.meta.url), 'utf8'),
    readFile(new URL('../asset-lab/workflow-app.js', import.meta.url), 'utf8'),
    readFile(new URL('../asset-lab/features/natural-creation.js', import.meta.url), 'utf8'),
  ]);

  assert.match(shell, /'data-studio-mode': 'workflow'/);
  assert.match(shell, /'data-studio-mode': 'natural'/);
  assert.match(shell, /从一个项目开始/);
  assert.match(shell, /快速开始/);
  assert.match(shell, /id: 'naturalCreationForm'/);
  assert.match(shell, /el\('progress'/);
  assert.match(shell, /预计约/);
  assert.ok((shell.match(/data-pointer-card/g) || []).length >= 5);
  assert.doesNotMatch(shell, /data-natural-skip/);
  assert.doesNotMatch(app, /naturalCreation\.skip/);
  assert.match(shell, /LIVE 生成记录/);
  assert.match(shell, /snapshot\.artifacts/);
  assert.match(shell, /data-natural-save-form/);
  assert.match(shell, /studio-bar__mode-back/);
  assert.match(shell, /studio-mode-gateway__back/);
  assert.ok((shell.match(/data-studio-mode-back/g) || []).length >= 2);
  assert.doesNotMatch(shell, /本地样例|本地模拟|模拟数据|模拟检查|样例资产|样例角色|样例母版|样例序列|NO API|SIMULATED/);
  assert.doesNotMatch(feature, /本地样例|模拟角色|模拟检查|样例资产/);
  assert.doesNotMatch(shell, /natural-agent-tools/);
  assert.match(app, /naturalCreation\.start/);
  assert.doesNotMatch(feature, /\bfetch\s*\(|api\.(?:get|post|put|delete)\s*\(/);
});
