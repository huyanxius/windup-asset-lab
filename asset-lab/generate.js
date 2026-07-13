import { createApiClient } from './core/api-client.js';
import { createJobPoller } from './core/job-poller.js';
import { characterCatalog, mergeCharacterRecords } from './data/character-catalog.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState','providerState','providerDot','apiKey','model','connectBtn','connectionMessage',
  'generationForm','character','characterPortrait','view','action','mode','frameField','frame','prompt','startBtn',
  'workflowSteps','candidateGrid','jobPercent','jobProgress','jobTitle','jobMessage','acceptBtn','editorLink',
].map((id) => [id, $(id)]));
const api = createApiClient();
const poller = createJobPoller(api);
const state = { connected: false, busy: false, job: null };

function setStep(step) {
  const order = ['connect', 'define', 'review'];
  const current = order.indexOf(step);
  els.workflowSteps.querySelectorAll('li').forEach((item) => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle('active', index === current);
    item.classList.toggle('done', index < current);
  });
}

function providerStatus(kind, title, message = '') {
  els.providerState.className = `status ${kind || ''}`;
  els.providerState.textContent = title;
  els.providerDot.className = kind || '';
  els.connectionMessage.className = `message ${kind === 'error' ? 'error' : ''}`;
  els.connectionMessage.textContent = message;
}

function syncControls() {
  els.startBtn.disabled = !state.connected || state.busy || !els.model.value;
  els.startBtn.textContent = state.busy ? '正在生成…' : state.connected ? '开始生成候选资产' : '连接服务后开始生成';
  els.connectBtn.disabled = state.busy;
}

function populateModels(provider) {
  els.model.replaceChildren(...provider.models.map((id) => new Option(id, id)));
  els.model.value = provider.models.includes(provider.selected) ? provider.selected : provider.models[0] || '';
}

function syncCharacter() {
  els.characterPortrait.src = characterCatalog[els.character.value].base;
}

function syncMode() {
  const single = els.mode.value === 'single';
  els.frameField.style.opacity = single ? '1' : '.4';
  els.frame.disabled = !single;
}

async function connectProvider() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) { providerStatus('error', '需要 API Key', '请输入 Key 后再验证。'); els.apiKey.focus(); return; }
  state.busy = true;
  syncControls();
  els.connectBtn.textContent = '正在验证…';
  providerStatus('', '验证中', '正在进行不产生图片费用的凭据验证。');
  try {
    const result = await api.post('/api/provider/session', { apiKey, model: els.model.value }, { 'X-Windup-Request': 'studio' });
    state.connected = result.verified === true;
    els.apiKey.value = '';
    els.connectBtn.textContent = '重新连接';
    providerStatus('ready', '已验证', `${els.model.value} · 当前后端会话`);
    setStep('define');
  } catch (error) {
    state.connected = false;
    els.connectBtn.textContent = '重试连接';
    providerStatus('error', '连接失败', error.message);
  } finally {
    state.busy = false;
    syncControls();
  }
}

function renderJob(job) {
  state.job = job;
  state.busy = poller.isActive(job.status);
  els.jobPercent.textContent = `${job.progress || 0}%`;
  els.jobProgress.style.width = `${job.progress || 0}%`;
  els.jobTitle.textContent = job.batch || job.id;
  els.jobMessage.textContent = job.message || '';
  if (job.outputs?.length) {
    els.candidateGrid.replaceChildren(...job.outputs.map((output) => {
      const card = document.createElement('figure');
      card.className = 'candidate-card';
      const image = document.createElement('img');
      image.src = `${api.assetUrl(output.url)}?v=${encodeURIComponent(job.updatedAt || Date.now())}`;
      image.alt = `候选第 ${output.frameIndex + 1} 帧`;
      const caption = document.createElement('figcaption');
      const title = document.createElement('b');
      title.textContent = `#${String(output.frameIndex + 1).padStart(2, '0')}`;
      const meta = document.createElement('span');
      meta.textContent = job.request.mode === 'single' ? '单帧修复' : '动作相位';
      caption.append(title, meta);
      card.append(image, caption);
      return card;
    }));
  }
  els.acceptBtn.hidden = job.status !== 'awaiting_review';
  els.acceptBtn.disabled = false;
  els.editorLink.hidden = job.status !== 'approved';
  if (job.status === 'awaiting_review') setStep('review');
  syncControls();
}

async function startGeneration(event) {
  event.preventDefault();
  if (!state.connected) { providerStatus('error', '请先连接', '生成前必须完成真实 Key 验证。'); return; }
  state.busy = true;
  setStep('review');
  els.candidateGrid.innerHTML = '<div class="empty-result"><i>◇</i><b>正在创建任务</b><span>生成结果会逐帧出现</span></div>';
  syncControls();
  try {
    const job = await api.post('/api/generations', {
      character: els.character.value,
      view: els.view.value,
      action: els.action.value,
      mode: els.mode.value,
      frameIndex: Math.max(0, Math.min(7, Number(els.frame.value) - 1)),
      customPrompt: els.prompt.value.trim(),
      model: els.model.value,
    });
    renderJob(job);
    poller.poll(job.id, (next, error) => {
      if (error) { state.busy = false; els.jobMessage.textContent = `任务查询失败：${error.message}`; syncControls(); return; }
      renderJob(next);
    });
  } catch (error) {
    state.busy = false;
    els.jobTitle.textContent = '任务创建失败';
    els.jobMessage.textContent = error.message;
    setStep('define');
    syncControls();
  }
}

async function acceptGeneration() {
  if (!state.job) return;
  els.acceptBtn.disabled = true;
  try {
    const job = await api.post(`/api/generations/${state.job.id}/promote`, {});
    renderJob(job);
    els.jobMessage.textContent = '候选资产已采用，正式资产已备份，可返回审核台。';
  } catch (error) {
    els.acceptBtn.disabled = false;
    els.jobMessage.textContent = error.message;
  }
}

async function boot() {
  const query = new URLSearchParams(location.search);
  els.view.value = query.get('view') || 'side';
  els.action.value = query.get('action') || 'walk';
  els.mode.value = query.get('mode') || 'full';
  els.frame.value = query.get('frame') || '1';
  syncMode();
  const [healthResult, modelsResult, charactersResult] = await Promise.allSettled([
    api.get('/api/health'),
    api.get('/api/provider/models'),
    api.get('/api/characters'),
  ]);
  if (charactersResult.status === 'fulfilled') {
    mergeCharacterRecords(charactersResult.value.characters, (path) => api.assetUrl(path));
  }
  els.character.replaceChildren(...Object.entries(characterCatalog).map(([id, item]) => new Option(item.label, id)));
  els.character.value = characterCatalog[query.get('character')] ? query.get('character') : 'lamplighter';
  syncCharacter();
  if (modelsResult.status === 'fulfilled') populateModels(modelsResult.value);
  else { els.model.replaceChildren(new Option('模型读取失败', '')); els.model.disabled = true; }
  if (healthResult.status === 'fulfilled') {
    const health = healthResult.value;
    state.connected = health.configured === true && health.verified === true;
    els.serviceState.textContent = '生成后端已连接';
    if (state.connected) { providerStatus('ready', '已验证', `${health.model} · 当前后端会话`); setStep('define'); }
    else providerStatus(health.providerError ? 'error' : '', '未连接', health.providerError || '输入 Key 后进行真实验证。');
  } else {
    els.serviceState.textContent = '生成后端未启动';
    providerStatus('error', '服务不可用', '请启动 Python 生成后端。');
  }
  syncControls();
}

els.connectBtn.addEventListener('click', connectProvider);
els.apiKey.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); connectProvider(); } });
els.character.addEventListener('change', syncCharacter);
els.mode.addEventListener('change', syncMode);
els.model.addEventListener('change', () => {
  if (state.connected) providerStatus('ready', '已验证', `${els.model.value} · 将锁定到下一任务`);
  syncControls();
});
els.generationForm.addEventListener('submit', startGeneration);
els.acceptBtn.addEventListener('click', acceptGeneration);
boot();
