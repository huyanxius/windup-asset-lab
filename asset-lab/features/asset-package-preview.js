import { actionLabels } from '../data/generated-contract.js';

function imageFor(output, { resolveUrl, revision, alt }) {
  const image = document.createElement('img');
  image.src = `${resolveUrl(output.url)}?v=${encodeURIComponent(revision || Date.now())}`;
  image.alt = alt;
  return image;
}

export function renderAssetPackage(container, outputs, options) {
  const base = outputs.find((output) => output.kind === 'base') || outputs[0];
  if (!base) {
    container.replaceChildren();
    return false;
  }
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

  const groups = new Map();
  outputs.filter((output) => output.kind === 'frame').forEach((output) => {
    if (!groups.has(output.action)) groups.set(output.action, []);
    groups.get(output.action).push(output);
  });
  const strips = [...groups].map(([action, frames]) => {
    const section = document.createElement('section');
    section.className = 'package-action';
    const header = document.createElement('header');
    const actionTitle = document.createElement('b');
    actionTitle.textContent = actionLabels[action]?.[0] || action;
    const meta = document.createElement('small');
    meta.textContent = `${frames.length} 帧 · 8 FPS`;
    header.append(actionTitle, meta);
    const strip = document.createElement('div');
    strip.append(...frames.sort((a, b) => a.frameIndex - b.frameIndex).map((output) => (
      imageFor(output, { ...options, alt: `${actionTitle.textContent}第 ${output.frameIndex + 1} 帧` })
    )));
    section.append(header, strip);
    return section;
  });
  container.replaceChildren(master, ...strips);
  return true;
}
