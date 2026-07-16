import {
  actionLabels,
  actionOrder,
  generationDefaults,
  viewLabels,
} from '../data/generated-contract.js';

export const viewOrder = Object.freeze(Object.keys(viewLabels));
export const expectedFrameCount = generationDefaults.sheet.frameCount;

export function assetCell(character, view, action) {
  const asset = character.assets?.[view]?.[action];
  const frames = asset?.frames?.length || 0;
  const status = frames === 0 ? 'missing' : frames < expectedFrameCount ? 'partial' : 'ready';
  return {
    action,
    actionLabel: actionLabels[action]?.[0] || action,
    actionType: actionLabels[action]?.[1] || '',
    asset,
    frames,
    status,
    view,
    viewLabel: viewLabels[view]?.[0] || view,
  };
}

export function viewAssets(character, view) {
  return actionOrder.map((action) => assetCell(character, view, action));
}

export function viewSummary(character, view) {
  return viewAssets(character, view).reduce((summary, cell) => {
    summary.cellCount += 1;
    summary.frameCount += cell.frames;
    summary[`${cell.status}Count`] += 1;
    return summary;
  }, {
    cellCount: 0,
    frameCount: 0,
    missingCount: 0,
    partialCount: 0,
    readyCount: 0,
  });
}

export function characterMatrix(character) {
  return actionOrder.map((action) => ({
    action,
    actionLabel: actionLabels[action]?.[0] || action,
    actionType: actionLabels[action]?.[1] || '',
    cells: viewOrder.map((view) => assetCell(character, view, action)),
  }));
}

export function characterSummary(character) {
  const cells = characterMatrix(character).flatMap((row) => row.cells);
  return cells.reduce((summary, cell) => {
    summary.cellCount += 1;
    summary.frameCount += cell.frames;
    summary[`${cell.status}Count`] += 1;
    if (cell.frames) summary.entries.push(cell);
    return summary;
  }, {
    cellCount: 0,
    entries: [],
    frameCount: 0,
    missingCount: 0,
    partialCount: 0,
    readyCount: 0,
  });
}

export function projectSummary(characters) {
  return characters.reduce((summary, character) => {
    const characterStats = characterSummary(character);
    summary.characterCount += 1;
    summary.entryCount += characterStats.entries.length;
    summary.frameCount += characterStats.frameCount;
    summary.missingCount += characterStats.missingCount;
    summary.partialCount += characterStats.partialCount;
    return summary;
  }, {
    characterCount: 0,
    entryCount: 0,
    frameCount: 0,
    missingCount: 0,
    partialCount: 0,
  });
}

export function firstExistingAsset(character) {
  return characterSummary(character).entries[0] || null;
}

export function firstIncompleteAsset(character) {
  const cells = characterMatrix(character).flatMap((row) => row.cells);
  return cells.find((cell) => cell.status === 'partial')
    || cells.find((cell) => cell.status === 'missing')
    || null;
}
