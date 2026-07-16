import { AnimationState, LocomotionState } from '../core/motion-state.js';

const TEXT_INPUTS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function bindEditorEvents({ elements: els, session, view, onboarding, drawer, getMotion, commands }) {
  const drag = { active: false, moved: false, startX: 0, startY: 0, anchorX: 0, anchorY: 0 };

  view.renderCharacterOptions();
  drawer.bind();

  els.characterSelect.addEventListener('change', () => commands.selectCharacter(els.characterSelect.value));
  els.openGenerateBtn.addEventListener('click', () => commands.openGeneration());
  els.generationModeCard.addEventListener('click', (event) => {
    event.stopPropagation();
    commands.openGeneration();
  });
  els.editorModeCard.addEventListener('click', (event) => {
    event.stopPropagation();
    onboarding.choose(() => {
      drawer.setCollapsed(true);
      setTimeout(() => onboarding.showClickGuide(), 320);
    });
  });
  els.regenerateFrameBtn.addEventListener('click', () => commands.openGeneration({ singleFrame: true }));

  els.actionList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (button) commands.selectAction(button.dataset.action);
  });
  els.timeline.addEventListener('click', (event) => {
    const button = event.target.closest('[data-frame]');
    if (button) commands.selectFrame(Number(button.dataset.frame));
  });
  els.viewTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (button) commands.selectView(button.dataset.view);
  });

  els.playBtn.addEventListener('click', () => {
    if (onboarding.complete) commands.dispatchMotion({ type: 'PLAYBACK_TOGGLE' });
  });
  els.firstBtn.addEventListener('click', () => commands.selectFrame(0));
  els.lastBtn.addEventListener('click', () => {
    if (session.asset) commands.selectFrame(session.asset.frames.length - 1);
  });
  els.prevBtn.addEventListener('click', () => commands.stepFrame(-1));
  els.nextBtn.addEventListener('click', () => commands.stepFrame(1));
  els.loopToggle.addEventListener('change', () => commands.syncPlayback());
  els.gridToggle.addEventListener('change', () => commands.render());
  els.checkerToggle.addEventListener('change', () => commands.render());
  els.onionToggle.addEventListener('change', () => view.renderFrame(getMotion()));
  els.approveBtn.addEventListener('click', () => commands.setReview('pass'));
  els.rejectBtn.addEventListener('click', () => commands.setReview('reject'));

  els.characterFrame.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const anchor = session.anchor;
    Object.assign(drag, {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      anchorX: anchor.x,
      anchorY: anchor.y,
    });
    els.characterFrame.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', (event) => {
    if (!drag.active) return;
    if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
    session.setAnchor(
      drag.anchorX - (event.clientX - drag.startX),
      drag.anchorY - (event.clientY - drag.startY),
    );
    const anchor = session.anchor;
    els.anchorCoords.textContent = `${anchor.x}, ${anchor.y}`;
  });
  window.addEventListener('mouseup', () => {
    drag.active = false;
    els.characterFrame.style.cursor = '';
  });

  els.stage.addEventListener('click', (event) => {
    if (!onboarding.complete || !onboarding.choiceMade) return;
    if (drag.moved) {
      drag.moved = false;
      return;
    }
    onboarding.hideClickGuide();
    commands.dispatchMotion({ type: 'CHARACTER_TOGGLE' });
    const motion = getMotion();
    const moving = motion.locomotion === LocomotionState.AUTO && motion.animation === AnimationState.PLAYING;
    onboarding.showClickPrompt(moving ? '▶ 开始移动' : '⏸ 已暂停', event);
  });

  els.exportBtn.addEventListener('click', () => commands.exportSpriteSheet());
  els.closePackerBtn.addEventListener('click', () => els.packerModal.close());
  els.gamePreviewBtn.addEventListener('click', () => commands.openGamePreview());
  els.closeGameBtn.addEventListener('click', () => { els.gameDock.hidden = true; });
  els.sendGameBtn.addEventListener('click', () => commands.sendGame());
  els.gameFrame.addEventListener('load', () => commands.sendGame());
  els.enterGameBtn.addEventListener('click', () => commands.enterGame());
  window.addEventListener('message', commands.receiveGameMessage);

  [['moveLeftBtn', 'left'], ['moveRightBtn', 'right']].forEach(([id, direction]) => {
    const button = els[id];
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      commands.dispatchMotion({ type: 'MANUAL_INPUT', direction, pressed: true });
    });
    const release = () => commands.dispatchMotion({ type: 'MANUAL_INPUT', direction, pressed: false });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  });
  els.autoWalkBtn.addEventListener('click', () => {
    if (onboarding.complete) commands.dispatchMotion({ type: 'AUTO_TOGGLE' });
  });

  window.addEventListener('keydown', (event) => {
    if (!onboarding.complete || TEXT_INPUTS.has(document.activeElement?.tagName)) return;
    const motion = getMotion();
    if (motion.animation === AnimationState.PAUSED && event.code.startsWith('Arrow')) {
      const delta = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      }[event.code];
      if (delta) {
        event.preventDefault();
        session.nudgeFrame(...delta);
        view.renderFrame(motion);
      }
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      commands.dispatchMotion({ type: 'PLAYBACK_TOGGLE' });
    }
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      commands.dispatchMotion({ type: 'MANUAL_INPUT', direction: 'right', pressed: true });
    }
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault();
      commands.dispatchMotion({ type: 'MANUAL_INPUT', direction: 'left', pressed: true });
    }
  });
  window.addEventListener('keyup', (event) => {
    if (!onboarding.complete) return;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      commands.dispatchMotion({ type: 'MANUAL_INPUT', direction: 'right', pressed: false });
    }
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      commands.dispatchMotion({ type: 'MANUAL_INPUT', direction: 'left', pressed: false });
    }
  });
}
