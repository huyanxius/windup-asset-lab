import { FIXED_FPS, actionLabels, actionOrder } from '../data/character-catalog.js';
import { AnimationState, LocomotionState } from '../core/motion-state.js';
import { inspectAnimation } from '../features/quality-check.js';

const REVIEW_LABELS = { pass: '通过', pending: '待审核', reject: '退回' };
const REVIEW_LABELS_SHORT = { pass: '通过', pending: '待审', reject: '退回' };

export class EditorView {
  constructor(elements, session, reviewStore) {
    this.els = elements;
    this.session = session;
    this.reviewStore = reviewStore;
    this.qualityRun = 0;
  }

  renderCharacterOptions() {
    const selected = this.session.characterId;
    this.els.characterSelect.replaceChildren(
      ...Object.entries(this.session.catalog).map(([id, character]) => new Option(character.label, id)),
    );
    this.els.characterSelect.value = selected;
  }

  renderActions() {
    this.els.actionList.innerHTML = actionOrder.map((key) => {
      const asset = this.session.library[this.session.view][key];
      const [label, type] = actionLabels[key];
      return `<button class="action-item ${this.session.action === key ? 'active' : ''}" data-action="${key}"><span><b>${label}</b><small>${type}</small></span><em class="${asset ? 'ready' : 'gap'}">${asset ? `${asset.frames.length} 帧` : '缺口'}</em></button>`;
    }).join('');
  }

  renderTimeline() {
    const asset = this.session.asset;
    if (!asset) {
      this.els.timeline.replaceChildren();
      return;
    }
    const reviews = this.reviewStore.list(this.session.reviewKey, asset);
    this.els.timeline.innerHTML = asset.frames.map((_, index) => `
      <button class="frame-tile ${index === this.session.frame ? 'active' : ''}" data-frame="${index}">
        <img src="${this.session.frameUrl(index)}" alt="第 ${index + 1} 帧">
        <i class="${reviews[index]}"></i>
        <span><b>#${String(index + 1).padStart(2, '0')}</b><small>${REVIEW_LABELS_SHORT[reviews[index]]}</small></span>
      </button>`).join('');
  }

  applyCharacterTransform(motion) {
    const offset = this.session.frameOffset();
    this.els.characterFrame.style.setProperty('--player-x', `${motion.x}px`);
    this.els.characterFrame.style.setProperty('--facing', motion.direction);
    this.els.characterFrame.style.setProperty('--nudge-x', `${offset.x}px`);
    this.els.characterFrame.style.setProperty('--nudge-y', `${offset.y}px`);
    this.els.characterFrame.style.transform =
      'translateX(calc(-50% + var(--player-x, 0px) + var(--nudge-x, 0px))) translateY(var(--nudge-y, 0px)) scaleX(var(--facing, 1))';
  }

  renderFrame(motion) {
    const asset = this.session.asset;
    if (!asset) return;
    const reviews = this.reviewStore.list(this.session.reviewKey, asset);
    this.els.characterFrame.src = this.session.frameUrl();
    this.els.frameCounter.textContent = `${String(this.session.frame + 1).padStart(2, '0')} / ${String(asset.frames.length).padStart(2, '0')}`;
    this.els.timeCounter.textContent = `${(this.session.frame / FIXED_FPS).toFixed(2)} s`;
    this.els.selectedFrame.textContent = `#${String(this.session.frame + 1).padStart(2, '0')}`;
    this.els.frameState.textContent = REVIEW_LABELS[reviews[this.session.frame]];
    const anchor = this.session.anchor;
    this.els.anchorCoords.textContent = `${anchor.x}, ${anchor.y}`;

    this.els.timeline.querySelectorAll('.frame-tile').forEach((tile, index) => {
      tile.classList.toggle('active', index === this.session.frame);
      if (index === this.session.frame) {
        const viewport = tile.closest('.timeline-viewport');
        viewport?.scrollTo({
          top: tile.offsetTop - viewport.clientHeight / 2 + tile.clientHeight / 2,
          behavior: 'smooth',
        });
      }
    });

    const onionVisible = this.els.onionToggle.checked;
    this.els.onionPrev.hidden = !onionVisible;
    this.els.onionNext.hidden = !onionVisible;
    if (onionVisible) {
      this.els.onionPrev.src = this.session.frameUrl((this.session.frame - 1 + asset.frames.length) % asset.frames.length);
      this.els.onionNext.src = this.session.frameUrl((this.session.frame + 1) % asset.frames.length);
      this.els.onionPrev.classList.add('show');
      this.els.onionNext.classList.add('show');
    } else {
      this.els.onionPrev.classList.remove('show');
      this.els.onionNext.classList.remove('show');
    }
    this.applyCharacterTransform(motion);
  }

  syncMotion(motion) {
    const playing = motion.animation === AnimationState.PLAYING;
    const auto = motion.locomotion === LocomotionState.AUTO;
    this.els.playBtn.textContent = playing ? '暂停' : '播放';
    this.els.autoWalkBtn.classList.toggle('active', auto);
    this.els.autoWalkBtn.textContent = auto ? '停止巡走' : '自动巡走';
  }

  updateGate() {
    const asset = this.session.asset;
    if (!asset) {
      this.els.exportBtn.disabled = true;
      return;
    }
    const reviews = this.reviewStore.list(this.session.reviewKey, asset);
    const passed = reviews.filter((value) => value === 'pass').length;
    const allPass = passed === reviews.length;
    this.els.approvalProgress.style.width = `${passed / reviews.length * 100}%`;
    this.els.approvalText.textContent = `${passed} / ${reviews.length} 帧通过`;
    this.els.exportBtn.disabled = !allPass;
    this.els.gateMessage.textContent = allPass
      ? '动作已满足导出条件，可生成 Cocos 图集与 metadata。'
      : '全部帧通过后才可导出，避免残缺动作进入项目。';
    const hasReject = reviews.includes('reject');
    this.els.instanceStatus.className = `status ${allPass ? 'pass' : hasReject ? 'reject' : 'pending'}`;
    this.els.instanceStatus.textContent = allPass ? '已通过' : hasReject ? '有退回帧' : '待审核';
  }

  async renderQuality() {
    const asset = this.session.asset;
    if (!asset) return;
    const run = ++this.qualityRun;
    this.els.qcSummary.textContent = '正在分析几何连续性…';
    const result = await inspectAnimation(asset, (index) => this.session.frameUrl(index));
    if (run !== this.qualityRun) return;
    this.els.qcSummary.textContent = result.summary;
    this.els.qcChecks.innerHTML = result.checks.map(([name, pass, detail]) => `
      <div class="qc-row ${pass ? 'pass' : 'warn'}"><i>${pass ? '✓' : '!'}</i><b>${name}</b><span>${detail}</span></div>`).join('');
  }

  renderAll(motion) {
    this.renderActions();
    const asset = this.session.asset;
    const currentView = this.session.currentView;
    this.els.characterName.textContent = this.session.character.label;
    this.els.characterSelect.value = this.session.characterId;
    this.els.viewTabs.querySelectorAll('button').forEach((button) =>
      button.classList.toggle('active', button.dataset.view === this.session.view));
    this.els.stage.className = `stage mode-${this.session.view} ${this.els.gridToggle.checked ? 'show-grid' : ''} ${this.els.checkerToggle.checked ? 'checker' : ''}`;
    this.els.viewLabel.textContent = currentView.label;
    this.els.viewTruth.textContent = currentView.truth;
    this.els.missingState.hidden = Boolean(asset);
    this.els.characterFrame.hidden = !asset;

    if (!asset) {
      this.els.actionName.textContent = `${currentView.label} · ${actionLabels[this.session.action][0]}（缺口）`;
      this.els.timeline.replaceChildren();
      this.els.exportBtn.disabled = true;
      return;
    }

    this.session.selectFrame(this.session.frame);
    this.els.actionName.textContent = `${currentView.label} · ${asset.label}`;
    this.els.batchId.textContent = asset.batch;
    this.els.frameBatch.textContent = asset.batch;
    this.els.specName.textContent = `${asset.key} / ${this.session.view}`;
    this.els.specFrames.textContent = asset.frames.length;
    this.els.fpsSlider.value = FIXED_FPS;
    this.els.fpsValue.textContent = FIXED_FPS;
    this.els.loopToggle.checked = asset.loop;
    this.els.specPlayback.textContent = `${FIXED_FPS} FPS · ${asset.loop ? '循环' : '单次'}`;
    this.syncMotion(motion);
    this.renderTimeline();
    this.renderFrame(motion);
    this.updateGate();
    this.renderQuality();
  }
}
