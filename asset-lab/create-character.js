import { createApiClient } from './core/api-client.js';
import { createJobPoller } from './core/job-poller.js';
import { ProviderSessionController } from './features/provider-session-controller.js';
import { WorkflowStepper } from './features/workflow-stepper.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState','providerState','providerDot','apiKey','model','connectBtn','connectionMessage',
  'createForm','assetName','description','createBtn','workflowSteps','resultPanel','jobPercent',
  'jobProgress','jobTitle','jobMessage','emptyResult','candidateImage','acceptBtn','libraryLink',
].map((id) => [id, $(id)]));

const api = createApiClient();
const poller = createJobPoller(api);
const state = { busy: false, job: null };
const stepper = new WorkflowStepper(els.workflowSteps, ['connect', 'define', 'review']);
const provider = new ProviderSessionController({
  api,
  elements: els,
  onChange: syncControls,
  onConnected: () => {
    stepper.select('define');
    els.assetName.focus();
  },
});

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

function syncControls() {
  const ready = provider.connected && !state.busy && Boolean(provider.model);
  els.createBtn.disabled = !ready;
  els.createBtn.textContent = state.busy ? '正在生成角色母版…' : provider.connected ? '生成角色母版' : '连接服务后生成角色母版';
  els.connectBtn.disabled = state.busy || provider.busy;
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
  if (job.status === 'awaiting_review') stepper.select('review');
  syncControls();
}

async function createCharacter(event) {
  event.preventDefault();
  if (!provider.requireConnection()) return;
  state.busy = true;
  stepper.select('review');
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
      model: provider.model,
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
    stepper.select('define');
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
  await provider.boot();
  if (provider.connected) stepper.select('define');
  syncControls();
}

document.querySelectorAll('[data-template]').forEach((button) => {
  button.addEventListener('click', () => {
    const template = templates[button.dataset.template];
    els.assetName.value = template.name;
    els.description.value = template.description;
    stepper.select(provider.connected ? 'define' : 'connect');
  });
});
provider.bind();
els.createForm.addEventListener('submit', createCharacter);
els.acceptBtn.addEventListener('click', acceptCharacter);
boot();
