import { actionLabels } from '../data/generated-contract.js';

function markNew(node, order) {
  node.classList.add('is-new');
  node.style.animationDelay = `${Math.min(order, 7) * 70}ms`;
  node.addEventListener('animationend', () => {
    node.classList.remove('is-new');
    node.style.animationDelay = '';
  }, { once: true });
}

function imageFor(output, { resolveUrl, revision, alt }) {
  const image = document.createElement('img');
  image.src = `${resolveUrl(output.url)}?v=${encodeURIComponent(revision || Date.now())}`;
  image.alt = alt;
  image.dataset.key = output.path || output.url;
  return image;
}

export function renderAssetPackage(container, outputs, options) {
  const batch = String(options.resetKey || '');
  if (container.dataset.batch !== batch) {
    container.replaceChildren();
    container.dataset.batch = batch;
  }
  const base = outputs.find((output) => output.kind === 'base') || outputs[0];
  if (!base) {
    container.replaceChildren();
    return false;
  }
  let added = 0;
  if (!container.querySelector('.package-master')) {
    const master = document.createElement('figure');
    master.className = 'package-master';
    master.append(imageFor(base, { ...options, alt: '候选角色母版' }));
    const caption = document.createElement('figcaption');
    const title = document.createElement('b');
    title.textContent = '角色母版';
    const detail = document.createElement('span');
    detail.textContent = '身份与风格基准';
    caption.append(title, detail);
    master.append(caption);
    markNew(master, added);
    added += 1;
    container.append(master);
  }
  const groups = new Map();
  outputs.filter((output) => output.kind === 'frame').forEach((output) => {
    if (!groups.has(output.action)) groups.set(output.action, []);
    groups.get(output.action).push(output);
  });
  groups.forEach((frames, action) => {
    let section = container.querySelector(`.package-action[data-action="${CSS.escape(action)}"]`);
    if (!section) {
      section = document.createElement('section');
      section.className = 'package-action';
      section.dataset.action = action;
      const header = document.createElement('header');
      const actionTitle = document.createElement('b');
      actionTitle.textContent = actionLabels[action]?.[0] || action;
      header.append(actionTitle, document.createElement('small'));
      section.append(header, document.createElement('div'));
      markNew(section, added);
      container.append(section);
    }
    section.querySelector('header small').textContent = `${frames.length} 帧 · 8 FPS`;
    const strip = section.querySelector(':scope > div');
    const label = actionLabels[action]?.[0] || action;
    frames.sort((a, b) => a.frameIndex - b.frameIndex).forEach((output) => {
      const key = output.path || output.url;
      if (strip.querySelector(`[data-key="${CSS.escape(key)}"]`)) return;
      const image = imageFor(output, { ...options, alt: `${label}第 ${output.frameIndex + 1} 帧` });
      markNew(image, added);
      added += 1;
      strip.append(image);
    });
  });
  return true;
}
