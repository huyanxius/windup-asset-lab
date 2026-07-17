import { createApiClient } from './core/api-client.js';
import { createJobPoller } from './core/job-poller.js';
import { characterCatalog, mergeCharacterRecords } from './data/character-catalog.js';
import { DEFAULT_DEMO_CHARACTER_ID } from './data/default-demo-character.js';
import { ProviderSessionController } from './features/provider-session-controller.js';
import { WorkflowStepper } from './features/workflow-stepper.js';
import { generationDefaults } from './data/generated-contract.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState','providerState','providerDot','apiKey','model','connectBtn','connectionMessage',
  'generationForm','character','characterPortrait','view','action','mode','frameField','frame','prompt','startBtn',
  'workflowSteps','candidateGrid','jobPercent','jobProgress','jobTitle','jobMessage','jobMetrics','strategyNote','acceptBtn','editorLink',
].map((id) => [id, $(id)]));
const api = createApiClient();
const poller = createJobPoller(api);
const state = { busy: false, job: null };
const stepper = new WorkflowStepper(els.workflowSteps, ['connect', 'define', 'review']);
const provider = new ProviderSessionController({
  api,
  elements: els,
  onChange: syncControls,
  onConnected: () => stepper.select('define'),
});

function syncControls() {
  els.startBtn.disabled = !provider.connected || state.busy || !provider.model;
  els.startBtn.textContent = state.busy ? '正在生成…' : provider.connected ? '开始生成候选资产' : '连接服务后开始生成';
  els.connectBtn.disabled = state.busy || provider.busy;
}

function syncCharacter() {
  els.characterPortrait.src = characterCatalog[els.character.value].base;
}

function syncMode() {
  const single = els.mode.value === 'single';
  els.frameField.style.opacity = single ? '1' : '.4';
  els.frame.disabled = !single;
  els.strategyNote.querySelector('b').textContent = single ? '1 次生成 → 1 帧修复' : '1 次生成 → 8 帧切分';
  els.strategyNote.querySelector('span').textContent = single
    ? '锁定角色母版与相位，只替换被退回的单帧'
    : '共享角色、比例、相机与地面线；坏帧可单独修复';
}

function renderJob(job) {
  state.job = job;
  state.busy = poller.isActive(job.status);
  els.jobPercent.textContent = `${job.progress || 0}%`;
  els.jobProgress.style.width = `${job.progress || 0}%`;
  els.jobTitle.textContent = job.batch || job.id;
  els.jobMessage.textContent = job.message || '';
  if (job.outputs?.length) {
    // 只追加新帧：整体重建会让所有图片换 URL 重新加载，预览闪烁且丢掉逐帧动画。
    if (els.candidateGrid.dataset.job !== job.id) {
      els.candidateGrid.replaceChildren();
      els.candidateGrid.dataset.job = job.id;
    }
    let added = 0;
    job.outputs.forEach((output) => {
      const key = output.path || output.url;
      if (els.candidateGrid.querySelector(`[data-key="${CSS.escape(key)}"]`)) return;
      const card = document.createElement('figure');
      card.className = 'candidate-card is-new';
      card.dataset.key = key;
      card.style.animationDelay = `${Math.min(added, 7) * 30}ms`;
      added += 1;
      const image = document.createElement('img');
      image.src = `${api.assetUrl(output.url)}?v=${encodeURIComponent(job.updatedAt || Date.now())}`;
      image.alt = `候选第 ${output.frameIndex + 1} 帧`;
      const caption = document.createElement('figcaption');
      const title = document.createElement('b');
      title.textContent = `#${String(output.frameIndex + 1).padStart(2, '0')}`;
      const meta = document.createElement('span');
      meta.textContent = job.request.mode === 'single' ? '单帧修复' : '动作条切帧';
      caption.append(title, meta);
      card.append(image, caption);
      els.candidateGrid.append(card);
    });
  }
  els.acceptBtn.hidden = job.status !== 'awaiting_review';
  els.acceptBtn.disabled = false;
  els.editorLink.hidden = job.status !== 'approved';
  if (job.quality || job.generationRoute) {
    const route = job.generationRoute === 'sheet' ? '一致性动作条' : job.generationRoute === 'frames-fallback' ? '逐帧回退' : '单帧生成';
    const calls = Number(job.sourceCallCount || 0);
    const continuity = job.quality?.geometryContinuity;
    els.jobMetrics.textContent = [route, `${calls} 次模型调用`, continuity == null ? '' : `几何连续性 ${continuity}`].filter(Boolean).join(' · ');
    els.jobMetrics.hidden = false;
  } else {
    els.jobMetrics.hidden = true;
  }
  if (job.status === 'awaiting_review') stepper.select('review');
  syncControls();
}

async function startGeneration(event) {
  event.preventDefault();
  if (!provider.requireConnection()) return;
  state.busy = true;
  stepper.select('review');
  els.candidateGrid.innerHTML = '<div class="empty-result"><i>◇</i><b>正在创建任务</b><span>整条动作生成后会自动切为 8 帧</span></div>';
  els.candidateGrid.dataset.job = '';
  syncControls();
  try {
    const job = await api.post('/api/generations', {
      character: els.character.value,
      view: els.view.value,
      action: els.action.value,
      mode: els.mode.value,
      route: generationDefaults.defaultRoute,
      frameIndex: Math.max(0, Math.min(7, Number(els.frame.value) - 1)),
      customPrompt: els.prompt.value.trim(),
      model: provider.model,
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
    stepper.select('define');
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
    const query = new URLSearchParams({ character: job.request.character, view: job.request.view, action: job.request.action });
    els.editorLink.href = `./review.html?${query}`;
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
  const [, charactersResult] = await Promise.allSettled([
    provider.boot(),
    api.get('/api/characters'),
  ]);
  if (charactersResult.status === 'fulfilled') {
    mergeCharacterRecords(charactersResult.value.characters, (path) => api.assetUrl(path));
  }
  els.character.replaceChildren(...Object.entries(characterCatalog).map(([id, item]) => new Option(item.label, id)));
  els.character.value = characterCatalog[query.get('character')]
    ? query.get('character')
    : DEFAULT_DEMO_CHARACTER_ID;
  syncCharacter();
  if (provider.connected) stepper.select('define');
  syncControls();
}

provider.bind();
els.character.addEventListener('change', syncCharacter);
els.mode.addEventListener('change', syncMode);
els.generationForm.addEventListener('submit', startGeneration);
els.acceptBtn.addEventListener('click', acceptGeneration);
boot();
