const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['serviceState','providerState','apiKey','model','connectBtn','assetName','description','createForm','createBtn','jobPanel','jobTitle','jobPercent','jobProgress','jobMessage','candidateImage','acceptBtn','characterList','assetCount','previewName','previewType','previewImage','previewDescription'].map((id) => [id,$(id)]));
let activeId = null;
let currentJob = null;
let pollTimer = null;

async function api(path, options = {}) {
  const response = await fetch(path, {...options, headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const data = await response.json().catch(() => ({error:`HTTP ${response.status}`}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function assetUrl(path) { return path.startsWith('/') ? path : `../${path}`; }

function selectCharacter(character) {
  activeId = character.id;
  els.previewName.textContent = character.label;
  els.previewType.textContent = character.custom ? '自建资产' : character.id === 'lamplighter' ? '项目角色' : '队友资产';
  els.previewImage.src = `${assetUrl(character.base)}?v=${Date.now()}`;
  els.previewDescription.textContent = character.description || character.cardData?.description || '已锁定的角色母版，可继续生成视角与动作资产。';
  document.querySelectorAll('.character-card').forEach((card) => card.classList.toggle('active', card.dataset.id === character.id));
}

async function loadCharacters(preferredId = activeId) {
  const data = await api('/api/characters');
  els.assetCount.textContent = data.characters.length;
  els.characterList.innerHTML = data.characters.map((character) => `
    <button class="character-card" data-id="${character.id}">
      <img src="${assetUrl(character.base)}" alt=""><span><b>${character.label}</b><small>${character.custom ? '自建角色母版' : '已锁定角色母版'}</small></span><em>›</em>
    </button>`).join('');
  els.characterList.querySelectorAll('button').forEach((button) => {
    const character = data.characters.find((item) => item.id === button.dataset.id);
    button.addEventListener('click', () => selectCharacter(character));
  });
  selectCharacter(data.characters.find((item) => item.id === preferredId) || data.characters[0]);
}

async function connectProvider() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) return els.apiKey.focus();
  els.connectBtn.disabled = true;
  els.connectBtn.textContent = '连接中…';
  try {
    await api('/api/provider/session',{method:'POST',headers:{'X-Windup-Request':'studio'},body:JSON.stringify({apiKey,model:els.model.value})});
    els.apiKey.value = '';
    els.providerState.textContent = '已连接 · 当前会话';
    els.connectBtn.textContent = '已连接';
  } catch (error) {
    els.providerState.textContent = error.message;
    els.connectBtn.textContent = '重试';
  } finally { els.connectBtn.disabled = false; }
}

function renderJob(job) {
  currentJob = job;
  els.jobPanel.hidden = false;
  els.jobTitle.textContent = job.batch || '创建任务';
  els.jobPercent.textContent = `${job.progress || 0}%`;
  els.jobProgress.style.width = `${job.progress || 0}%`;
  els.jobMessage.textContent = job.message || '';
  els.createBtn.disabled = ['queued','generating','processing'].includes(job.status);
  const output = job.outputs?.[0];
  els.candidateImage.hidden = !output;
  if (output) els.candidateImage.src = `${output.url}?v=${job.updatedAt || Date.now()}`;
  els.acceptBtn.hidden = job.status !== 'awaiting_review';
}

async function pollJob(id) {
  clearTimeout(pollTimer);
  try {
    const job = await api(`/api/generations/${id}`);
    renderJob(job);
    if (['queued','generating','processing'].includes(job.status)) pollTimer = setTimeout(() => pollJob(id),700);
  } catch (error) { els.jobMessage.textContent = error.message; els.createBtn.disabled = false; }
}

async function createCharacter(event) {
  event.preventDefault();
  els.createBtn.disabled = true;
  els.jobPanel.hidden = false;
  els.jobMessage.textContent = '正在创建任务…';
  try {
    const job = await api('/api/characters/generations',{method:'POST',body:JSON.stringify({name:els.assetName.value.trim(),description:els.description.value.trim()})});
    renderJob(job);
    pollJob(job.id);
  } catch (error) { els.jobMessage.textContent = error.message; els.createBtn.disabled = false; }
}

async function acceptCharacter() {
  if (!currentJob) return;
  els.acceptBtn.disabled = true;
  try {
    const job = await api(`/api/generations/${currentJob.id}/promote`,{method:'POST',body:'{}'});
    renderJob(job);
    els.acceptBtn.textContent = '已加入角色库';
    await loadCharacters(job.character.id);
  } catch (error) { els.jobMessage.textContent = error.message; els.acceptBtn.disabled = false; }
}

async function boot() {
  try {
    const [health,provider] = await Promise.all([api('/api/health'),api('/api/provider/models')]);
    els.serviceState.textContent = '生成服务已就绪';
    els.providerState.textContent = health.configured ? `${health.model} · 已配置` : '待配置';
    els.model.innerHTML = provider.models.map((model) => `<option value="${model}">${model}</option>`).join('');
    els.model.value = provider.selected;
    await loadCharacters();
  } catch (error) { els.serviceState.textContent = `服务未启动 · ${error.message}`; }
}

els.connectBtn.addEventListener('click',connectProvider);
els.apiKey.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();connectProvider();}});
els.createForm.addEventListener('submit',createCharacter);
els.acceptBtn.addEventListener('click',acceptCharacter);
boot();
