import { createApiClient } from './core/api-client.js';
import {
  characterSummary,
  expectedFrameCount,
  viewAssets,
  viewOrder,
  viewSummary,
} from './features/asset-library-model.js';
import { viewLabels } from './data/generated-contract.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries([
  'libraryShell', 'serviceState', 'assetCount', 'characterList', 'libraryState',
  'libraryStateTitle', 'libraryStateCopy', 'libraryStateAction', 'retryLibraryBtn',
  'characterSearch', 'searchEmpty',
  'outfitWorkspace', 'characterCrumb', 'outfitDescription', 'primaryActionLink',
  'masterImage', 'masterPlaceholder', 'masterState', 'characterName',
  'masterDescription', 'viewTabs', 'viewSummary', 'actionShelf',
].map((id) => [id, $(id)]));

const api = createApiClient();
let characters = [];
let activeCharacter = null;
let activeView = viewOrder[0];

function editorUrl(characterId, asset) {
  const query = new URLSearchParams({ character: characterId });
  if (asset) {
    query.set('view', asset.view);
    query.set('action', asset.action);
  }
  return `./?${query}`;
}

function generationUrl(characterId, asset) {
  const query = new URLSearchParams({ character: characterId, mode: 'full' });
  if (asset) {
    query.set('view', asset.view);
    query.set('action', asset.action);
  }
  return `./generate.html?${query}`;
}

function compactViewLabel(view) {
  return viewLabels[view]?.[0]
    .replace('真实', '')
    .replace('资产', '') || view;
}

function typeLabel(character) {
  if (character.custom) return '自建角色';
  if (character.id === 'lamplighter') return '项目角色';
  return '导入角色';
}

function setLibraryState(type, error = '') {
  const empty = type === 'empty';
  const failed = type === 'error';
  els.libraryState.hidden = type === 'ready';
  els.characterList.hidden = type !== 'ready';
  els.outfitWorkspace.hidden = type !== 'ready';
  els.retryLibraryBtn.hidden = !failed;
  els.libraryStateAction.hidden = !empty;

  if (empty) {
    els.libraryStateTitle.textContent = '还没有角色';
    els.libraryStateCopy.textContent = '创建第一个角色，资产会从这里开始生长。';
  }
  if (failed) {
    els.libraryStateTitle.textContent = '资产库暂时不可用';
    els.libraryStateCopy.textContent = error || '请确认本地生成服务已经启动。';
  }
}

function characterItem(character) {
  const stats = characterSummary(character);
  const item = document.createElement('div');
  item.className = 'character-item';
  item.dataset.id = character.id;

  const button = document.createElement('button');
  button.className = 'character-button';
  button.type = 'button';
  button.setAttribute('aria-pressed', 'false');

  const image = document.createElement('img');
  image.src = api.assetUrl(character.base);
  image.alt = '';

  const copy = document.createElement('span');
  const name = document.createElement('b');
  name.textContent = character.label;
  const meta = document.createElement('small');
  meta.textContent = `${typeLabel(character)} · ${stats.entries.length} 个动作`;
  copy.append(name, meta);

  const arrow = document.createElement('i');
  arrow.textContent = '›';
  button.append(image, copy, arrow);

  const outfit = document.createElement('button');
  outfit.className = 'outfit-button';
  outfit.type = 'button';
  outfit.innerHTML = '<i></i><span><b>默认造型</b><small>母版与动作资产</small></span>';

  button.addEventListener('click', () => selectCharacter(character));
  outfit.addEventListener('click', () => selectCharacter(character));
  item.append(button, outfit);
  return item;
}

function statusCopy(asset) {
  if (asset.status === 'ready') return ['可检查', `${asset.frames} 帧`];
  if (asset.status === 'partial') return ['待补全', `${asset.frames} / ${expectedFrameCount} 帧`];
  return ['资产缺口', '尚未生成'];
}

function actionCard(character, asset) {
  const card = document.createElement('article');
  card.className = `action-card ${asset.status}`;
  const [stateText, frameText] = statusCopy(asset);

  const preview = document.createElement('div');
  preview.className = 'action-preview';
  if (asset.asset?.frames?.[0]) {
    const image = document.createElement('img');
    image.src = api.assetUrl(asset.asset.frames[0]);
    image.alt = '';
    preview.append(image);
  } else {
    const placeholder = document.createElement('span');
    placeholder.textContent = '＋';
    placeholder.setAttribute('aria-hidden', 'true');
    preview.append(placeholder);
  }

  const copy = document.createElement('div');
  copy.className = 'action-copy';
  const title = document.createElement('h3');
  title.textContent = asset.actionLabel;
  const type = document.createElement('small');
  type.textContent = `${asset.actionType} · ${frameText}`;
  copy.append(title, type);

  const state = document.createElement('div');
  state.className = 'action-state';
  state.innerHTML = `<span>${stateText}</span><small>${frameText}</small>`;

  const link = document.createElement('a');
  link.href = asset.status === 'ready'
    ? editorUrl(character.id, asset)
    : generationUrl(character.id, asset);
  link.textContent = asset.status === 'ready' ? '打开检查' : '生成补全';
  link.setAttribute('aria-label', `${link.textContent}：${asset.actionLabel}`);

  card.append(preview, copy, state, link);
  return card;
}

function updatePrimaryAction(character) {
  const assets = viewAssets(character, activeView);
  const incomplete = assets.find((asset) => asset.status === 'partial')
    || assets.find((asset) => asset.status === 'missing');
  const existing = assets.find((asset) => asset.status === 'ready');

  if (incomplete) {
    els.primaryActionLink.href = generationUrl(character.id, incomplete);
    els.primaryActionLink.textContent = incomplete.status === 'partial'
      ? `继续补全${incomplete.actionLabel}`
      : `生成${incomplete.actionLabel}`;
    return;
  }

  els.primaryActionLink.href = existing
    ? editorUrl(character.id, existing)
    : generationUrl(character.id);
  els.primaryActionLink.textContent = existing ? '检查动作资产' : '生成第一个动作';
}

function renderViewTabs(character) {
  const tabs = viewOrder.map((view) => {
    const stats = viewSummary(character, view);
    const button = document.createElement('button');
    const selected = view === activeView;
    button.type = 'button';
    button.className = selected ? 'active' : '';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(selected));
    button.innerHTML = `<span>${compactViewLabel(view)}</span><small>${stats.readyCount}/${stats.cellCount}</small>`;
    button.addEventListener('click', () => selectView(view));
    return button;
  });
  els.viewTabs.replaceChildren(...tabs);
}

function renderActionShelf(character) {
  const assets = viewAssets(character, activeView);
  const stats = viewSummary(character, activeView);
  els.viewSummary.textContent = `${compactViewLabel(activeView)} · ${stats.readyCount} 个可检查 · ${stats.partialCount + stats.missingCount} 个待补全`;
  els.actionShelf.replaceChildren(...assets.map((asset) => actionCard(character, asset)));
  updatePrimaryAction(character);
}

function syncUrl() {
  const query = new URLSearchParams({ character: activeCharacter.id, view: activeView });
  history.replaceState(null, '', `?${query}`);
}

function selectView(view) {
  activeView = viewOrder.includes(view) ? view : viewOrder[0];
  renderViewTabs(activeCharacter);
  renderActionShelf(activeCharacter);
  syncUrl();
}

function selectCharacter(character) {
  activeCharacter = character;
  els.characterCrumb.textContent = character.label;
  els.characterName.textContent = character.label;
  els.outfitDescription.textContent = `正在查看 ${character.label} 的默认造型。切换视角，只看当前需要处理的动作。`;
  els.masterDescription.textContent = `${character.label} 默认造型的身份和外观基准。后续视角与动作都以这张母版保持一致。`;
  els.masterState.textContent = `${typeLabel(character)} · 只读基准`;
  els.masterImage.hidden = false;
  els.masterPlaceholder.hidden = true;
  els.masterImage.src = api.assetUrl(character.base);

  els.characterList.querySelectorAll('.character-item').forEach((item) => {
    const selected = item.dataset.id === character.id;
    item.classList.toggle('active', selected);
    item.querySelector('.character-button').setAttribute('aria-pressed', String(selected));
  });

  renderViewTabs(character);
  renderActionShelf(character);
  syncUrl();
}

function renderCharacters(items) {
  characters = items;
  els.assetCount.textContent = String(items.length);
  if (!items.length) {
    setLibraryState('empty');
    return;
  }

  setLibraryState('ready');
  els.characterList.replaceChildren(...items.map(characterItem));
  const query = new URLSearchParams(location.search);
  const requestedCharacter = query.get('character');
  const requestedView = query.get('view');
  activeView = viewOrder.includes(requestedView) ? requestedView : viewOrder[0];
  selectCharacter(items.find((item) => item.id === requestedCharacter) || items[0]);
}

function filterCharacters() {
  const query = els.characterSearch.value.trim().toLocaleLowerCase();
  let visibleCount = 0;
  els.characterList.querySelectorAll('.character-item').forEach((item) => {
    const character = characters.find((candidate) => candidate.id === item.dataset.id);
    const visible = !query || character?.label.toLocaleLowerCase().includes(query);
    item.hidden = !visible;
    if (visible) visibleCount += 1;
  });
  els.searchEmpty.hidden = visibleCount > 0;
}

async function boot() {
  els.libraryShell.setAttribute('aria-busy', 'true');
  els.serviceState.textContent = '正在读取…';
  els.serviceState.className = 'service-state loading';
  try {
    const data = await api.get('/api/characters');
    renderCharacters(Array.isArray(data.characters) ? data.characters : []);
    els.serviceState.textContent = '已同步';
    els.serviceState.className = 'service-state ready';
  } catch (error) {
    characters = [];
    els.assetCount.textContent = '0';
    setLibraryState('error', error.message);
    els.serviceState.textContent = '连接失败';
    els.serviceState.className = 'service-state error';
  } finally {
    els.libraryShell.setAttribute('aria-busy', 'false');
  }
}

els.masterImage.addEventListener('error', () => {
  els.masterImage.hidden = true;
  els.masterPlaceholder.hidden = false;
});
els.retryLibraryBtn.addEventListener('click', boot);
els.characterSearch.addEventListener('input', filterCharacters);

boot();
