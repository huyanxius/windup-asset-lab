import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProviderSessionController,
  providerIsReady,
} from '../asset-lab/features/provider-session-controller.js';

function elements() {
  return {
    providerState: { className: '', textContent: '' },
    providerDot: { className: '' },
    connectionMessage: { className: '', textContent: '' },
    apiKey: { value: 'valid-session-key-1234', focus() {} },
    model: { value: 'model-a' },
    connectBtn: { textContent: '', disabled: false },
    serviceState: { textContent: '' },
  };
}

test('provider controller owns connection state and clears the submitted key', async () => {
  const els = elements();
  const api = { post: async () => ({ verified: true, model: 'model-a', contractVersion: '1.1.0' }) };
  let connected = 0;
  const controller = new ProviderSessionController({ api, elements: els, onConnected: () => { connected += 1; } });
  assert.equal(await controller.connect(), true);
  assert.equal(controller.connected, true);
  assert.equal(els.apiKey.value, '');
  assert.equal(els.providerState.textContent, '已验证');
  assert.equal(controller.contractVersion, '1.1.0');
  assert.equal(connected, 1);
});

test('provider readiness accepts the running v1 backend and respects explicit rejection', () => {
  assert.equal(providerIsReady({ demo: true, configured: false, verified: false }), true);
  assert.equal(providerIsReady({ configured: true }), true);
  assert.equal(providerIsReady({ configured: true, verified: true }), true);
  assert.equal(providerIsReady({ configured: true, verified: false }), false);
  assert.equal(providerIsReady({ configured: false }), false);
});

test('provider connection rejects an unverified response without blank status values', async () => {
  const els = elements();
  const api = { post: async () => ({ configured: true, verified: false }) };
  const controller = new ProviderSessionController({ api, elements: els });

  assert.equal(await controller.connect(), false);
  assert.equal(controller.connected, false);
  assert.equal(els.providerState.textContent, '验证未通过');
  assert.equal(els.connectionMessage.textContent, '服务未确认当前凭据状态。');
  assert.doesNotMatch(els.connectionMessage.textContent, /undefined|null/);
});

test('provider boot supplies a readable model fallback without environment labels', async () => {
  const previousOption = globalThis.Option;
  globalThis.Option = class {
    constructor(label, value) {
      this.label = label;
      this.value = value;
    }
  };
  const els = elements();
  els.model = {
    value: '',
    disabled: false,
    replaceChildren(...options) {
      this.options = options;
    },
  };
  const api = {
    get: async (path) => path === '/api/health'
      ? { demo: true, configured: false, verified: false }
      : { models: [], selected: '' },
  };
  const controller = new ProviderSessionController({ api, elements: els });

  try {
    assert.equal(await controller.boot(), true);
  } finally {
    globalThis.Option = previousOption;
  }

  assert.equal(els.providerState.textContent, '服务就绪');
  assert.equal(els.connectionMessage.textContent, '生成模型 · 当前后端会话');
  assert.doesNotMatch(`${els.providerState.textContent} ${els.connectionMessage.textContent}`, /本地|模拟|样例|undefined|null/);
});

test('provider model options discard null and blank identifiers', () => {
  const previousOption = globalThis.Option;
  globalThis.Option = class {
    constructor(label, value) {
      this.label = label;
      this.value = value;
    }
  };
  const els = elements();
  els.model = {
    value: '',
    disabled: false,
    replaceChildren(...options) {
      this.options = options;
    },
  };
  const controller = new ProviderSessionController({ api: {}, elements: els });

  try {
    controller.populateModels({ models: ['', null, '  model-a  '], selected: '' });
  } finally {
    globalThis.Option = previousOption;
  }

  assert.equal(els.model.value, 'model-a');
  assert.equal(els.model.disabled, false);
  assert.deepEqual(els.model.options.map((option) => option.value), ['model-a']);
});
