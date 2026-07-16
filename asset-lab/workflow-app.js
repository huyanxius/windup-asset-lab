import { startBrandWave } from './features/brand-wave.js';
import { DemoProductionController } from './features/demo-production.js';
import { GuidedCanvasController } from './features/guided-canvas.js';
import { startHomeIdleCast } from './features/home-idle-cast.js';
import { startNarrativeFields } from './features/narrative-field.js';
import { runRouteLightTransition } from './features/route-light-transition.js';
import { startScrollBird } from './features/scroll-bird.js';
import { parseWorkflowLocation } from './features/workflow-navigation.js';
import { renderWorkflowShell } from './pages/workflow-shell.js';
import { createApiClient } from './core/api-client.js';

const root = document.querySelector('#workflowApp');
let stopBrandWave = () => {};
let stopNarrativeFields = () => {};
let stopHomeIdleCast = () => {};
let stopScrollBird = () => {};
let stopRouteTransition = () => {};
let renderToken = 0;
let activeRouteId = null;
const guidedCanvas = new GuidedCanvasController();
const api = createApiClient();
let libraryState = { status: 'loading', characters: [] };
const demoProduction = new DemoProductionController({
  onChange: (snapshot) => guidedCanvas.update(snapshot),
});

function bindDemoFlow(context) {
  if (context.route.id !== 'demoBuilder') {
    guidedCanvas.detach();
    return;
  }
  demoProduction.attach(root);
  if (context.route.id === 'demoBuilder') guidedCanvas.attach(root, demoProduction.snapshot());
  else guidedCanvas.detach();
  document.querySelectorAll('[data-demo-source]').forEach((button) => {
    button.addEventListener('click', () => {
      demoProduction.selectSource(button.dataset.demoSource);
      render({ focus: true });
    });
  });
  document.querySelector('[data-demo-change-source]')?.addEventListener('click', () => {
    demoProduction.clearSource();
    render({ focus: true });
  });
  document.querySelector('#demoCharacterForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    demoProduction.configure({
      action: 'side / idle + walk / 8 FPS',
      description: form.get('description'),
      name: form.get('name'),
      role: form.get('role'),
      style: form.get('style'),
    });
    demoProduction.start();
  });
  document.querySelector('[data-demo-reset]')?.addEventListener('click', () => {
    demoProduction.configure();
    render({ focus: true });
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
    demoProduction.selectSource(requestedSource);
  }
  renderWorkflowShell(root, context, { demoSnapshot: demoProduction.snapshot(), libraryState });
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
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function loadAssetLibrary() {
  libraryState = { status: 'loading', characters: [] };
  if (parseWorkflowLocation(window.location.hash).route.id === 'library') render();
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
  if (parseWorkflowLocation(window.location.hash).route.id === 'library') render();
}

window.addEventListener('hashchange', () => {
  const nextRoute = parseWorkflowLocation(window.location.hash).route;
  const shouldRevealLight = activeRouteId === 'home'
    && nextRoute.id !== 'home'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  stopRouteTransition();
  stopRouteTransition = shouldRevealLight
    ? runRouteLightTransition(() => render({ focus: true }))
    : (() => {
      render({ focus: true });
      return () => {};
    })();
});
render();
loadAssetLibrary();
