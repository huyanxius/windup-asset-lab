function readGeometry(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] <= 24) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      opaque += 1;
      sumX += x;
      sumY += y;
    }
  }

  if (opaque === 0) return null;
  return {
    width: canvas.width,
    height: canvas.height,
    minX,
    maxX,
    minY,
    maxY,
    opaque,
    cx: sumX / opaque,
    cy: sumY / opaque,
  };
}

function loadGeometry(source) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(readGeometry(image));
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

export async function inspectAnimation(asset, resolveFrame) {
  const results = await Promise.all(asset.frames.map((_, index) => loadGeometry(resolveFrame(index))));
  const valid = results.filter(Boolean);
  if (valid.length === 0) {
    return {
      summary: `0 / 7 项通过 · 资产无法读取`,
      checks: [['资产可读取', false, '没有成功载入任何帧']],
    };
  }

  const feet = valid.map((item) => item.maxY);
  const heights = valid.map((item) => item.maxY - item.minY + 1);
  const footDrift = Math.max(...feet) - Math.min(...feet);
  const heightDrift = Math.max(...heights) - Math.min(...heights);
  const steps = valid.slice(1).map((item, index) =>
    Math.hypot(item.cx - valid[index].cx, item.cy - valid[index].cy),
  );
  const sortedSteps = [...steps].sort((a, b) => a - b);
  const medianStep = sortedSteps[Math.floor(sortedSteps.length / 2)] || 0;
  const maxStep = Math.max(...steps, 0);
  const areaDeltas = valid.slice(1).map((item, index) =>
    Math.abs(item.opaque - valid[index].opaque) / Math.max(item.opaque, valid[index].opaque) * 100,
  );
  const maxAreaDelta = Math.max(...areaDeltas, 0);
  const first = valid[0];
  const last = valid.at(-1);
  const seam = Math.hypot(first.cx - last.cx, first.cy - last.cy);
  const seamArea = Math.abs(first.opaque - last.opaque) / Math.max(first.opaque, last.opaque) * 100;
  const continuityPass = maxStep <= medianStep * 2.6 + 2;
  const areaPass = maxAreaDelta <= (asset.loop ? 18 : 28);
  const seamPass = !asset.loop || (seam <= 10 && seamArea <= 14);

  const checks = [
    ['画布一致', valid.length === asset.frames.length && valid.every((item) => item.width === 256 && item.height === 256), `${valid.length}/${asset.frames.length} · 256×256`],
    ['透明背景', valid.every((item) => item.opaque < 256 * 256 * 0.65), 'Alpha 通道可用'],
    ['脚底线偏差', footDrift <= 3, `${footDrift}px / 阈值 3px`],
    ['主体高度偏差', heightDrift <= 7, `${heightDrift}px / 阈值 7px`],
    ['相邻帧位移连续性', continuityPass, `最大 ${maxStep.toFixed(1)}px · 中值 ${medianStep.toFixed(1)}px`],
    ['轮廓面积波动', areaPass, `最大 ${maxAreaDelta.toFixed(1)}%`],
    ['循环首尾接缝', seamPass, asset.loop ? `位移 ${seam.toFixed(1)}px · 面积 ${seamArea.toFixed(1)}%` : '单次动作 · 不适用'],
  ];
  const passed = checks.filter((check) => check[1]).length;
  const score = Math.round((Number(continuityPass) + Number(areaPass) + Number(seamPass)) / 3 * 100);
  return { checks, summary: `${passed} / ${checks.length} 项通过 · 几何连续性 ${score}` };
}
