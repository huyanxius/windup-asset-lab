import { createApiClient } from './core/api-client.js';
import { createJobPoller } from './core/job-poller.js';
import { ProviderSessionController } from './features/provider-session-controller.js';
import { WorkflowStepper } from './features/workflow-stepper.js';
import { CONTRACT_VERSION, generationDefaults } from './data/generated-contract.js';
import { renderAssetPackage } from './features/asset-package-preview.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState','providerState','providerDot','apiKey','model','connectBtn','connectionMessage',
  'createForm','assetName','description','styleInput','paletteInput','createBtn','workflowSteps','resultPanel','jobPercent',
  'jobProgress','jobTitle','jobMessage','emptyResult','resultGrid','acceptBtn','libraryLink','editorLink',
  'starterIdle','starterWalk','referenceField','referenceInput','referencePreview','referenceMessage',
].map((id) => [id, $(id)]));

const api = createApiClient();
const poller = createJobPoller(api);
const query = new URLSearchParams(location.search);
const referenceRequired = query.get('source') === 'upload';
const state = { busy: false, job: null, reference: null, previewUrl: '' };
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
    style: '文艺幻想像素风，克制配色，轮廓清晰',
    palette: '黑色短发，深灰蓝短斗篷，米白衬衫，暗红围巾点缀',
    description: '年轻清秀的东方少年，身形轻盈，穿剪裁精致的短斗篷与衬衫，携一盏小型黄铜灯。气质安静、聪慧而温暖。',
  },
  courier: {
    name: '雾港邮差',
    style: '旧港口文学气息，精致像素艺术，低饱和',
    palette: '利落短发，深海军蓝长外套，暖灰马甲，少量铜色',
    description: '二十岁左右的年轻邮差，背皮革邮包，衣角略受海风吹动。神情从容友善。',
  },
  herbalist: {
    name: '林间药师',
    style: '自然人文感的精致像素风',
    palette: '栗色微卷短发，苔绿短披肩，深棕束腰衣，亚麻白点缀',
    description: '年轻的森林药师，腰间挂有小药瓶和植物标本，手持细木杖。气质清醒温和。',
  },
};

const dicePools = {
  style: ['明快卡通像素风', '暗黑哥特像素风', '复古 JRPG 像素风', '文艺幻想像素风', '赛博霓虹像素风', '水彩绘本质感像素风'],
  palette: [
    '银白长发，墨绿披风，黄铜饰件点缀',
    '黑发，深蓝外套，暗红点缀',
    '火红短发，炭灰大衣，金色纽扣',
    '蓝黑发，海军蓝制服，白色袜靴',
    '亚麻色卷发，米白长袍，靛蓝腰带',
    '紫黑发，暗紫斗篷，银色链饰',
  ],
};

function syncControls() {
  const contractReady = provider.contractVersion === CONTRACT_VERSION;
  const referenceReady = !referenceRequired || Boolean(els.referenceInput.files[0]);
  const ready = provider.connected && contractReady && referenceReady && !state.busy && Boolean(provider.model);
  els.createBtn.disabled = !ready;
  els.createBtn.textContent = state.busy
    ? '正在生成完整角色包…'
    : provider.connected && !contractReady
      ? '请重启生成服务以启用角色包'
      : provider.connected && !referenceReady
        ? '请先选择角色参考图'
        : provider.connected ? '生成完整角色包' : '连接服务后生成角色包';
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
  const outputs = job.outputs || [];
  els.emptyResult.hidden = Boolean(outputs.length);
  els.resultGrid.hidden = !outputs.length;
  if (outputs.length) renderAssetPackage(els.resultGrid, outputs, {
    resolveUrl: (url) => api.assetUrl(url),
    revision: job.updatedAt,
    resetKey: job.id,
  });
  const actionFrames = outputs.filter((output) => output.kind === 'frame');
  const completePackage = actionFrames.length >= 8 && actionFrames.length % 8 === 0;
  els.acceptBtn.hidden = job.status !== 'awaiting_review' || !completePackage;
  els.acceptBtn.disabled = false;
  els.libraryLink.hidden = job.status !== 'approved';
  els.editorLink.hidden = job.status !== 'approved';
  if (job.status === 'approved' && job.character) {
    const character = encodeURIComponent(job.character.id);
    els.libraryLink.href = './#/projects/windup-demo/assets';
    els.editorLink.href = `./review.html?character=${character}`;
  }
  if (job.status === 'awaiting_review') stepper.select('review');
  if (job.status === 'awaiting_review' && !completePackage) {
    els.jobMessage.textContent = '当前服务只返回了角色母版，未生成基础动作。请重启新版生成服务后重新创建。';
  }
  syncControls();
}

async function createCharacter(event) {
  event.preventDefault();
  if (!provider.requireConnection()) return;
  state.busy = true;
  stepper.select('review');
  els.emptyResult.hidden = false;
  els.resultGrid.hidden = true;
  els.jobTitle.textContent = '正在创建任务';
  els.jobMessage.textContent = '角色定义正在发送到生成服务…';
  els.jobPercent.textContent = '0%';
  els.jobProgress.style.width = '0%';
  syncControls();
  try {
    let referenceAssetId = null;
    const referenceFile = els.referenceInput.files[0];
    if (referenceFile) {
      els.jobTitle.textContent = '正在上传参考图';
      els.jobMessage.textContent = '服务端正在校验文件类型、尺寸和内容…';
      state.reference = await api.upload('/api/projects/windup-demo/references', referenceFile);
      referenceAssetId = state.reference.id;
      els.referenceMessage.textContent = `已上传 ${state.reference.width} × ${state.reference.height} · ${state.reference.id}`;
    }
    const job = await api.post('/api/characters/generations', {
      projectId: 'windup-demo',
      referenceAssetId,
      name: els.assetName.value.trim(),
      description: els.description.value.trim(),
      style: els.styleInput.value.trim(),
      palette: els.paletteInput.value.trim(),
      model: provider.model,
      starterActions: generationDefaults.starterPack.actions.filter((action) => (
        action === 'idle' ? els.starterIdle.checked : action === 'walk' ? els.starterWalk.checked : false
      )),
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
    els.jobMessage.textContent = `${job.character.label} 已携基础动作加入资产库，可直接进入审核台。`;
  } catch (error) {
    els.acceptBtn.disabled = false;
    els.acceptBtn.textContent = '确认并加入角色库';
    els.jobMessage.textContent = error.message;
  }
}

async function boot() {
  if (referenceRequired) {
    els.referenceField.classList.add('is-required');
    els.referenceMessage.textContent = '此入口需要先上传一张角色参考图。';
  }
  await provider.boot();
  if (provider.connected) stepper.select('define');
  syncControls();
}

document.querySelectorAll('[data-template]').forEach((button) => {
  button.addEventListener('click', () => {
    const template = templates[button.dataset.template];
    els.assetName.value = template.name;
    els.styleInput.value = template.style;
    els.paletteInput.value = template.palette;
    els.description.value = template.description;
    stepper.select(provider.connected ? 'define' : 'connect');
  });
});
document.querySelectorAll('.dice').forEach((button) => {
  button.addEventListener('click', () => {
    const pool = dicePools[button.dataset.dice];
    const input = button.dataset.dice === 'style' ? els.styleInput : els.paletteInput;
    input.value = pool[Math.floor(Math.random() * pool.length)];
  });
});
els.referenceInput.addEventListener('change', () => {
  const file = els.referenceInput.files[0];
  state.reference = null;
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = '';
  els.referencePreview.hidden = true;
  if (!file) {
    els.referenceMessage.textContent = referenceRequired
      ? '此入口需要先上传一张角色参考图。'
      : '不上传时将根据文字创建原创角色。';
    syncControls();
    return;
  }
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 10 * 1024 * 1024) {
    els.referenceInput.value = '';
    els.referenceMessage.textContent = '请选择小于 10 MB 的 PNG 或 JPEG。';
    syncControls();
    return;
  }
  state.previewUrl = URL.createObjectURL(file);
  els.referencePreview.src = state.previewUrl;
  els.referencePreview.hidden = false;
  els.referenceMessage.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB，提交时上传并校验。`;
  syncControls();
});
provider.bind();
els.createForm.addEventListener('submit', createCharacter);
els.acceptBtn.addEventListener('click', acceptCharacter);
boot();
