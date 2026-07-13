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
  previewActionLink: $('previewActionLink'),
};

const api = createApiClient();
let activeId = null;

function selectCharacter(character) {
  activeId = character.id;
  els.previewName.textContent = character.label;
  els.previewType.textContent = character.custom ? '自建资产' : character.id === 'lamplighter' ? '项目角色' : '队友资产';
  els.previewImage.src = `${api.assetUrl(character.base)}?v=${Date.now()}`;
  els.previewDescription.textContent = character.description || character.cardData?.description || '已锁定的角色母版，可继续生成视角与动作资产。';
  els.previewActionLink.href = `./generate.html?character=${encodeURIComponent(character.id)}`;
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
  meta.textContent = character.custom ? '自建角色母版' : '已锁定角色母版';
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
    const first = data.characters.find((item) => item.id === activeId) || data.characters[0];
    if (first) selectCharacter(first);
    els.serviceState.textContent = `角色库已同步 · ${data.characters.length} 项`;
  } catch (error) {
    els.serviceState.textContent = `角色库不可用 · ${error.message}`;
  }
}

boot();
