import test from 'node:test';
import assert from 'node:assert/strict';

import {
  allowedNodeConnections,
  connectionKey,
  NodeCanvasController,
  wirePath,
} from '../asset-lab/features/node-canvas.js';

test('node graph permits only the explicit production chain', () => {
  assert.ok(allowedNodeConnections.some(([from, to]) => from === 'source' && to === 'master-gen'));
  assert.ok(allowedNodeConnections.some(([from, to]) => from === 'master' && to === 'walk-key'));
  assert.ok(allowedNodeConnections.some(([from, to]) => from === 'master' && to === 'idle-key'));
  assert.ok(allowedNodeConnections.some(([from, to]) => from === 'master' && to === 'custom-action'));
  assert.ok(!allowedNodeConnections.some(([from, to]) => from === 'source' && to === 'publish'));
});

test('wire geometry is a stable cubic path', () => {
  assert.equal(connectionKey('master', 'walk-key'), 'master:walk-key');
  assert.equal(wirePath({ x: 10, y: 20 }, { x: 210, y: 120 }), 'M 10 20 C 102 20, 118 120, 210 120');
});

test('connection persistence uses the new clean canvas version', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
  };
  const canvas = new NodeCanvasController(storage);
  assert.equal(canvas.scale, 1);
  assert.equal(canvas.hasConnection('source', 'master-gen'), false);
  canvas.connections.add(connectionKey('source', 'master-gen'));
  canvas.clearConnections();
  assert.equal(canvas.hasConnection('source', 'master-gen'), false);
  assert.equal(values.get('windup-node-connections-v6'), '[]');
});

test('a reusable workflow restores its saved connections, layout and viewport', () => {
  const canvas = new NodeCanvasController(null);
  canvas.restoreWorkflowGraph({
    connections: [['source', 'master-gen'], ['master-gen', 'master'], ['source', 'publish']],
    positions: { source: { x: 140, y: 260 }, master: { x: 940, y: 220 } },
    viewport: { x: -320, y: 84, scale: 0.82 },
  });
  assert.equal(canvas.hasConnection('source', 'master-gen'), true);
  assert.equal(canvas.hasConnection('master-gen', 'master'), true);
  assert.equal(canvas.hasConnection('source', 'publish'), false);
  assert.deepEqual(canvas.positions.source, { x: 140, y: 260 });
  assert.deepEqual(canvas.pan, { x: -320, y: 84 });
  assert.equal(canvas.scale, 0.82);
});

test('legacy workflows without graph data recover the complete standard chain', () => {
  const canvas = new NodeCanvasController(null);
  canvas.restoreWorkflowGraph();
  assert.equal(canvas.hasConnection('source', 'master-gen'), true);
  assert.equal(canvas.hasConnection('master', 'walk-key'), true);
  assert.equal(canvas.hasConnection('master', 'idle-key'), true);
  assert.equal(canvas.hasConnection('walk-animation', 'publish'), true);
  assert.equal(canvas.hasConnection('idle-animation', 'publish'), true);
});

test('an armed output can be completed by clicking a compatible input', () => {
  const canvas = new NodeCanvasController(null);
  canvas.armedFrom = 'source';
  canvas.connect = (from, to) => from === 'source' && to === 'master-gen';
  const port = { closest: () => ({ dataset: { nodeId: 'master-gen' } }) };
  assert.equal(canvas.finishArmedLink(port), true);
});

test('clicking a suggested target card confirms its incoming connection', () => {
  const canvas = new NodeCanvasController(null);
  const target = { dataset: { nodeId: 'walk-key' } };
  const node = {
    dataset: { nodeId: 'walk-key' },
    querySelector: () => target,
    classList: { add: () => {}, remove: () => {} },
  };
  canvas.surface = { querySelector: () => ({}) };
  canvas.connect = (from, to) => from === 'master' && to === 'walk-key';
  const event = { target: { closest: () => null } };
  assert.equal(canvas.clickNodeToConnect(event, node), true);
});

test('a connected publish control stays disabled until upstream generation is confirmed', () => {
  const canvas = new NodeCanvasController(null);
  canvas.connections = new Set([
    connectionKey('walk-animation', 'publish'),
    connectionKey('idle-animation', 'publish'),
  ]);
  const node = { classList: { toggle: () => {} } };
  const control = {
    dataset: {
      connectionRequired: 'walk-animation:publish,idle-animation:publish',
      nodeReady: 'false',
    },
    disabled: false,
    title: '',
    closest: () => node,
  };
  canvas.root = {
    querySelectorAll: (selector) => selector === '[data-connection-required]' ? [control] : [],
  };

  canvas.syncActions();
  assert.equal(control.disabled, true);
  assert.equal(control.title, '等待上游生成与确认');

  control.dataset.nodeReady = 'true';
  canvas.syncActions();
  assert.equal(control.disabled, false);
  assert.equal(control.title, '');
});
