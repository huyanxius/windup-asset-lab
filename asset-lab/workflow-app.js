import { startBrandWave } from './features/brand-wave.js';
import { DEMO_CHARACTER_ASSETS, DemoProductionController } from './features/demo-production.js';
import { NaturalCreationController } from './features/natural-creation.js';
import { NodeCanvasController } from './features/node-canvas.js';
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
let renderToken = 0;
let activeRouteId = null;
const api = createApiClient();
let libraryState = { status: 'loading', characters: [] };
let workflowState = { status: 'loading', items: [], selectedId: null, saving: false, message: '', open: false };
const nodeCanvas = new NodeCanvasController();
let projectContext = null;
let studioMode = null;
const demoProduction = new DemoProductionController({
  onChange: () => render({ preserveScroll: true }),
});
const naturalCreation = new NaturalCreationController({
  onChange: () => render({ preserveScroll: true }),
});

function syncFullscreenButton() {
  const fullscreenButton = document.querySelector('[data-browser-fullscreen]');
  if (!fullscreenButton) return;
  fullscreenButton.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  fullscreenButton.setAttribute('aria-pressed', document.fullscreenElement ? 'true' : 'false');
}

async function requestBrowserFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  await document.documentElement.requestFullscreen();
}

function forceFullscreenFromClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (document.fullscreenElement || target?.closest('[data-browser-fullscreen]')) return;
  requestBrowserFullscreen().catch(() => {}).finally(syncFullscreenButton);
}

document.addEventListener('click', forceFullscreenFromClick, true);
document.addEventListener('fullscreenchange', syncFullscreenButton);

function resetStudioSession() {
  projectContext = null;
  studioMode = null;
  workflowState = { ...workflowState, selectedId: null, message: '', open: false, runJobId: null };
  nodeCanvas.clearConnections();
  nodeCanvas.resetLayout();
  demoProduction.reset({ notify: false });
  naturalCreation.reset({ notify: false });
}

function bindDemoFlow(context) {
  if (context.route.id !== 'demoBuilder') return;
  nodeCanvas.attach(root);
  const fullscreenButton = document.querySelector('[data-browser-fullscreen]');
  fullscreenButton?.addEventListener('click', async () => {
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
  document.querySelector('[data-start-creation]')?.addEventListener('click', (event) => {
    event.preventDefault();
    resetStudioSession();
    render({ preserveScroll: true, focus: true });
  });
  document.querySelectorAll('[data-studio-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      studioMode = button.dataset.studioMode;
      projectContext = null;
      nodeCanvas.clearConnections();
      nodeCanvas.resetLayout();
      demoProduction.reset({ notify: false });
      naturalCreation.reset({ notify: false });
      render({ preserveScroll: true, focus: true });
    });
  });
  document.querySelectorAll('[data-studio-mode-back]').forEach((button) => {
    button.addEventListener('click', () => {
      studioMode = null;
      projectContext = null;
      naturalCreation.reset({ notify: false });
      demoProduction.reset({ notify: false });
      nodeCanvas.clearConnections();
      nodeCanvas.resetLayout();
      render({ preserveScroll: true, focus: true });
    });
  });
  document.querySelector('#naturalCreationForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    naturalCreation.start(form.get('command'));
  });
  document.querySelectorAll('[data-natural-example]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.querySelector('#naturalCreationForm textarea[name="command"]');
      if (!input) return;
      input.value = button.dataset.naturalExample;
      input.focus();
    });
  });
  document.querySelector('[data-natural-skip]')?.addEventListener('click', () => naturalCreation.skip());
  document.querySelector('[data-natural-reset]')?.addEventListener('click', () => naturalCreation.reset());
  document.querySelector('[data-natural-save-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    naturalCreation.markSaved(form.get('workflowName'));
  });
  document.querySelector('#projectContextForm')?.addEventListener('submit', (event) => {
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
  document.querySelector('[data-workflow-template-select]')?.addEventListener('change', (event) => {
    workflowState = { ...workflowState, selectedId: event.currentTarget.value || null, message: '' };
    render({ preserveScroll: true });
  });
  document.querySelectorAll('[data-workflow-library-open]').forEach((button) => {
    button.addEventListener('click', () => {
      workflowState = { ...workflowState, open: true };
      render({ preserveScroll: true });
    });
  });
  document.querySelectorAll('[data-workflow-library-close]').forEach((button) => {
    button.addEventListener('click', () => {
      workflowState = { ...workflowState, open: false };
      render({ preserveScroll: true });
    });
  });
  document.querySelector('[data-workflow-library-layer]')?.addEventListener('click', (event) => {
    if (event.target !== event.currentTarget) return;
    workflowState = { ...workflowState, open: false };
    render({ preserveScroll: true });
  });
  document.querySelectorAll('[data-workflow-enter]').forEach((button) => {
    button.addEventListener('click', () => {
      studioMode = 'workflow';
      projectContext = null;
      workflowState = {
        ...workflowState,
        selectedId: button.dataset.workflowEnter,
        open: false,
        message: '',
        runJobId: null,
      };
      nodeCanvas.clearConnections();
      demoProduction.reset();
      render({ preserveScroll: true, focus: true });
    });
  });
  document.querySelector('[data-edit-project]')?.addEventListener('click', () => {
    studioMode = 'workflow';
    workflowState = { ...workflowState, selectedId: projectContext?.workflowId || null, message: '' };
    projectContext = null;
    render({ preserveScroll: true, focus: true });
  });
  document.querySelectorAll('[data-demo-source]').forEach((button) => {
    button.addEventListener('click', () => demoProduction.selectSource(button.dataset.demoSource));
  });
  document.querySelector('#masterBriefForm')?.addEventListener('submit', async (event) => {
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
  document.querySelectorAll('[data-master-candidate]').forEach((button) => {
    button.addEventListener('click', () => demoProduction.selectMasterCandidate(button.dataset.masterCandidate));
  });
  document.querySelector('[data-confirm-master]')?.addEventListener('click', () => demoProduction.confirmMaster());
  document.querySelectorAll('[data-keyframe-form]').forEach((formNode) => {
    formNode.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const form = new FormData(event.currentTarget);
      demoProduction.generateKeyframe(event.currentTarget.dataset.keyframeForm, { brief: form.get('brief') });
    });
  });
  document.querySelectorAll('[data-confirm-keyframe]').forEach((button) => {
    button.addEventListener('click', () => demoProduction.confirmKeyframe(button.dataset.confirmKeyframe));
  });
  document.querySelectorAll('[data-animation-form]').forEach((formNode) => {
    formNode.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const form = new FormData(event.currentTarget);
      demoProduction.generateAnimation(event.currentTarget.dataset.animationForm, { fps: form.get('fps') });
    });
  });
  document.querySelectorAll('[data-confirm-animation]').forEach((button) => {
    button.addEventListener('click', () => demoProduction.confirmAnimation(button.dataset.confirmAnimation));
  });
  document.querySelector('[data-publish]')?.addEventListener('click', async () => {
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
  document.querySelector('[data-workflow-save-form]')?.addEventListener('submit', async (event) => {
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
  document.querySelector('[data-export-pack]')?.addEventListener('click', async (event) => {
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
  document.querySelector('[data-demo-reset]')?.addEventListener('click', () => {
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
  stopBrandWave = () => {};
  stopNarrativeFields = () => {};
  stopHomeIdleCast = () => {};
  stopScrollBird = () => {};
  const context = parseWorkflowLocation(window.location.hash);
  const requestedSource = context.query.get('source');
  if (requestedSource && demoProduction.snapshot().sourceId !== requestedSource) {
    studioMode = 'workflow';
    demoProduction.selectSource(requestedSource);
  }
  renderWorkflowShell(root, context, {
    demoSnapshot: demoProduction.snapshot(),
    libraryState,
    naturalState: naturalCreation.snapshot(),
    projectContext,
    studioMode,
    workflowState,
  });
  document.title = `Windup · ${context.route.title}`;
  activeRouteId = context.route.id;
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
  document.querySelector('[data-library-retry]')?.addEventListener('click', loadAssetLibrary);
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
  if (entersStudio) resetStudioSession();
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
render();
loadAssetLibrary();
loadWorkflowTemplates();
