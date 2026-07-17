import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assetCell,
  characterMatrix,
  characterSummary,
  expectedFrameCount,
  firstExistingAsset,
  firstIncompleteAsset,
  projectSummary,
  viewAssets,
  viewOrder,
  viewSummary,
} from '../asset-lab/features/asset-library-model.js';
import { actionOrder } from '../asset-lab/data/generated-contract.js';

function frames(count) {
  return Array.from({ length: count }, (_, index) => `frame-${index + 1}.png`);
}

const complete = {
  id: 'complete',
  assets: Object.fromEntries(viewOrder.map((view) => [
    view,
    Object.fromEntries(actionOrder.map((action) => [action, { frames: frames(expectedFrameCount) }])),
  ])),
};

const growing = {
  id: 'growing',
  assets: {
    [viewOrder[0]]: {
      [actionOrder[0]]: { frames: frames(expectedFrameCount) },
      [actionOrder[1]]: { frames: frames(3) },
    },
  },
};

test('asset cells distinguish ready, partial, and missing assets', () => {
  assert.equal(assetCell(growing, viewOrder[0], actionOrder[0]).status, 'ready');
  assert.equal(assetCell(growing, viewOrder[0], actionOrder[1]).status, 'partial');
  assert.equal(assetCell(growing, viewOrder[1], actionOrder[0]).status, 'missing');
});

test('character matrix follows the generated view and action contract', () => {
  const matrix = characterMatrix(growing);
  assert.equal(matrix.length, actionOrder.length);
  assert.equal(matrix[0].cells.length, viewOrder.length);
  assert.deepEqual(matrix.map((row) => row.action), actionOrder);
});

test('library summaries expose real instances, frames, and gaps', () => {
  const growingStats = characterSummary(growing);
  assert.equal(growingStats.readyCount, 1);
  assert.equal(growingStats.partialCount, 1);
  assert.equal(growingStats.missingCount, actionOrder.length * viewOrder.length - 2);
  assert.equal(growingStats.frameCount, expectedFrameCount + 3);

  const project = projectSummary([complete, growing]);
  assert.equal(project.characterCount, 2);
  assert.equal(project.entryCount, actionOrder.length * viewOrder.length + 2);
  assert.equal(project.partialCount, 1);
  assert.equal(project.missingCount, growingStats.missingCount);
});

test('a view shelf only exposes the actions for the selected view', () => {
  const assets = viewAssets(growing, viewOrder[0]);
  assert.equal(assets.length, actionOrder.length);
  assert.ok(assets.every((asset) => asset.view === viewOrder[0]));
  assert.deepEqual(assets.map((asset) => asset.action), actionOrder);

  const stats = viewSummary(growing, viewOrder[0]);
  assert.equal(stats.readyCount, 1);
  assert.equal(stats.partialCount, 1);
  assert.equal(stats.missingCount, actionOrder.length - 2);
});

test('next-step selectors prefer existing and incomplete contract cells', () => {
  assert.deepEqual(firstExistingAsset(growing), assetCell(growing, viewOrder[0], actionOrder[0]));
  assert.deepEqual(firstIncompleteAsset(growing), assetCell(growing, viewOrder[0], actionOrder[1]));
  assert.equal(firstIncompleteAsset(complete), null);
});
