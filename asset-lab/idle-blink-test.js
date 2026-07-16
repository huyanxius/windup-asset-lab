import { createApiClient } from './core/api-client.js';
import { PlaybackClock } from './core/playback-clock.js';
import { ProviderSessionController } from './features/provider-session-controller.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState', 'providerState', 'providerDot', 'apiKey', 'model', 'connectBtn', 'connectionMessage',
  'experimentForm', 'character', 'characterPortrait', 'startBtn', 'jobPercent', 'resultBody',
].map((id) => [id, $(id)]));

const api = createApiClient();
const clock = new PlaybackClock(8);
const state = { busy: false, characters: {} };
const provider = new ProviderSessionController({ api, elements: els, onChange: syncControls });

function syncControls() {
  els.startBtn.disabled = !provider.connected || state.busy || !provider.model;
  els.startBtn.textContent = state.busy ? '正在生成…' : provider.connected ? '生成眨眼测试' : '连接服务后开始生成';
  els.connectBtn.disabled = state.busy || provider.busy;
}

function syncCharacter() {
  const record = state.characters[els.character.value];
  if (record) els.characterPortrait.src = api.assetUrl(record.base);
}

function renderResult(result) {
  clock.stop();
  const frames = result.outputs.map((output) => `${api.assetUrl(output.url)}?v=${result.id}`);
  const openFrame = frames.find((_, index) => result.outputs[index].slot === 'open');
  const blinkFrame = frames.find((_, index) => result.outputs[index].slot === 'blink');
  els.resultBody.replaceChildren();

  const compare = document.createElement('div');
  compare.className = 'blink-compare';
  compare.innerHTML = `
    <figure><img src="${openFrame}" alt="睁眼(复用母版)"><figcaption>睁眼 · 复用母版</figcaption></figure>
    <figure><img src="${blinkFrame}" alt="闭眼(新生成)"><figcaption>闭眼 · 新生成 1 张</figcaption></figure>
  `;

  const loop = document.createElement('div');
  loop.className = 'loop-preview';
  const loopImg = document.createElement('img');
  loopImg.alt = '8 帧循环预览 · 8 FPS';
  const loopLabel = document.createElement('span');
  loopLabel.textContent = '8 帧循环预览 · 8 FPS · 只有第 4 帧是眨眼';
  loop.append(loopImg, loopLabel);

  els.resultBody.append(compare, loop);

  let index = 0;
  loopImg.src = frames[0];
  clock.start(() => {
    index = (index + 1) % frames.length;
    loopImg.src = frames[index];
  });

  els.jobPercent.textContent = `${result.sourceCallCount} 次模型调用`;
}

async function startExperiment(event) {
  event.preventDefault();
  if (!provider.requireConnection()) return;
  state.busy = true;
  els.resultBody.innerHTML = '<div class="empty-result"><i>◇</i><b>正在生成闭眼帧</b><span>只需要 1 次模型调用</span></div>';
  syncControls();
  try {
    const result = await api.post('/api/experiments/idle-blink', {
      character: els.character.value,
      model: provider.model,
    });
    renderResult(result);
  } catch (error) {
    els.resultBody.innerHTML = `<div class="empty-result"><i>✕</i><b>生成失败</b><span>${error.message}</span></div>`;
  } finally {
    state.busy = false;
    syncControls();
  }
}

async function boot() {
  const [, charactersResult] = await Promise.allSettled([provider.boot(), api.get('/api/characters')]);
  if (charactersResult.status === 'fulfilled') {
    charactersResult.value.characters.forEach((item) => { state.characters[item.id] = item; });
  }
  els.character.replaceChildren(...Object.entries(state.characters).map(([id, item]) => new Option(item.label, id)));
  if (els.character.options.length) els.character.value = els.character.options[0].value;
  syncCharacter();
  syncControls();
}

provider.bind();
els.character.addEventListener('change', syncCharacter);
els.experimentForm.addEventListener('submit', startExperiment);
boot();
