import { createApiClient } from './core/api-client.js';

const $ = (id) => document.getElementById(id);
const els = {
  serviceState: $('serviceState'),
  characterList: $('characterList'),
  assetCount: $('assetCount'),
  previewName: $('previewName'),
  previewType: $('previewType'),
  previewImage: $('previewImage'),
  previewDescription: $('previewDescription'),
  previewActions: $('previewActions'),
  previewActionLink: $('previewActionLink'),
  previewEditorLink: $('previewEditorLink'),
};

const api = createApiClient();
let activeId = null;

function actionInventory(character) {
  const entries = Object.entries(character.assets || {}).flatMap(([view, actions]) => (
    Object.entries(actions || {}).map(([action, asset]) => ({ view, action, frames: asset.frames?.length || 0 }))
  ));
  return { entries, frameCount: entries.reduce((total, item) => total + item.frames, 0) };
}

function selectCharacter(character) {
  activeId = character.id;
  els.previewName.textContent = character.label;
  els.previewType.textContent = character.custom ? '自建资产' : character.id === 'lamplighter' ? '项目角色' : '队友资产';
  els.previewImage.src = `${api.assetUrl(character.base)}?v=${Date.now()}`;
  els.previewDescription.textContent = character.description || character.cardData?.description || '已锁定的角色母版，可继续生成视角与动作资产。';
  const inventory = actionInventory(character);
  els.previewActions.textContent = inventory.entries.length
    ? `${inventory.entries.length} 个动作 · ${inventory.frameCount} 帧 · 可直接进入审核台`
    : '尚无动作 · 请先生成至少一个完整动作';
  els.previewActionLink.href = `./generate.html?character=${encodeURIComponent(character.id)}`;
  els.previewActionLink.textContent = inventory.entries.length ? '继续生成动作 ↗' : '生成第一个动作 ↗';
  els.previewEditorLink.href = `./?character=${encodeURIComponent(character.id)}`;
  els.previewEditorLink.hidden = !inventory.entries.length;
  els.characterList.querySelectorAll('.character-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.id === character.id);
  });
}

function characterButton(character) {
  const button = document.createElement('button');
  button.className = 'character-card';
  button.dataset.id = character.id;
  const image = document.createElement('img');
  image.src = api.assetUrl(character.base);
  image.alt = '';
  const copy = document.createElement('span');
  const title = document.createElement('b');
  title.textContent = character.label;
  const meta = document.createElement('small');
  const inventory = actionInventory(character);
  meta.textContent = inventory.entries.length
    ? `${character.custom ? '自建角色' : '已锁定角色'} · ${inventory.entries.length} 动作 / ${inventory.frameCount} 帧`
    : `${character.custom ? '自建角色' : '已锁定角色'} · 尚无动作`;
  const arrow = document.createElement('em');
  arrow.textContent = '›';
  copy.append(title, meta);
  button.append(image, copy, arrow);
  button.addEventListener('click', () => selectCharacter(character));
  return button;
}

async function boot() {
  try {
    const data = await api.get('/api/characters');
    els.assetCount.textContent = data.characters.length;
    els.characterList.replaceChildren(...data.characters.map(characterButton));
    const requested = new URLSearchParams(location.search).get('character');
    const first = data.characters.find((item) => item.id === requested || item.id === activeId) || data.characters[0];
    if (first) selectCharacter(first);
    els.serviceState.textContent = `角色库已同步 · ${data.characters.length} 项`;
  } catch (error) {
    els.serviceState.textContent = `角色库不可用 · ${error.message}`;
  }
}

boot();
