import test from 'node:test';
import assert from 'node:assert/strict';

import { ProviderSessionController } from '../asset-lab/features/provider-session-controller.js';

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
  const api = { post: async () => ({ verified: true, model: 'model-a' }) };
  let connected = 0;
  const controller = new ProviderSessionController({ api, elements: els, onConnected: () => { connected += 1; } });
  assert.equal(await controller.connect(), true);
  assert.equal(controller.connected, true);
  assert.equal(els.apiKey.value, '');
  assert.equal(els.providerState.textContent, '已验证');
  assert.equal(connected, 1);
});
