import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import {
  WORKFLOW_ROUTES,
  routeById,
} from '../asset-lab/data/workflow-routes.js';
import {
  navigationContractErrors,
} from '../asset-lab/features/workflow-navigation.js';
import { DEMO_SOURCE_OPTIONS } from '../asset-lab/features/demo-production.js';

const assetLab = new URL('../asset-lab/', import.meta.url);

function primaryTarget(routeId) {
  return routeById(routeId).actions.find((action) => action.kind === 'primary')?.to;
}

test('workflow route registry is complete and internally connected', () => {
  assert.deepEqual(navigationContractErrors(), []);
  assert.equal(new Set(WORKFLOW_ROUTES.map((route) => route.id)).size, WORKFLOW_ROUTES.length);
  assert.equal(new Set(WORKFLOW_ROUTES.map((route) => route.path)).size, WORKFLOW_ROUTES.length);

  const home = routeById('home');
  assert.equal(home.parent, null);
  assert.equal(home.exit, null);
  assert.equal(home.layout, undefined);
  assert.match(home.purpose, /母版.*动作生成.*逐帧审核.*引擎/);

  const library = routeById('library');
  assert.equal(library.parent, 'home');
  assert.match(library.purpose, /角色、造型、母版、动作实例、正式帧/);

  for (const route of WORKFLOW_ROUTES.filter((item) => item.id !== 'home')) {
    assert.ok(route.parent, `${route.id} must declare a parent`);
  }
});

test('the product exposes one canonical canvas creation flow with three sources', () => {
  assert.deepEqual(DEMO_SOURCE_OPTIONS.map((source) => source.id), ['zero', 'upload', 'existing']);
  assert.equal(routeById('demoBuilder').path, '/studio');
  assert.deepEqual(
    WORKFLOW_ROUTES.filter((route) => route.section === 'demo').map((route) => route.id),
    ['demoBuilder'],
  );
  assert.ok(WORKFLOW_ROUTES.every((route) => !route.id.startsWith('legacy')));
  assert.ok(WORKFLOW_ROUTES.every((route) => !route.path.startsWith('/flows/')));
});

test('creation and delivery follow the approved workflow order', () => {
  assert.equal(primaryTarget('home'), 'demoBuilder');
  assert.equal(primaryTarget('demoBuilder'), undefined);
  assert.equal(routeById('demoBuilder').parent, 'home');
  assert.equal(routeById('demoBuilder').path, '/studio');

  assert.equal(primaryTarget('exportSelect'), 'exportPackage');
  assert.equal(primaryTarget('exportPackage'), 'exportPreview');
  assert.equal(primaryTarget('exportPreview'), 'exportTarget');
  assert.equal(primaryTarget('exportTarget'), 'exportImport');
  assert.equal(primaryTarget('exportImport'), 'outfit');

  const canvasRoutes = WORKFLOW_ROUTES.filter((route) => route.layout === 'canvas');
  assert.deepEqual(canvasRoutes.map((route) => route.id), ['exportPreview']);
});

test('primary navigation keeps home, merged project assets and creation only', async () => {
  const [shell, app, styles] = await Promise.all([
    readFile(new URL('pages/workflow-shell.js', assetLab), 'utf8'),
    readFile(new URL('workflow-app.js', assetLab), 'utf8'),
    readFile(new URL('workflow-shell.css', assetLab), 'utf8'),
  ]);
  assert.match(shell, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/);
  assert.match(shell, /const navItems[\s\S]*?\u9996\u9875[\s\S]*?\u9879\u76ee\u8d44\u4ea7[\s\S]*?\u521b\u4f5c/);
  assert.doesNotMatch(shell, /\{ id: 'tasks', label: '\u4efb\u52a1' \}/);
  assert.doesNotMatch(shell, /\{ id: 'exportSelect', label: '\u5bfc\u51fa'/);
  assert.doesNotMatch(shell, /\u753b\u5e03\u751f\u6210|\u7ecf\u5178\u751f\u6210|\u9002\u5e94\u5168\u90e8|\u6f14\u793a/);
  assert.match(shell, /className: 'node-graph-workspace'/);
  assert.match(shell, /className: 'node-canvas'/);
  assert.match(shell, /className: 'node-zoom'/);
  assert.match(shell, /data-node-surface/);
  assert.match(shell, /showGenerator[\s\S]*showMaster[\s\S]*showKeys/);
  assert.match(shell, /showBranchOverview/);
  assert.match(shell, /id: 'masterBriefForm'/);
  assert.match(shell, /data-keyframe-form/);
  assert.match(shell, /data-animation-form/);
  assert.match(shell, /data-export-pack/);
  assert.match(shell, /导出资产/);
  assert.match(shell, /发送到预览台/);
  assert.match(shell, /id: 'custom-action'/);
  assert.match(shell, /data-node-connect-surface/);
  assert.match(shell, /data-workflow-template-select/);
  assert.match(shell, /进入空白创作画布/);
  assert.match(shell, /project-setup__pixel-icon/);
  assert.match(shell, /画布工作台/);
  assert.match(shell, /data-workflow-save-form/);
  assert.match(shell, /data-workflow-library-open/);
  assert.match(shell, /data-start-creation/);
  assert.match(shell, /新建一次创作/);
  assert.match(shell, /data-workflow-enter/);
  assert.match(shell, /node-canvas-hint__copy/);
  assert.match(shell, /打开流程库/);
  assert.match(shell, /className: 'studio-bar__left'/);
  assert.match(shell, /className: 'studio-bar__right'/);
  assert.match(shell, /data-browser-fullscreen/);
  assert.match(app, /document\.startViewTransition/);
  assert.match(app, /document\.documentElement\.requestFullscreen\(\)/);
  assert.match(app, /document\.exitFullscreen\(\)/);
  assert.match(app, /document\.addEventListener\('click', forceFullscreenFromClick, true\)/);
  assert.match(app, /api\.get\('\/api\/workflows'\)/);
  assert.match(app, /nodeCanvas\.restoreWorkflowGraph\(selectedTemplate\.graph\)/);
  assert.match(app, /nodeCanvas\.clearConnections\(\);[\s\S]*nodeCanvas\.resetLayout\(\);[\s\S]*demoProduction\.reset\(\)/);
  assert.match(app, /let projectContext = null/);
  assert.doesNotMatch(app, /windup-project-context-v1/);
  assert.match(app, /const entersStudio = activeRouteId !== 'demoBuilder' && nextRoute\.id === 'demoBuilder'/);
  assert.match(app, /function resetStudioSession\(\)/);
  assert.match(app, /data-start-creation/);
  assert.match(app, /graph: nodeCanvas\.workflowGraph\(\)/);
  assert.match(app, /\/api\/workflows\/\$\{selectedTemplate\.id\}\/runs/);
  assert.match(app, /if \(shouldRevealLight\) \{[\s\S]*runRouteLightTransition\(\(\) => render/);
  assert.match(styles, /view-transition-name: windup-nav-left/);
  assert.match(styles, /view-transition-name: windup-nav-right/);
  assert.match(styles, /--workspace-white: #dfe3df/);
  assert.match(styles, /\.project-setup \{[\s\S]*width: 100%;[\s\S]*min-height: 100svh/);
  assert.match(styles, /backdrop-filter: blur\(28px\) saturate\(125%\) brightness\(\.24\)/);
});

test('project asset home reads the same character API as the legacy library', async () => {
  const [app, shell] = await Promise.all([
    readFile(new URL('workflow-app.js', assetLab), 'utf8'),
    readFile(new URL('pages/workflow-shell.js', assetLab), 'utf8'),
  ]);
  assert.match(app, /api\.get\('\/api\/characters'\)/);
  assert.match(shell, /characterSummary\(character\)/);
  assert.match(shell, /libraryState\.assetUrl/);
});

test('product home and action review are separate canonical pages', async () => {
  const [home, review] = await Promise.all([
    readFile(new URL('index.html', assetLab), 'utf8'),
    readFile(new URL('review.html', assetLab), 'utf8'),
  ]);

  assert.match(home, /id="workflowApp"/);
  assert.match(home, /workflow-app\.js/);
  assert.doesNotMatch(home, /id="stage"|app\.js\?v=301/);

  assert.match(review, /id="stage"/);
  assert.match(review, /app\.js\?v=301/);
  assert.match(review, /href="\.\/#\/projects\/windup-demo\/assets"/);

  await Promise.all([
    access(new URL('workflow-shell.css', assetLab)),
    access(new URL('workflow-app.js', assetLab)),
    access(new URL('pages/workflow-shell.js', assetLab)),
  ]);
});
