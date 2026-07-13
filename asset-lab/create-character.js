import { createApiClient } from './core/api-client.js';
import { createJobPoller } from './core/job-poller.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState','providerState','providerDot','apiKey','model','connectBtn','connectionMessage',
  'createForm','assetName','description','createBtn','workflowSteps','resultPanel','jobPercent',
  'jobProgress','jobTitle','jobMessage','emptyResult','candidateImage','acceptBtn','libraryLink',
].map((id) => [id, $(id)]));

const api = createApiClient();
const poller = createJobPoller(api);
const state = { connected: false, busy: false, job: null };

const templates = {
  literary: {
    name: '远灯少年',
    description: '年轻清秀的东方少年，身形轻盈，黑色短发，穿剪裁精致的深灰蓝短斗篷与米白衬衫，少量暗红围巾作为点缀，携一盏小型黄铜灯。气质安静、聪慧而温暖，文艺幻想像素风，克制配色，轮廓清晰。',
  },
  courier: {
    name: '雾港邮差',
    description: '二十岁左右的年轻邮差，利落短发，深海军蓝长外套配暖灰马甲与皮革邮包，衣角略受海风吹动。神情从容友善，带有旧港口文学气息，精致像素艺术，低饱和蓝灰与少量铜色。',
  },
  herbalist: {
    name: '林间药师',
    description: '年轻的森林药师，栗色微卷短发，苔绿短披肩与深棕束腰衣，腰间挂有小药瓶和植物标本，手持细木杖。气质清醒温和，带自然人文感，精致像素风，绿色、棕色与亚麻白的克制配色。',
  },
};

function setStep(step) {
  const order = ['connect', 'define', 'review'];
  const current = order.indexOf(step);
  els.workflowSteps.querySelectorAll('li').forEach((item) => {
    const index = order.indexOf(item.dataset.step);
    item.classList.toggle('active', index === current);
    item.classList.toggle('done', index < current);
  });
}

function syncControls() {
  const ready = state.connected && !state.busy && Boolean(els.model.value);
  els.createBtn.disabled = !ready;
  els.createBtn.textContent = state.busy ? '正在生成角色母版…' : state.connected ? '生成角色母版' : '连接服务后生成角色母版';
  els.connectBtn.disabled = state.busy;
}

function providerStatus(kind, title, message = '') {
  els.providerState.className = `status ${kind || ''}`;
  els.providerState.textContent = title;
  els.providerDot.className = kind || '';
  els.connectionMessage.className = `message ${kind === 'error' ? 'error' : ''}`;
  els.connectionMessage.textContent = message;
}

function populateModels(provider) {
  const models = Array.isArray(provider.models) ? provider.models : [];
  els.model.replaceChildren(...models.map((id) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    return option;
  }));
  els.model.value = models.includes(provider.selected) ? provider.selected : models[0] || '';
  els.model.disabled = models.length === 0;
}

async function connectProvider() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    providerStatus('error', '需要 API Key', '请输入 Key 后再验证。');
    els.apiKey.focus();
    return;
  }
  state.busy = true;
  syncControls();
  els.connectBtn.textContent = '正在验证…';
  providerStatus('', '验证中', '正在向七牛云验证凭据，不会产生图片费用。');
  try {
    const result = await api.post(
      '/api/provider/session',
      { apiKey, model: els.model.value },
      { 'X-Windup-Request': 'studio' },
    );
    state.connected = result.verified === true;
    els.apiKey.value = '';
    els.connectBtn.textContent = '重新连接';
    providerStatus('ready', '已验证', `${result.model} · 当前后端会话`);
    setStep('define');
    els.assetName.focus();
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
  const progress = Number(job.progress || 0);
  els.jobPercent.textContent = `${progress}%`;
  els.jobProgress.style.width = `${progress}%`;
  els.jobTitle.textContent = job.batch || '角色创建任务';
  els.jobMessage.textContent = job.message || '';
  state.busy = poller.isActive(job.status);
  const output = job.outputs?.[0];
  els.emptyResult.hidden = Boolean(output);
  els.candidateImage.hidden = !output;
  if (output) els.candidateImage.src = `${api.assetUrl(output.url)}?v=${encodeURIComponent(job.updatedAt || Date.now())}`;
  els.acceptBtn.hidden = job.status !== 'awaiting_review';
  els.acceptBtn.disabled = false;
  els.libraryLink.hidden = job.status !== 'approved';
  if (job.status === 'awaiting_review') setStep('review');
  syncControls();
}

async function createCharacter(event) {
  event.preventDefault();
  if (!state.connected) {
    providerStatus('error', '请先连接', '生成前必须完成真实 Key 验证。');
    els.apiKey.focus();
    return;
  }
  state.busy = true;
  setStep('review');
  els.emptyResult.hidden = false;
  els.jobTitle.textContent = '正在创建任务';
  els.jobMessage.textContent = '角色定义正在发送到生成服务…';
  els.jobPercent.textContent = '0%';
  els.jobProgress.style.width = '0%';
  syncControls();
  try {
    const job = await api.post('/api/characters/generations', {
      name: els.assetName.value.trim(),
      description: els.description.value.trim(),
      model: els.model.value,
    });
    renderJob(job);
    poller.poll(job.id, (next, error) => {
      if (error) {
        state.busy = false;
        els.jobMessage.textContent = `任务查询失败：${error.message}`;
        syncControls();
        return;
      }
      renderJob(next);
    });
  } catch (error) {
    state.busy = false;
    els.jobTitle.textContent = '创建失败';
    els.jobMessage.textContent = error.message;
    setStep('define');
    syncControls();
  }
}

async function acceptCharacter() {
  if (!state.job) return;
  els.acceptBtn.disabled = true;
  els.acceptBtn.textContent = '正在加入资产库…';
  try {
    const job = await api.post(`/api/generations/${state.job.id}/promote`, {});
    renderJob(job);
    els.acceptBtn.hidden = true;
    els.jobMessage.textContent = `${job.character.label} 已加入角色资产库。`;
  } catch (error) {
    els.acceptBtn.disabled = false;
    els.acceptBtn.textContent = '确认并加入角色库';
    els.jobMessage.textContent = error.message;
  }
}

async function boot() {
  const [healthResult, modelResult] = await Promise.allSettled([
    api.get('/api/health'),
    api.get('/api/provider/models'),
  ]);
  if (modelResult.status === 'fulfilled') {
    populateModels(modelResult.value);
  } else {
    els.model.replaceChildren(new Option('模型读取失败', ''));
    els.model.disabled = true;
  }
  if (healthResult.status === 'fulfilled') {
    const health = healthResult.value;
    state.connected = health.configured === true && health.verified === true;
    els.serviceState.textContent = '生成后端已连接';
    if (state.connected) {
      providerStatus('ready', '已验证', `${health.model} · 当前后端会话`);
      setStep('define');
    } else {
      providerStatus(health.providerError ? 'error' : '', '未连接', health.providerError || '输入 Key 后进行真实验证。');
    }
  } else {
    els.serviceState.textContent = '生成后端未启动';
    providerStatus('error', '服务不可用', '请启动 Python 生成后端；静态页面本身不能调用模型。');
  }
  syncControls();
}

document.querySelectorAll('[data-template]').forEach((button) => {
  button.addEventListener('click', () => {
    const template = templates[button.dataset.template];
    els.assetName.value = template.name;
    els.description.value = template.description;
    setStep(state.connected ? 'define' : 'connect');
  });
});
els.connectBtn.addEventListener('click', connectProvider);
els.apiKey.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); connectProvider(); }
});
els.model.addEventListener('change', () => {
  if (state.connected) providerStatus('ready', '已验证', `${els.model.value} · 将用于下一次生成`);
  syncControls();
});
els.createForm.addEventListener('submit', createCharacter);
els.acceptBtn.addEventListener('click', acceptCharacter);
boot();
