export const EDITOR_ELEMENT_IDS = [
  'assetDrawer', 'sidebarToggle', 'sidebarReveal', 'drawerHotspot',
  'actionList', 'batchId', 'batchRoute', 'actionName', 'characterSelect', 'characterName', 'openGenerateBtn',
  'exportBtn', 'gamePreviewBtn', 'enterGameBtn',
  'gameDock', 'gameFrame', 'gameStatus', 'closeGameBtn', 'sendGameBtn',
  'viewTabs', 'gridToggle', 'checkerToggle', 'stage', 'viewLabel', 'viewTruth', 'characterFrame', 'missingState',
  'modeCards', 'generationModeCard', 'editorModeCard',
  'firstBtn', 'prevBtn', 'playBtn', 'nextBtn', 'lastBtn', 'moveLeftBtn', 'moveRightBtn', 'autoWalkBtn',
  'frameCounter', 'timeCounter', 'fpsSlider', 'fpsValue', 'loopToggle',
  'timeline', 'specName', 'instanceStatus', 'specFrames', 'specPlayback',
  'qcSummary', 'qcChecks',
  'selectedFrame', 'frameBatch', 'frameState', 'reviewNote', 'rejectBtn', 'approveBtn', 'regenerateFrameBtn',
  'gateMessage', 'approvalProgress', 'approvalText',
  'onionToggle', 'onionPrev', 'onionNext',
  'packerModal', 'closePackerBtn', 'spriteCanvas', 'spriteJson', 'spriteMeta', 'downloadPackBtn', 'anchorCoords',
];

export function collectEditorElements(documentLike = document) {
  const elements = Object.fromEntries(EDITOR_ELEMENT_IDS.map((id) => [id, documentLike.getElementById(id)]));
  const missing = EDITOR_ELEMENT_IDS.filter((id) => !elements[id]);
  if (missing.length) throw new Error(`编辑器 DOM 契约缺失：${missing.join(', ')}`);
  return elements;
}
