import { createApiClient } from './core/api-client.js';
import { createJobPoller } from './core/job-poller.js';
import { characterCatalog, mergeCharacterRecords } from './data/character-catalog.js';
import { ProviderSessionController } from './features/provider-session-controller.js';
import { WorkflowStepper } from './features/workflow-stepper.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'serviceState','providerState','providerDot','apiKey','model','connectBtn','connectionMessage',
  'generationForm','character','characterPortrait','view','action','mode','frameField','frame','prompt','startBtn',
  'workflowSteps','candidateGrid','jobPercent','jobProgress','jobTitle','jobMessage','acceptBtn','editorLink',
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
  if (job.status === 'awaiting_review') stepper.select('review');
  syncControls();
}

async function startGeneration(event) {
  event.preventDefault();
  if (!provider.requireConnection()) return;
  state.busy = true;
  stepper.select('review');
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
  els.character.value = characterCatalog[query.get('character')] ? query.get('character') : 'lamplighter';
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
