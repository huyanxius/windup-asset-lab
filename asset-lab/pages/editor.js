import { FIXED_FPS, characterCatalog, mergeCharacterRecords } from '../data/character-catalog.js';
import { DEFAULT_DEMO_CHARACTER_ID } from '../data/default-demo-character.js';
import { createApiClient } from '../core/api-client.js';
import { EditorSession } from '../core/editor-session.js';
import {
  AnimationState,
  LocomotionState,
  advanceMotion,
  createMotionState,
  reduceMotion,
} from '../core/motion-state.js';
import { PlaybackClock } from '../core/playback-clock.js';
import { ReviewStore } from '../core/review-store.js';
import { runtimeConfig } from '../core/runtime-config.js';
import { DrawerController } from '../features/drawer-controller.js';
import { createGameBridge } from '../features/game-bridge.js';
import { OnboardingController } from '../features/onboarding-controller.js';
import { buildSpritePack } from '../features/sprite-packer.js';
import { bindEditorEvents } from './editor-bindings.js';
import { collectEditorElements } from './editor-elements.js';
import { EditorView } from './editor-view.js';

export function bootstrapEditor() {
  const els = collectEditorElements();
  const api = createApiClient();
  const requested = new URLSearchParams(location.search);
  const requestedCharacter = requested.get('character');
  const initialCharacter = characterCatalog[requestedCharacter]
    ? requestedCharacter
    : DEFAULT_DEMO_CHARACTER_ID;
  const requestedView = requested.get('view');
  const initialView = characterCatalog[initialCharacter].library[requestedView] ? requestedView : 'side';
  const session = new EditorSession(characterCatalog, {
    characterId: initialCharacter,
    view: initialView,
    action: requested.get('action') || 'idle',
  });
  const reviewStore = new ReviewStore(globalThis.localStorage, 'windup-review-state', api);
  const playback = new PlaybackClock(FIXED_FPS);
  const view = new EditorView(els, session, reviewStore);
  const drawer = new DrawerController({
    drawer: els.assetDrawer,
    toggle: els.sidebarToggle,
    reveal: els.sidebarReveal,
    hotspot: els.drawerHotspot,
  });
  const onboarding = new OnboardingController({
    stage: els.stage,
    characterFrame: els.characterFrame,
    modeCards: els.modeCards,
  });
  const gameBridge = createGameBridge({
    origin: runtimeConfig.gameOrigin,
    namespace: runtimeConfig.previewNamespace,
    iframe: els.gameFrame,
    status: els.gameStatus,
  });

  let motion = createMotionState();
  let lastMotionTime = performance.now();
  els.gameFrame.src = runtimeConfig.gameUrl;

  function gamePayload() {
    return session.gamePayload(runtimeConfig.previewNamespace, els.loopToggle.checked);
  }

  function syncPlayback() {
    playback.stop();
    if (!session.asset || motion.animation !== AnimationState.PLAYING) return;
    playback.setFps(session.asset.fps || FIXED_FPS);
    playback.start(() => {
      const atEnd = session.frame >= session.asset.frames.length - 1;
      if (atEnd && !els.loopToggle.checked) {
        motion = { ...motion, animation: AnimationState.PAUSED };
        playback.stop();
        view.syncMotion(motion);
        return;
      }
      session.stepFrame(1);
      view.renderFrame(motion);
    });
  }

  function render() {
    view.renderAll(motion);
    syncPlayback();
    if (session.asset) {
      const reviewKey = session.reviewKey;
      reviewStore.hydrate(reviewKey, session.asset, () => {
        if (session.reviewKey !== reviewKey) return;
        view.renderTimeline();
        view.renderFrame(motion);
        view.updateGate();
      }).catch(() => {});
    }
    if (!els.gameDock.hidden) setTimeout(() => gameBridge.send(gamePayload()), 0);
  }

  function desiredActionForMotion(event) {
    if (motion.locomotion !== LocomotionState.IDLE && session.library[session.view].walk) return 'walk';
    if (
      motion.animation === AnimationState.PLAYING
      && motion.locomotion === LocomotionState.IDLE
      && ['AUTO_TOGGLE', 'MANUAL_INPUT'].includes(event.type)
      && session.library[session.view].idle
    ) return 'idle';
    return session.action;
  }

  function dispatchMotion(event) {
    const previousAnimation = motion.animation;
    motion = reduceMotion(motion, event);
    const desiredAction = desiredActionForMotion(event);
    if (desiredAction !== session.action && session.selectAction(desiredAction)) {
      view.syncMotion(motion);
      syncPlayback();
      view.applyCharacterTransform(motion);
      view.renderTimeline();
      view.renderFrame(motion);
      return;
    }
    view.syncMotion(motion);
    // Only restart the frame clock when play/pause actually changed. Restarting it on every
    // (possibly repeated) motion event would keep clearing the 125ms interval before it ticks,
    // stalling manual-walk playback around frame two.
    if (motion.animation !== previousAnimation) syncPlayback();
    view.applyCharacterTransform(motion);
  }

  function pauseForReview() {
    motion = reduceMotion(motion, { type: 'PAUSE_FOR_REVIEW' });
    playback.stop();
    view.syncMotion(motion);
  }

  function selectAction(action) {
    pauseForReview();
    if (session.selectAction(action)) render();
  }

  function selectFrame(frame) {
    pauseForReview();
    if (session.selectFrame(frame)) view.renderFrame(motion);
  }

  function stepFrame(delta) {
    pauseForReview();
    if (session.stepFrame(delta)) view.renderFrame(motion);
  }

  function selectView(nextView) {
    if (nextView === session.view) return;
    pauseForReview();
    els.stage.classList.add('view-leave');
    setTimeout(() => {
      if (!session.selectView(nextView)) return;
      render();
      els.stage.classList.remove('view-leave');
      els.stage.classList.add('view-enter');
      setTimeout(() => els.stage.classList.remove('view-enter'), 260);
    }, 180);
  }

  function selectCharacter(characterId) {
    pauseForReview();
    if (!session.selectCharacter(characterId)) return;
    motion = reduceMotion(motion, { type: 'RESET' });
    render();
  }

  function setReview(value) {
    pauseForReview();
    if (!session.asset) return;
    reviewStore.set(session.reviewKey, session.asset, session.frame, value);
    view.renderTimeline();
    view.renderFrame(motion);
    view.updateGate();
  }

  async function refreshCharacters() {
    try {
      const result = await api.get('/api/characters');
      mergeCharacterRecords(result.characters, (path) => api.assetUrl(path));
      view.renderCharacterOptions();
      if (requestedCharacter && characterCatalog[requestedCharacter]) {
        session.selectCharacter(requestedCharacter);
        if (requested.get('view')) session.selectView(requested.get('view'));
        if (requested.get('action')) session.selectAction(requested.get('action'));
        render();
      }
    } catch {
      // Built-in assets remain available if the generation service is offline.
    }
  }

  async function exportSpriteSheet() {
    if (!session.asset) return;
    if (reviewStore.list(session.reviewKey, session.asset).some((value) => value !== 'pass')) return;
    await reviewStore.flush(session.reviewKey);
    els.packerModal.showModal();
    els.spriteMeta.textContent = '打包中…';
    try {
      const pack = await buildSpritePack({
        characterId: session.characterId,
        asset: session.asset,
        frameUrl: (index) => session.frameUrl(index),
        frameOffset: (index) => session.frameOffset(index),
        anchor: session.anchor,
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

  function openGamePreview() {
    els.gameDock.hidden = false;
    setTimeout(() => gameBridge.send(gamePayload()), 350);
  }

  const commands = {
    dispatchMotion,
    syncPlayback,
    render,
    selectAction,
    selectFrame,
    stepFrame,
    selectView,
    selectCharacter,
    setReview,
    exportSpriteSheet,
    openGeneration: (options) => { location.href = session.generationUrl(options); },
    openGamePreview,
    sendGame: () => gameBridge.send(gamePayload()),
    enterGame: () => gameBridge.openStandalone(gamePayload()),
    receiveGameMessage: gameBridge.receive,
  };

  bindEditorEvents({
    elements: els,
    session,
    view,
    onboarding,
    drawer,
    getMotion: () => motion,
    commands,
  });

  render();
  refreshCharacters();
  setTimeout(() => onboarding.start({
    beforeReveal() {
      motion = reduceMotion(motion, { type: 'RESET' });
      session.selectAction(session.library.side.idle ? 'idle' : session.firstAvailableAction('side'));
      playback.stop();
      view.renderFrame(motion);
      view.syncMotion(motion);
    },
  }), 100);

  function motionLoop(now) {
    const delta = Math.min((now - lastMotionTime) / 1000, 0.05);
    lastMotionTime = now;
    if (onboarding.complete) {
      const edge = Math.max(80, els.stage.clientWidth / 2 - 145);
      const next = advanceMotion(motion, delta, edge);
      if (next !== motion) {
        motion = next;
        view.applyCharacterTransform(motion);
      }
    }
    requestAnimationFrame(motionLoop);
  }
  requestAnimationFrame(motionLoop);
}
