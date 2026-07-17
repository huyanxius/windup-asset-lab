import { createDemoApiClient } from './core/demo-api-client.js';
import { characterRecords, generationJob } from './core/api-contract.js';
import { createJobPoller } from './core/job-poller.js';
import { characterCatalog, mergeCharacterRecords } from './data/character-catalog.js';
import { DEFAULT_DEMO_CHARACTER_ID } from './data/default-demo-character.js';
import { WorkflowStepper } from './features/workflow-stepper.js';
import { CONTRACT_VERSION, generationDefaults } from './data/generated-contract.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState',
  'generationForm','character','characterPortrait','view','action','mode','frameField','frame','prompt','startBtn',
  'workflowSteps','candidateGrid','jobPercent','jobProgress','jobTitle','jobMessage','jobMetrics','strategyNote','acceptBtn','editorLink',
].map((id) => [id, $(id)]));
const api = createDemoApiClient();
const poller = createJobPoller(api);
const state = { busy: false, job: null, catalogReady: false, ready: false, model: '' };
const stepper = new WorkflowStepper(els.workflowSteps, ['demo', 'define', 'review']);

function syncControls() {
  const ready = state.ready
    && state.catalogReady
    && !state.busy;
  els.startBtn.disabled = !ready;
  els.startBtn.textContent = state.busy
    ? '正在生成…'
    : !state.catalogReady
      ? '正在准备演示资产'
      : '开始生成演示候选';
}

function syncCharacter() {
  const character = characterCatalog[els.character.value];
  if (!character) throw new TypeError(`角色 ${els.character.value || '（空）'} 不存在，无法生成动作。`);
  els.characterPortrait.src = character.base;
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
  job = generationJob(job, CONTRACT_VERSION);
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
      card.style.animationDelay = `${Math.min(added, 7) * 70}ms`;
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
  if (!state.ready) return;
  if (!state.catalogReady) {
    els.jobTitle.textContent = '角色资产尚未同步';
    els.jobMessage.textContent = '演示资产尚未准备完成，请刷新页面重试。';
    return;
  }
  state.busy = true;
  stepper.select('review');
  els.candidateGrid.innerHTML = '<div class="empty-result"><i>◇</i><b>正在创建任务</b><span>整条动作生成后会自动切为 8 帧</span></div>';
  els.candidateGrid.dataset.job = '';
  syncControls();
  try {
    const job = generationJob(await api.post('/api/generations', {
      character: els.character.value,
      view: els.view.value,
      action: els.action.value,
      mode: els.mode.value,
      route: generationDefaults.defaultRoute,
      frameIndex: Math.max(0, Math.min(7, Number(els.frame.value) - 1)),
      customPrompt: els.prompt.value.trim(),
      model: state.model,
    }), CONTRACT_VERSION);
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
    const job = generationJob(
      await api.post(`/api/generations/${state.job.id}/promote`, {}),
      CONTRACT_VERSION,
    );
    renderJob(job);
    els.jobMessage.textContent = '演示候选已加入本地资产库，可返回审核台。';
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
  const [healthResult, charactersResult] = await Promise.allSettled([
    api.get('/api/health'),
    api.get('/api/characters'),
  ]);
  if (healthResult.status === 'fulfilled') {
    state.ready = true;
    state.model = healthResult.value.model;
    els.serviceState.textContent = healthResult.value.fallback
      ? '演示模式 · 内存保底'
      : '演示模式 · 本地保存';
  }
  try {
    if (charactersResult.status === 'rejected') throw charactersResult.reason;
    const records = characterRecords(charactersResult.value, CONTRACT_VERSION);
    mergeCharacterRecords(records, (path) => api.assetUrl(path));
    state.catalogReady = true;
  } catch (error) {
    state.catalogReady = true;
    els.jobTitle.textContent = '已启用内置资产保底';
    els.jobMessage.textContent = error?.message || '演示资产状态损坏，已回退到打包内置角色。';
  }
  els.character.replaceChildren(...Object.entries(characterCatalog).map(([id, item]) => new Option(item.label, id)));
  const requestedCharacter = query.get('character');
  if (requestedCharacter && !characterCatalog[requestedCharacter]) {
    els.jobTitle.textContent = '已回退到默认演示角色';
    els.jobMessage.textContent = `找不到 ${requestedCharacter}，已使用内置少年继续演示。`;
  }
  els.character.value = characterCatalog[requestedCharacter]
    ? requestedCharacter
    : DEFAULT_DEMO_CHARACTER_ID;
  syncCharacter();
  stepper.select('define');
  syncControls();
}

els.character.addEventListener('change', syncCharacter);
els.mode.addEventListener('change', syncMode);
els.generationForm.addEventListener('submit', startGeneration);
els.acceptBtn.addEventListener('click', acceptGeneration);
boot();
