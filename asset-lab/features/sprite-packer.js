function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`图像加载失败：${source}`));
    image.src = source;
  });
}

function download(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
}

export async function buildSpritePack({ characterId, asset, frameUrl, frameOffset, anchor }) {
  const images = await Promise.all(asset.frames.map((_, index) => loadImage(frameUrl(index))));
  const cell = 256;
  const canvas = document.createElement('canvas');
  canvas.width = cell * images.length;
  canvas.height = cell;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const metadata = {
    frames: {},
    meta: {
      app: 'Windup Asset Lab',
      image: `${characterId}-${asset.key}.png`,
      format: 'RGBA8888',
      size: { w: canvas.width, h: canvas.height },
      scale: '1',
    },
  };

  images.forEach((image, index) => {
    const offset = frameOffset(index);
    context.drawImage(image, index * cell + offset.x, offset.y, cell, cell);
    metadata.frames[`${asset.key}_${String(index + 1).padStart(2, '0')}.png`] = {
      frame: { x: index * cell, y: 0, w: cell, h: cell },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cell, h: cell },
      sourceSize: { w: cell, h: cell },
      anchor: { x: (anchor.x / cell).toFixed(2), y: ((cell - anchor.y) / cell).toFixed(2) },
    };
  });

  const imageDataUrl = canvas.toDataURL('image/png');
  return {
    canvas,
    metadata,
    bytes: Math.round(imageDataUrl.length * 0.75),
    download() {
      download(imageDataUrl, `${characterId}-${asset.key}.png`);
      const jsonUrl = URL.createObjectURL(new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' }));
      download(jsonUrl, `${characterId}-${asset.key}.json`);
      setTimeout(() => URL.revokeObjectURL(jsonUrl), 0);
    },
  };
}
