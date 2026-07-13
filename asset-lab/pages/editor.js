import {
  FIXED_FPS,
  actionLabels,
  actionOrder,
  characterCatalog,
  mergeCharacterRecords,
} from '../data/character-catalog.js';
import { createApiClient } from '../core/api-client.js';
import {
  AnimationState,
  LocomotionState,
  advanceMotion,
  createMotionState,
  reduceMotion,
} from '../core/motion-state.js';
import { ReviewStore } from '../core/review-store.js';
import { inspectAnimation } from '../features/quality-check.js';
import { buildSpritePack } from '../features/sprite-packer.js';
import { createGameBridge } from '../features/game-bridge.js';

const REVIEW_LABELS = { pass: '通过', pending: '待审核', reject: '退回' };
const REVIEW_LABELS_SHORT = { pass: '通过', pending: '待审', reject: '退回' };
const GAME_ORIGIN = 'http://127.0.0.1:4173';
const PREVIEW_NAMESPACE = 'windup';

const collect = (ids) => Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

export function bootstrapEditor() {
  const els = collect([
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
  ]);

  const reviewStore = new ReviewStore();
  const api = createApiClient();
  const state = {
    characterId: 'lamplighter',
    library: characterCatalog.lamplighter.library,
    view: 'side',
    action: 'idle',
    frame: 0,
    playbackTimer: null,
    qualityRun: 0,
  };
  const boot = { complete: false, choiceMade: false };
  const offsets = {};
  const anchor = { x: 128, y: 238 };
  const drag = { active: false, moved: false, startX: 0, startY: 0, anchorX: 0, anchorY: 0 };
  let motion = createMotionState();
  let lastMotionTime = performance.now();

  const gameBridge = createGameBridge({
    origin: GAME_ORIGIN,
    namespace: PREVIEW_NAMESPACE,
    iframe: els.gameFrame,
    status: els.gameStatus,
  });

  function currentAsset() {
    return state.library[state.view]?.[state.action] || null;
  }

  function currentReviewKey() {
    return `${state.characterId}:${state.view}:${state.action}`;
  }

  function frameUrl(asset, index) {
    const source = asset.frames[index];
    return asset.revision ? `${source}?v=${asset.revision}` : source;
  }

  function frameOffset(index = state.frame) {
    return offsets[`${state.action}_${state.view}_${index}`] || { x: 0, y: 0 };
  }

  function firstAvailableAction(view = state.view) {
    return actionOrder.find((key) => state.library[view]?.[key]) || null;
  }

  function renderActions() {
    els.actionList.innerHTML = actionOrder.map((key) => {
      const asset = state.library[state.view][key];
      const [label, type] = actionLabels[key];
      return `<button class="action-item ${state.action === key ? 'active' : ''}" data-action="${key}"><span><b>${label}</b><small>${type}</small></span><em class="${asset ? 'ready' : 'gap'}">${asset ? `${asset.frames.length} 帧` : '缺口'}</em></button>`;
    }).join('');
    els.actionList.querySelectorAll('.action-item').forEach((button) => {
      button.addEventListener('click', () => {
        if (!state.library[state.view][button.dataset.action]) return;
        pauseForReview();
        state.action = button.dataset.action;
        state.frame = 0;
        render();
      });
    });
  }

  function renderTimeline(asset) {
    const reviews = reviewStore.list(currentReviewKey(), asset);
    els.timeline.innerHTML = asset.frames.map((_, index) => `
      <button class="frame-tile ${index === state.frame ? 'active' : ''}" data-frame="${index}">
        <img src="${frameUrl(asset, index)}" alt="第 ${index + 1} 帧">
        <i class="${reviews[index]}"></i>
        <span><b>#${String(index + 1).padStart(2, '0')}</b><small>${REVIEW_LABELS_SHORT[reviews[index]]}</small></span>
      </button>`).join('');
    els.timeline.querySelectorAll('.frame-tile').forEach((button) => {
      button.addEventListener('click', () => {
        pauseForReview();
        state.frame = Number(button.dataset.frame);
        renderFrame();
      });
    });
  }

  function applyCharacterTransform() {
    const offset = frameOffset();
    els.characterFrame.style.setProperty('--player-x', `${motion.x}px`);
    els.characterFrame.style.setProperty('--facing', motion.direction);
    els.characterFrame.style.setProperty('--nudge-x', `${offset.x}px`);
    els.characterFrame.style.setProperty('--nudge-y', `${offset.y}px`);
    els.characterFrame.style.transform =
      'translateX(calc(-50% + var(--player-x, 0px) + var(--nudge-x, 0px))) translateY(var(--nudge-y, 0px)) scaleX(var(--facing, 1))';
  }

  function renderFrame() {
    const asset = currentAsset();
    if (!asset) return;
    const reviews = reviewStore.list(currentReviewKey(), asset);
    els.characterFrame.src = frameUrl(asset, state.frame);
    els.frameCounter.textContent = `${String(state.frame + 1).padStart(2, '0')} / ${String(asset.frames.length).padStart(2, '0')}`;
    els.timeCounter.textContent = `${(state.frame / FIXED_FPS).toFixed(2)} s`;
    els.selectedFrame.textContent = `#${String(state.frame + 1).padStart(2, '0')}`;
    els.frameState.textContent = REVIEW_LABELS[reviews[state.frame]];
    els.anchorCoords.textContent = `${anchor.x}, ${anchor.y}`;

    els.timeline.querySelectorAll('.frame-tile').forEach((tile, index) => {
      tile.classList.toggle('active', index === state.frame);
      if (index === state.frame) {
        const viewport = tile.closest('.timeline-viewport');
        if (viewport) {
          viewport.scrollTo({
            top: tile.offsetTop - viewport.clientHeight / 2 + tile.clientHeight / 2,
            behavior: 'smooth',
          });
        }
      }
    });

    if (els.onionToggle.checked) {
      els.onionPrev.src = frameUrl(asset, (state.frame - 1 + asset.frames.length) % asset.frames.length);
      els.onionNext.src = frameUrl(asset, (state.frame + 1) % asset.frames.length);
      els.onionPrev.classList.add('show');
      els.onionNext.classList.add('show');
    } else {
      els.onionPrev.classList.remove('show');
      els.onionNext.classList.remove('show');
    }
    applyCharacterTransform();
  }

  function syncMotionUi() {
    const playing = motion.animation === AnimationState.PLAYING;
    const auto = motion.locomotion === LocomotionState.AUTO;
    els.playBtn.textContent = playing ? '暂停' : '播放';
    els.autoWalkBtn.classList.toggle('active', auto);
    els.autoWalkBtn.textContent = auto ? '停止巡走' : '自动巡走';
  }

  function setPlayback() {
    clearInterval(state.playbackTimer);
    const asset = currentAsset();
    if (!asset || motion.animation !== AnimationState.PLAYING) return;
    state.playbackTimer = setInterval(() => {
      if (state.frame >= asset.frames.length - 1 && !els.loopToggle.checked) {
        motion = { ...motion, animation: AnimationState.PAUSED };
        syncMotionUi();
        clearInterval(state.playbackTimer);
        return;
      }
      state.frame = (state.frame + 1) % asset.frames.length;
      renderFrame();
    }, 1000 / FIXED_FPS);
  }

  function desiredActionForMotion(event) {
    if (motion.locomotion !== LocomotionState.IDLE && state.library[state.view].walk) return 'walk';
    if (
      motion.animation === AnimationState.PLAYING
      && motion.locomotion === LocomotionState.IDLE
      && ['AUTO_TOGGLE', 'MANUAL_INPUT'].includes(event.type)
      && state.library[state.view].idle
    ) return 'idle';
    return state.action;
  }

  function dispatchMotion(event) {
    motion = reduceMotion(motion, event);
    const desiredAction = desiredActionForMotion(event);
    if (desiredAction !== state.action) {
      state.action = desiredAction;
      state.frame = 0;
      render();
    } else {
      syncMotionUi();
      setPlayback();
      applyCharacterTransform();
    }
  }

  function pauseForReview() {
    motion = reduceMotion(motion, { type: 'PAUSE_FOR_REVIEW' });
    syncMotionUi();
    setPlayback();
  }

  function updateGate(asset) {
    const reviews = reviewStore.list(currentReviewKey(), asset);
    const passed = reviews.filter((value) => value === 'pass').length;
    const allPass = passed === reviews.length;
    els.approvalProgress.style.width = `${passed / reviews.length * 100}%`;
    els.approvalText.textContent = `${passed} / ${reviews.length} 帧通过`;
    els.exportBtn.disabled = !allPass;
    els.gateMessage.textContent = allPass
      ? '动作已满足导出条件，可生成 Cocos 图集与 metadata。'
      : '全部帧通过后才可导出，避免残缺动作进入项目。';
    const hasReject = reviews.includes('reject');
    els.instanceStatus.className = `status ${allPass ? 'pass' : hasReject ? 'reject' : 'pending'}`;
    els.instanceStatus.textContent = allPass ? '已通过' : hasReject ? '有退回帧' : '待审核';
  }

  async function renderQuality(asset) {
    const run = ++state.qualityRun;
    els.qcSummary.textContent = '正在分析几何连续性…';
    const result = await inspectAnimation(asset, (index) => frameUrl(asset, index));
    if (run !== state.qualityRun) return;
    els.qcSummary.textContent = result.summary;
    els.qcChecks.innerHTML = result.checks.map(([name, pass, detail]) => `
      <div class="qc-row ${pass ? 'pass' : 'warn'}"><i>${pass ? '✓' : '!'}</i><b>${name}</b><span>${detail}</span></div>`).join('');
  }

  function gamePayload() {
    const asset = currentAsset();
    if (!asset) return null;
    return {
      type: `${PREVIEW_NAMESPACE}:preview-animation`,
      character: state.characterId,
      action: asset.key,
      view: state.view,
      fps: FIXED_FPS,
      loop: els.loopToggle.checked,
    };
  }

  function render() {
    renderActions();
    const asset = currentAsset();
    const view = state.library[state.view];
    els.characterName.textContent = characterCatalog[state.characterId].label;
    els.characterSelect.value = state.characterId;
    els.viewTabs.querySelectorAll('button').forEach((button) =>
      button.classList.toggle('active', button.dataset.view === state.view));
    els.stage.className = `stage mode-${state.view} ${els.gridToggle.checked ? 'show-grid' : ''} ${els.checkerToggle.checked ? 'checker' : ''}`;
    els.viewLabel.textContent = view.label;
    els.viewTruth.textContent = view.truth;
    els.missingState.hidden = Boolean(asset);
    els.characterFrame.hidden = !asset;

    if (!asset) {
      clearInterval(state.playbackTimer);
      els.actionName.textContent = `${view.label} · ${actionLabels[state.action][0]}（缺口）`;
      els.timeline.innerHTML = '';
      els.exportBtn.disabled = true;
      return;
    }

    state.frame = Math.min(state.frame, asset.frames.length - 1);
    els.actionName.textContent = `${view.label} · ${asset.label}`;
    els.batchId.textContent = asset.batch;
    els.frameBatch.textContent = asset.batch;
    els.specName.textContent = `${asset.key} / ${state.view}`;
    els.specFrames.textContent = asset.frames.length;
    els.fpsSlider.value = FIXED_FPS;
    els.fpsValue.textContent = FIXED_FPS;
    els.loopToggle.checked = asset.loop;
    els.specPlayback.textContent = `${FIXED_FPS} FPS · ${asset.loop ? '循环' : '单次'}`;
    syncMotionUi();
    renderTimeline(asset);
    renderFrame();
    updateGate(asset);
    renderQuality(asset);
    setPlayback();
    if (!els.gameDock.hidden) setTimeout(() => gameBridge.send(gamePayload()), 0);
  }

  function setReview(value) {
    pauseForReview();
    const asset = currentAsset();
    reviewStore.set(currentReviewKey(), asset, state.frame, value);
    renderTimeline(asset);
    renderFrame();
    updateGate(asset);
  }

  function switchCharacter(characterId) {
    state.characterId = characterId;
    state.library = characterCatalog[characterId].library;
    state.action = state.library[state.view]?.[state.action] ? state.action : firstAvailableAction() || 'walk';
    state.frame = 0;
    motion = reduceMotion(motion, { type: 'RESET' });
    render();
  }

  async function refreshCharacters() {
    try {
      const result = await api.get('/api/characters');
      mergeCharacterRecords(result.characters, (path) => api.assetUrl(path));
      els.characterSelect.replaceChildren(...Object.entries(characterCatalog).map(([id, character]) => new Option(character.label, id)));
      els.characterSelect.value = state.characterId;
    } catch {
      // The built-in catalogue remains fully usable when the generation service is offline.
    }
  }

  async function exportSpriteSheet() {
    const asset = currentAsset();
    if (reviewStore.list(currentReviewKey(), asset).some((value) => value !== 'pass')) return;
    els.packerModal.showModal();
    els.spriteMeta.textContent = '打包中…';
    try {
      const pack = await buildSpritePack({
        characterId: state.characterId,
        asset,
        frameUrl: (index) => frameUrl(asset, index),
        frameOffset,
        anchor,
      });
      els.spriteCanvas.width = pack.canvas.width;
      els.spriteCanvas.height = pack.canvas.height;
      els.spriteCanvas.getContext('2d').drawImage(pack.canvas, 0, 0);
      els.spriteJson.value = JSON.stringify(pack.metadata, null, 2);
      els.spriteMeta.textContent = `${pack.canvas.width} × ${pack.canvas.height} · ${(pack.bytes / 1024).toFixed(1)} KB`;
      els.downloadPackBtn.onclick = pack.download;
    } catch (error) {
      els.spriteMeta.textContent = error.message;
    }
  }

  function generationUrl({ singleFrame = false } = {}) {
    const query = new URLSearchParams({
      character: state.characterId,
      view: state.view,
      action: state.action,
      mode: singleFrame ? 'single' : 'full',
      frame: String(state.frame + 1),
    });
    return `./generate.html?${query}`;
  }

  function showClickPrompt(text, event) {
    const prompt = document.createElement('div');
    prompt.textContent = text;
    prompt.className = 'click-prompt';
    prompt.style.left = `${event.clientX}px`;
    prompt.style.top = `${event.clientY - 20}px`;
    document.body.appendChild(prompt);
    setTimeout(() => prompt.remove(), 1000);
  }

  let clickGuide = null;
  function hideClickGuide() {
    if (!clickGuide) return;
    clickGuide.classList.add('leaving');
    const guide = clickGuide;
    clickGuide = null;
    setTimeout(() => guide.remove(), 220);
  }

  function showClickGuide() {
    hideClickGuide();
    const guide = document.createElement('div');
    guide.className = 'character-click-guide';
    guide.innerHTML = '<span class="guide-ripple"></span><i class="guide-cursor"></i><b>点击人物开始移动</b>';
    els.stage.appendChild(guide);
    clickGuide = guide;
    setTimeout(() => { if (clickGuide === guide) hideClickGuide(); }, 5200);
  }

  function closeModeCards(callback) {
    if (boot.choiceMade) return;
    boot.choiceMade = true;
    els.modeCards.classList.remove('visible');
    els.modeCards.classList.add('leaving');
    setTimeout(() => {
      els.modeCards.hidden = true;
      els.modeCards.classList.remove('leaving');
      callback?.();
    }, 220);
  }

  function bootReveal() {
    motion = reduceMotion(motion, { type: 'RESET' });
    state.action = state.library.side.idle ? 'idle' : firstAvailableAction('side');
    state.frame = 0;
    clearInterval(state.playbackTimer);
    renderFrame();
    syncMotionUi();
    const rect = els.characterFrame.getBoundingClientRect();
    const spotlight = document.createElement('div');
    spotlight.className = 'dynamic-spotlight';
    spotlight.style.left = `${rect.left + rect.width / 2}px`;
    spotlight.style.top = `${rect.top + rect.height / 2}px`;
    document.body.appendChild(spotlight);
    document.getElementById('bootScreen')?.remove();
    setTimeout(() => {
      spotlight.remove();
      document.getElementById('bootWordmark')?.remove();
      boot.complete = true;
      els.modeCards.hidden = false;
      requestAnimationFrame(() => els.modeCards.classList.add('visible'));
    }, 3000);
  }

  let drawerCloseTimer = null;
  let drawerAnimationTimer = null;
  function setDrawer(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    els.sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
    els.sidebarReveal.setAttribute('aria-expanded', String(!collapsed));
  }
  function openDrawer() {
    clearTimeout(drawerCloseTimer);
    clearTimeout(drawerAnimationTimer);
    document.body.classList.remove('drawer-opening');
    void document.body.offsetWidth;
    document.body.classList.add('drawer-opening');
    setDrawer(false);
    drawerAnimationTimer = setTimeout(() => document.body.classList.remove('drawer-opening'), 560);
  }

  function bindEvents() {
    els.characterSelect.replaceChildren(...Object.entries(characterCatalog).map(([id, character]) => new Option(character.label, id)));
    els.characterSelect.addEventListener('change', () => switchCharacter(els.characterSelect.value));
    els.openGenerateBtn.addEventListener('click', () => { location.href = generationUrl(); });
    els.generationModeCard.addEventListener('click', (event) => {
      event.stopPropagation();
      location.href = generationUrl();
    });
    els.editorModeCard.addEventListener('click', (event) => {
      event.stopPropagation();
      closeModeCards(() => { setDrawer(true); setTimeout(showClickGuide, 320); });
    });
    els.regenerateFrameBtn.addEventListener('click', () => { location.href = generationUrl({ singleFrame: true }); });

    els.viewTabs.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.dataset.view === state.view) return;
        pauseForReview();
        els.stage.classList.add('view-leave');
        setTimeout(() => {
          state.view = button.dataset.view;
          state.action = state.library[state.view][state.action] ? state.action : firstAvailableAction() || 'walk';
          state.frame = 0;
          render();
          els.stage.classList.remove('view-leave');
          els.stage.classList.add('view-enter');
          setTimeout(() => els.stage.classList.remove('view-enter'), 260);
        }, 180);
      });
    });

    els.playBtn.addEventListener('click', () => { if (boot.complete) dispatchMotion({ type: 'PLAYBACK_TOGGLE' }); });
    els.firstBtn.addEventListener('click', () => { pauseForReview(); state.frame = 0; renderFrame(); });
    els.lastBtn.addEventListener('click', () => { pauseForReview(); state.frame = currentAsset().frames.length - 1; renderFrame(); });
    els.prevBtn.addEventListener('click', () => { pauseForReview(); state.frame = (state.frame - 1 + currentAsset().frames.length) % currentAsset().frames.length; renderFrame(); });
    els.nextBtn.addEventListener('click', () => { pauseForReview(); state.frame = (state.frame + 1) % currentAsset().frames.length; renderFrame(); });
    els.loopToggle.addEventListener('change', setPlayback);
    els.gridToggle.addEventListener('change', render);
    els.checkerToggle.addEventListener('change', render);
    els.onionToggle.addEventListener('change', renderFrame);
    els.approveBtn.addEventListener('click', () => setReview('pass'));
    els.rejectBtn.addEventListener('click', () => setReview('reject'));

    els.characterFrame.addEventListener('mousedown', (event) => {
      event.preventDefault();
      drag.active = true;
      drag.moved = false;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.anchorX = anchor.x;
      drag.anchorY = anchor.y;
      els.characterFrame.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (event) => {
      if (!drag.active) return;
      if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
      anchor.x = Math.round(drag.anchorX - (event.clientX - drag.startX));
      anchor.y = Math.round(drag.anchorY - (event.clientY - drag.startY));
      els.anchorCoords.textContent = `${anchor.x}, ${anchor.y}`;
    });
    window.addEventListener('mouseup', () => { drag.active = false; els.characterFrame.style.cursor = ''; });

    // 舞台和人物共享同一个事件入口，不再依赖冒泡顺序表达业务规则。
    els.stage.addEventListener('click', (event) => {
      if (!boot.complete || !boot.choiceMade || drag.moved) return;
      hideClickGuide();
      dispatchMotion({ type: 'CHARACTER_TOGGLE' });
      const moving = motion.locomotion === LocomotionState.AUTO && motion.animation === AnimationState.PLAYING;
      showClickPrompt(moving ? '▶ 开始移动' : '⏸ 已暂停', event);
    });

    els.exportBtn.addEventListener('click', exportSpriteSheet);
    els.closePackerBtn.addEventListener('click', () => els.packerModal.close());
    els.gamePreviewBtn.addEventListener('click', () => {
      els.gameDock.hidden = false;
      setTimeout(() => gameBridge.send(gamePayload()), 350);
    });
    els.closeGameBtn.addEventListener('click', () => { els.gameDock.hidden = true; });
    els.sendGameBtn.addEventListener('click', () => gameBridge.send(gamePayload()));
    els.gameFrame.addEventListener('load', () => gameBridge.send(gamePayload()));
    els.enterGameBtn.addEventListener('click', () => gameBridge.openStandalone(gamePayload()));
    window.addEventListener('message', gameBridge.receive);

    els.sidebarToggle.addEventListener('click', () => setDrawer(true));
    els.sidebarReveal.addEventListener('mouseenter', openDrawer);
    els.sidebarReveal.addEventListener('focus', openDrawer);
    els.drawerHotspot.addEventListener('mouseenter', openDrawer);
    els.assetDrawer.addEventListener('mouseenter', () => clearTimeout(drawerCloseTimer));
    els.assetDrawer.addEventListener('mouseleave', () => {
      clearTimeout(drawerCloseTimer);
      drawerCloseTimer = setTimeout(() => setDrawer(true), 260);
    });

    [['moveLeftBtn', 'left'], ['moveRightBtn', 'right']].forEach(([id, direction]) => {
      const button = els[id];
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        dispatchMotion({ type: 'MANUAL_INPUT', direction, pressed: true });
      });
      button.addEventListener('pointerup', () => dispatchMotion({ type: 'MANUAL_INPUT', direction, pressed: false }));
      button.addEventListener('pointercancel', () => dispatchMotion({ type: 'MANUAL_INPUT', direction, pressed: false }));
    });
    els.autoWalkBtn.addEventListener('click', () => { if (boot.complete) dispatchMotion({ type: 'AUTO_TOGGLE' }); });

    window.addEventListener('keydown', (event) => {
      if (!boot.complete || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (motion.animation === AnimationState.PAUSED && event.code.startsWith('Arrow')) {
        const key = `${state.action}_${state.view}_${state.frame}`;
        if (!offsets[key]) offsets[key] = { x: 0, y: 0 };
        if (event.code === 'ArrowUp') offsets[key].y -= 1;
        if (event.code === 'ArrowDown') offsets[key].y += 1;
        if (event.code === 'ArrowLeft') offsets[key].x -= 1;
        if (event.code === 'ArrowRight') offsets[key].x += 1;
        event.preventDefault();
        renderFrame();
        return;
      }
      if (event.code === 'Space') { event.preventDefault(); dispatchMotion({ type: 'PLAYBACK_TOGGLE' }); }
      if (event.code === 'ArrowRight' || event.code === 'KeyD') { event.preventDefault(); dispatchMotion({ type: 'MANUAL_INPUT', direction: 'right', pressed: true }); }
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') { event.preventDefault(); dispatchMotion({ type: 'MANUAL_INPUT', direction: 'left', pressed: true }); }
    });
    window.addEventListener('keyup', (event) => {
      if (event.code === 'ArrowRight' || event.code === 'KeyD') dispatchMotion({ type: 'MANUAL_INPUT', direction: 'right', pressed: false });
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') dispatchMotion({ type: 'MANUAL_INPUT', direction: 'left', pressed: false });
    });
  }

  function motionLoop(now) {
    const delta = Math.min((now - lastMotionTime) / 1000, 0.05);
    lastMotionTime = now;
    if (boot.complete) {
      const edge = Math.max(80, els.stage.clientWidth / 2 - 145);
      const next = advanceMotion(motion, delta, edge);
      if (next !== motion) {
        motion = next;
        applyCharacterTransform();
      }
    }
    requestAnimationFrame(motionLoop);
  }

  bindEvents();
  render();
  refreshCharacters();
  setDrawer(true);
  setTimeout(bootReveal, 100);
  requestAnimationFrame(motionLoop);
}
