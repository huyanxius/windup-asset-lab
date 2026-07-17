import { startBrandWave } from './features/brand-wave.js';
import { characterCatalog } from './data/character-catalog.js';
import { DEMO_CHARACTER_ASSETS, DemoProductionController } from './features/demo-production.js';
import { NaturalCreationController } from './features/natural-creation.js';
import { NodeCanvasController } from './features/node-canvas.js';
import { attachPointerCardMotion } from './features/pointer-card-motion.js';
import { buildSpritePack } from './features/sprite-packer.js';
import { startHomeIdleCast } from './features/home-idle-cast.js';
import { startNarrativeFields } from './features/narrative-field.js';
import { runRouteLightTransition } from './features/route-light-transition.js';
import { startScrollBird } from './features/scroll-bird.js';
import { parseWorkflowLocation } from './features/workflow-navigation.js';
import { renderWorkflowShell } from './pages/workflow-shell.js';
import { createApiClient } from './core/api-client.js';

const root = document.querySelector('#workflowApp');
root.dataset.uiVersion = 'fullscreen-studio-v2';
let stopBrandWave = () => {};
let stopNarrativeFields = () => {};
let stopHomeIdleCast = () => {};
let stopScrollBird = () => {};
let stopRouteTransition = () => {};
let stopPointerCardMotion = () => {};
let renderToken = 0;
let activeRouteId = null;
const api = createApiClient();
let libraryState = { status: 'loading', characters: [] };
let workflowState = { status: 'loading', items: [], selectedId: null, saving: false, message: '', open: false };
const nodeCanvas = new NodeCanvasController();
let projectContext = null;
let studioMode = null;
let naturalScreenSettled = false;
const demoProduction = new DemoProductionController({
  onChange: () => render({ preserveScroll: true }),
});
const naturalCreation = new NaturalCreationController({
  onChange: () => render({ preserveScroll: true }),
});

// Bound handlers tracked per node so we can replace a previous listener for the same event type.
const boundHandlers = new WeakMap();

function persistStudioState() {
  try {
    if (studioMode) sessionStorage.setItem('windup:studio-mode', studioMode);
    else sessionStorage.removeItem('windup:studio-mode');
    const snapshot = naturalCreation.snapshot();
    if (snapshot && snapshot.status && snapshot.status !== 'idle') {
      sessionStorage.setItem('windup:natural-snapshot', JSON.stringify(snapshot));
    } else {
      sessionStorage.removeItem('windup:natural-snapshot');
    }
  } catch {}
}

function restoreStudioState() {
  try {
    const mode = sessionStorage.getItem('windup:studio-mode');
    if (mode === 'workflow' || mode === 'natural') studioMode = mode;
    const raw = sessionStorage.getItem('windup:natural-snapshot');
    if (raw) {
      const snapshot = JSON.parse(raw);
      if (snapshot && snapshot.status) {
        // Suppress onChange during restore to avoid a redundant render cycle.
        const prevOnChange = naturalCreation.onChange;
        naturalCreation.onChange = () => {};
        naturalCreation.restore(snapshot);
        naturalCreation.onChange = prevOnChange;
      }
    }
  } catch {}
}

function on(selectorOrEl, eventType, handler) {
  const collection = selectorOrEl instanceof Element ? [selectorOrEl] : document.querySelectorAll(selectorOrEl);
  collection.forEach((node) => {
    if (!boundHandlers.has(node)) boundHandlers.set(node, []);
    const handlers = boundHandlers.get(node);
    const wrapped = (event) => handler(event, event.currentTarget, event.currentTarget);
    // Remove previous listener for the same event on the same node before adding the new one.
    const existing = handlers.findIndex((h) => h.event === eventType);
    if (existing !== -1) node.removeEventListener(eventType, handlers[existing].handler);
    handlers[existing >= 0 ? existing : handlers.length] = { event: eventType, handler: wrapped };
    node.addEventListener(eventType, wrapped);
  });
}

function requestBrowserFullscreen() {
  const target = document.documentElement;
  if (target.requestFullscreen) return target.requestFullscreen();
  if (target.webkitRequestFullscreen) return target.webkitRequestFullscreen();
  if (target.msRequestFullscreen) return target.msRequestFullscreen();
  return Promise.resolve();
}

function syncFullscreenButton() {
  const button = document.querySelector('[data-browser-fullscreen]');
  if (!button) return;
  button.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement || document.webkitFullscreenElement)));
}

function resetStudioSession() {
  projectContext = null;
  studioMode = null;
  workflowState = { ...workflowState, selectedId: null, message: '', open: false, runJobId: null };
  nodeCanvas.clearConnections();
  nodeCanvas.resetLayout();
  demoProduction.reset({ notify: false });
  naturalCreation.reset({ notify: false });
  try { sessionStorage.removeItem('windup:studio-mode'); sessionStorage.removeItem('windup:natural-snapshot'); } catch {}
}

function bindDemoFlow(context) {
  if (context.route.id !== 'demoBuilder') return;
  nodeCanvas.attach(root);
  const fullscreenButton = document.querySelector('[data-browser-fullscreen]');
  on(fullscreenButton, 'click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await requestBrowserFullscreen();
    } catch {
      fullscreenButton.setAttribute('aria-pressed', 'false');
    } finally {
      syncFullscreenButton();
    }
  });
  syncFullscreenButton();
  on('[data-start-creation]', 'click', (event) => {
    event.preventDefault();
    resetStudioSession();
    render({ preserveScroll: true, focus: true });
  });
  on('[data-studio-mode]', 'click', (event, target) => {
    studioMode = target.dataset.studioMode;
    projectContext = null;
    nodeCanvas.clearConnections();
    nodeCanvas.resetLayout();
    demoProduction.reset({ notify: false });
    naturalCreation.reset({ notify: false });
    render({ preserveScroll: true, focus: true });
  });
  on('[data-studio-mode-back]', 'click', () => {
    studioMode = null;
    projectContext = null;
    naturalCreation.reset({ notify: false });
    demoProduction.reset({ notify: false });
    nodeCanvas.clearConnections();
    nodeCanvas.resetLayout();
    const next = new URLSearchParams(window.location.search);
    next.delete('source');
    next.delete('imported');
    next.delete('character');
    const path = window.location.pathname + window.location.hash.split('?')[0];
    history.replaceState(null, '', path + (next.size ? '?' + next.toString() : ''));
    render({ preserveScroll: true, focus: true });
  });
  on('#naturalCreationForm', 'submit', (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const selectedBtn = document.querySelector('.natural-agent-character-picker .is-active');
    const characterId = selectedBtn?.dataset.naturalCharacter || 'boy';
    naturalCreation.start(form.get('command'), characterId);
  });
  on('[data-natural-example]', 'click', (event, target) => {
    const input = document.querySelector('#naturalCreationForm textarea[name="command"]');
    if (!input) return;
    input.value = target.dataset.naturalExample;
    input.focus();
    document.querySelectorAll('.natural-agent-character-picker .is-active').forEach((btn) => btn.classList.remove('is-active'));
  });
  on('[data-natural-character]', 'click', (event, target) => {
    const characterId = target.dataset.naturalCharacter;
    const input = document.querySelector('#naturalCreationForm textarea[name="command"]');
    const preview = document.querySelector('.natural-agent-preview img');
    if (!input) return;
    const prompts = {
      lamplighter: '创建一个名叫雾灯守夜人的低饱和像素角色，采用横版侧视，生成待机和行走动作并导出 Sprite Sheet 与 JSON。',
      boy: '创建一个像素少年角色，横版侧视，生成待机和行走动作并导出 Sprite Sheet 与 JSON。',
      skeleton: '生成一个卡通像素骷髅角色，横版侧视，制作行走八帧循环动画并导出 Sprite Sheet。',
      lirael: '创建一名叫 Lirael 的像素德鲁伊角色，横版侧视，生成待机动作并导出。',
      samurai: '生成一个像素武士角色，横版侧视，制作待机、行走和跳跃动作并导出 Sprite Sheet 与 JSON。',
      knight: '创建一名灰度像素骑士角色，横版侧视，生成待机动作并导出 Sprite Sheet。',
    };
    const resolvedId = prompts[characterId] ? characterId : 'boy';
    input.value = prompts[resolvedId];
    input.focus();
    if (preview) {
      const record = characterCatalog[resolvedId] || characterCatalog.boy;
      if (record) preview.src = record.base;
    }
    document.querySelectorAll('.natural-agent-character-picker .is-active').forEach((btn) => btn.classList.remove('is-active'));
    target.classList.add('is-active');
  });
  on('[data-natural-reset]', 'click', () => {
    naturalCreation.reset();
    document.querySelectorAll('.natural-agent-character-picker .is-active').forEach((btn) => btn.classList.remove('is-active'));
  });
  on('[data-natural-save-form]', 'submit', (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    naturalCreation.markSaved(form.get('workflowName'));
  });
  on('#projectContextForm', 'submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selectedTemplate = workflowState.items.find((item) => item.id === workflowState.selectedId);
    projectContext = {
      projectName: String(form.get('projectName') || '').trim(),
      view: String(form.get('view') || 'side'),
      directions: String(form.get('directions') || '1'),
      canvasSize: String(form.get('canvasSize') || '256'),
      style: String(form.get('style') || '').trim(),
      hasReference: Boolean(form.get('reference')?.name),
      workflowId: selectedTemplate?.id || null,
    };
    if (selectedTemplate) {
      nodeCanvas.restoreWorkflowGraph(selectedTemplate.graph);
      demoProduction.applyWorkflowTemplate(selectedTemplate);
    } else {
      nodeCanvas.clearConnections();
      nodeCanvas.resetLayout();
      demoProduction.reset();
    }
    workflowState = {
      ...workflowState,
      selectedId: selectedTemplate?.id || null,
      message: selectedTemplate ? `已加载「${selectedTemplate.name}」` : '已创建空白流程',
      runJobId: null,
    };
    render({ preserveScroll: true });
  });
  on('[data-workflow-template-select]', 'change', (event, target) => {
    workflowState = { ...workflowState, selectedId: target.value || null, message: '' };
    render({ preserveScroll: true });
  });
  on('[data-workflow-library-open]', 'click', () => {
    workflowState = { ...workflowState, open: true };
    render({ preserveScroll: true });
  });
  on('[data-workflow-library-close]', 'click', () => {
    workflowState = { ...workflowState, open: false };
    render({ preserveScroll: true });
  });
  on('[data-workflow-library-layer]', 'click', (event) => {
    if (event.target !== event.currentTarget) return;
    workflowState = { ...workflowState, open: false };
    render({ preserveScroll: true });
  });
  on('[data-workflow-enter]', 'click', (event, target) => {
    studioMode = 'workflow';
    projectContext = null;
    workflowState = {
      ...workflowState,
      selectedId: target.dataset.workflowEnter,
      open: false,
      message: '',
      runJobId: null,
    };
    nodeCanvas.clearConnections();
    demoProduction.reset();
    render({ preserveScroll: true, focus: true });
  });
  on('[data-edit-project]', 'click', () => {
    studioMode = 'workflow';
    workflowState = { ...workflowState, selectedId: projectContext?.workflowId || null, message: '' };
    projectContext = null;
    render({ preserveScroll: true, focus: true });
  });
  on('[data-demo-source]', 'click', (event, target) => demoProduction.selectSource(target.dataset.demoSource));
  on('#masterBriefForm', 'submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const profile = {
      name: form.get('name'),
      role: `${projectContext?.view || 'side'} character`,
      description: form.get('description'),
      style: form.get('style'),
      sourceAsset: form.get('existingCharacter') || form.get('reference')?.name || '',
    };
    demoProduction.configure(profile);
    const selectedTemplate = workflowState.items.find((item) => item.id === projectContext?.workflowId);
    if (!selectedTemplate || selectedTemplate.execution.mode !== 'automatic') {
      demoProduction.startMaster();
      return;
    }
    workflowState = { ...workflowState, message: '正在创建自动流程任务…' };
    render({ preserveScroll: true });
    try {
      const job = await api.post(`/api/workflows/${selectedTemplate.id}/runs`, {
        name: String(profile.name || '').trim(),
        description: String(profile.description || '').trim(),
        style: String(profile.style || '').trim(),
      });
      workflowState = { ...workflowState, runJobId: job.id, message: `自动流程已启动 · ${job.batch}` };
      demoProduction.startWorkflowRun();
    } catch (error) {
      workflowState = { ...workflowState, message: error.message };
      render({ preserveScroll: true });
    }
  });
  on('[data-master-candidate]', 'click', (event, target) => demoProduction.selectMasterCandidate(target.dataset.masterCandidate));
  on('[data-confirm-master]', 'click', () => demoProduction.confirmMaster());
  on('[data-keyframe-form]', 'submit', (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    demoProduction.generateKeyframe(event.currentTarget.dataset.keyframeForm, { brief: form.get('brief') });
  });
  on('[data-confirm-keyframe]', 'click', (event, target) => demoProduction.confirmKeyframe(target.dataset.confirmKeyframe));
  on('[data-animation-form]', 'submit', (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    demoProduction.generateAnimation(event.currentTarget.dataset.animationForm, { fps: form.get('fps') });
  });
  on('[data-confirm-animation]', 'click', (event, target) => demoProduction.confirmAnimation(target.dataset.confirmAnimation));
  on('[data-publish]', 'click', async () => {
    if (!workflowState.runJobId) {
      demoProduction.publish();
      return;
    }
    workflowState = { ...workflowState, message: '正在采用候选并写入正式资产…' };
    render({ preserveScroll: true });
    try {
      await api.post(`/api/generations/${workflowState.runJobId}/promote`, {});
      workflowState = { ...workflowState, message: '正式资产已入库', runJobId: null };
      demoProduction.publish();
    } catch (error) {
      workflowState = { ...workflowState, message: error.message };
      render({ preserveScroll: true });
    }
  });
  on('[data-workflow-save-form]', 'submit', async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || workflowState.saving) return;
    const form = new FormData(event.currentTarget);
    const snapshot = demoProduction.snapshot();
    workflowState = { ...workflowState, saving: true, message: '正在写入流程库…' };
    render({ preserveScroll: true });
    try {
      const template = await api.post('/api/workflows', {
        name: String(form.get('workflowName') || '').trim(),
        description: `来自「${projectContext?.projectName || snapshot.profile.name}」的已验证角色生产流程`,
        project: {
          view: projectContext?.view,
          directions: projectContext?.directions,
          canvasSize: projectContext?.canvasSize,
          style: projectContext?.style,
        },
        pipeline: {
          source: snapshot.sourceId,
          actions: ['idle', 'walk'],
          fps: snapshot.actions.walk.fps || snapshot.actions.idle.fps || 8,
          briefs: {
            idle: snapshot.actions.idle.brief,
            walk: snapshot.actions.walk.brief,
          },
        },
        graph: nodeCanvas.workflowGraph(),
        execution: { mode: 'automatic' },
      });
      workflowState = {
        ...workflowState,
        status: 'ready',
        items: [template, ...workflowState.items.filter((item) => item.id !== template.id)],
        selectedId: template.id,
        saving: false,
        open: true,
        message: `已保存「${template.name}」 · 下次可一键复用`,
      };
      render({ preserveScroll: true });
    } catch (error) {
      workflowState = { ...workflowState, saving: false, message: error.message };
      render({ preserveScroll: true });
    }
  });
  on('[data-export-pack]', 'click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = '正在打包…';
    try {
      const naturalSnapshot = naturalCreation.snapshot();
      const snapshot = studioMode === 'natural' && naturalSnapshot.intent
        ? {
            masterCandidate: 'boy',
            profile: { name: naturalSnapshot.intent.name },
          }
        : demoProduction.snapshot();
      const id = snapshot.masterCandidate || 'boy';
      const walk = id === 'boy' ? DEMO_CHARACTER_ASSETS.walkFrames : Array.from({ length: 8 }, (_, index) => `../assets/resources/characters/${id}/views/side/walk-${String(index + 1).padStart(2, '0')}.png`);
      const idle = id === 'boy' ? DEMO_CHARACTER_ASSETS.idleFrames : Array(8).fill(`../assets/resources/characters/${id}/base.png`);
      const frames = [...idle, ...walk];
      const pack = await buildSpritePack({
        characterId: snapshot.profile.name.replace(/\s+/g, '-').toLowerCase(),
        asset: { key: 'idle-walk', frames },
        frameUrl: (index) => frames[index],
        frameOffset: () => ({ x: 0, y: 0 }),
        anchor: { x: 128, y: 240 },
      });
      pack.download();
      button.textContent = '导出完成';
    } catch (error) {
      button.disabled = false;
      button.textContent = '导出失败，请重试';
      button.title = error.message;
    }
  });
  on('[data-demo-reset]', 'click', () => {
    nodeCanvas.clearConnections();
    demoProduction.reset();
  });
}

function render(options = {}) {
  const token = ++renderToken;
  stopBrandWave();
  stopNarrativeFields();
  stopHomeIdleCast();
  stopScrollBird();
  stopPointerCardMotion();
  stopBrandWave = () => {};
  stopNarrativeFields = () => {};
  stopHomeIdleCast = () => {};
  stopScrollBird = () => {};
  stopPointerCardMotion = () => {};
  const context = parseWorkflowLocation(window.location.hash);
  const requestedSource = context.query.get('source');
  if (requestedSource && demoProduction.snapshot().sourceId !== requestedSource) {
    studioMode = 'workflow';
    demoProduction.selectSource(requestedSource);
  }
  if (studioMode !== 'natural') naturalScreenSettled = false;
  const wasNaturalShowing = naturalScreenSettled;
  renderWorkflowShell(root, context, {
    demoSnapshot: demoProduction.snapshot(),
    libraryState,
    naturalSettled: wasNaturalShowing,
    naturalState: naturalCreation.snapshot(),
    projectContext,
    studioMode,
    workflowState,
  });
  naturalScreenSettled = studioMode === 'natural';
  document.title = `Windup · ${context.route.title}`;
  activeRouteId = context.route.id;
  persistStudioState();
  if (context.route.id === 'home') {
    stopHomeIdleCast = startHomeIdleCast(document.querySelectorAll('[data-home-idle]'));
    startBrandWave(document.querySelector('#brandWave')).then((stop) => {
      if (token !== renderToken) stop();
      else stopBrandWave = stop;
    });
    stopNarrativeFields = startNarrativeFields(document.querySelectorAll('.narrative-dot-field'));
    stopScrollBird = startScrollBird(document.querySelector('[data-bird-layer="transition"]'));
  }
  bindDemoFlow(context);
  stopPointerCardMotion = attachPointerCardMotion(root);
  on('[data-library-retry]', 'click', loadAssetLibrary);
  if (options.focus) document.querySelector('#workflowPageTitle')?.focus({ preventScroll: true });
  if (!options.preserveScroll) window.scrollTo({ top: 0, behavior: 'instant' });
}

async function loadAssetLibrary() {
  libraryState = { status: 'loading', characters: [] };
  if (['library', 'demoBuilder'].includes(parseWorkflowLocation(window.location.hash).route.id)) render({ preserveScroll: true });
  try {
    const payload = await api.get('/api/characters');
    libraryState = {
      status: 'ready',
      characters: Array.isArray(payload.characters) ? payload.characters : [],
      assetUrl: (path) => api.assetUrl(path),
    };
  } catch (error) {
    libraryState = { status: 'error', characters: [], message: error.message };
  }
  if (['library', 'demoBuilder'].includes(parseWorkflowLocation(window.location.hash).route.id)) render({ preserveScroll: true });
}

async function loadWorkflowTemplates() {
  workflowState = { ...workflowState, status: 'loading' };
  if (parseWorkflowLocation(window.location.hash).route.id === 'demoBuilder') render({ preserveScroll: true });
  try {
    const payload = await api.get('/api/workflows');
    workflowState = { ...workflowState, status: 'ready', items: Array.isArray(payload.workflows) ? payload.workflows : [] };
  } catch (error) {
    workflowState = { ...workflowState, status: 'error', message: error.message };
  }
  if (parseWorkflowLocation(window.location.hash).route.id === 'demoBuilder') render({ preserveScroll: true });
}

window.addEventListener('hashchange', () => {
  const nextRoute = parseWorkflowLocation(window.location.hash).route;
  const entersStudio = activeRouteId !== 'demoBuilder' && nextRoute.id === 'demoBuilder';
  if (entersStudio) {
    // Restore persisted state instead of resetting, so refresh/back button preserves the page.
    restoreStudioState();
    if (studioMode === 'natural') naturalScreenSettled = true;
  }
  const leavesStudio = activeRouteId === 'demoBuilder' && nextRoute.id !== 'demoBuilder';
  if (leavesStudio) {
    // Save current state to storage BEFORE clearing in-memory, so navigating back restores it.
    persistStudioState();
    studioMode = null;
    projectContext = null;
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const changesStudioChrome = activeRouteId === 'demoBuilder' || nextRoute.id === 'demoBuilder';
  const shouldRevealLight = activeRouteId === 'home'
    && nextRoute.id !== 'home'
    && !reducedMotion;
  stopRouteTransition();
  if (shouldRevealLight) {
    stopRouteTransition = runRouteLightTransition(() => render({ focus: true }));
    return;
  }
  if (changesStudioChrome && !reducedMotion && document.startViewTransition) {
    document.startViewTransition(() => render({ focus: true }));
    stopRouteTransition = () => {};
    return;
  }
  render({ focus: true });
  stopRouteTransition = () => {};
});
restoreStudioState();
render();
loadAssetLibrary();
loadWorkflowTemplates();
