const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const args = process.argv.slice(2);
const framesDirArg = args[0];
const prefix = args[1];
const valueOf = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

if (!framesDirArg || !prefix) {
  console.error('Usage: node tools/audit-animation.js <frames-dir> <prefix> [--loop] [--profile locomotion|jump|oneshot] [--fps 8] [--out output-base]');
  process.exit(1);
}

const framesDir = path.resolve(framesDirArg);
const loop = args.includes('--loop');
const profile = valueOf('--profile', loop ? 'locomotion' : 'oneshot');
const fps = Number(valueOf('--fps', '8'));
const defaultOut = path.resolve(__dirname, `../reports/qc-${prefix}`);
const outputBase = path.resolve(valueOf('--out', defaultOut));
const alphaThreshold = 24;

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function inspectFrame(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  let opaque = 0;
  let transparent = 0;
  let sumX = 0;
  let sumY = 0;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= 4) transparent += 1;
      if (alpha <= alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      opaque += 1;
      sumX += x;
      sumY += y;
    }
  }

  if (!opaque) throw new Error(`${path.basename(file)} has no visible subject.`);
  return {
    file: path.basename(file),
    width: info.width,
    height: info.height,
    opaque,
    transparentRatio: transparent / (info.width * info.height),
    bbox: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 },
    centroid: { x: sumX / opaque, y: sumY / opaque },
  };
}

function check(name, pass, detail, recommendation) {
  return { name, pass, detail, recommendation: pass === false ? recommendation : undefined };
}

async function main() {
  if (!fs.existsSync(framesDir)) throw new Error(`Frames directory not found: ${framesDir}`);
  const matcher = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d+\\.png$`, 'i');
  const files = fs.readdirSync(framesDir).filter((name) => matcher.test(name)).sort().map((name) => path.join(framesDir, name));
  if (!files.length) throw new Error(`No frames found for prefix "${prefix}" in ${framesDir}`);

  const frames = await Promise.all(files.map(inspectFrame));
  const feet = frames.map((frame) => frame.bbox.maxY);
  const heights = frames.map((frame) => frame.bbox.height);
  const footDrift = Math.max(...feet) - Math.min(...feet);
  const heightDrift = Math.max(...heights) - Math.min(...heights);
  const steps = frames.slice(1).map((frame, index) => Math.hypot(
    frame.centroid.x - frames[index].centroid.x,
    frame.centroid.y - frames[index].centroid.y,
  ));
  const medianStep = median(steps);
  const maxStep = Math.max(...steps, 0);
  const areaDeltas = frames.slice(1).map((frame, index) => (
    Math.abs(frame.opaque - frames[index].opaque) / Math.max(frame.opaque, frames[index].opaque) * 100
  ));
  const maxAreaDelta = Math.max(...areaDeltas, 0);
  const first = frames[0];
  const last = frames[frames.length - 1];
  const seamDistance = Math.hypot(first.centroid.x - last.centroid.x, first.centroid.y - last.centroid.y);
  const seamAreaDelta = Math.abs(first.opaque - last.opaque) / Math.max(first.opaque, last.opaque) * 100;
  const footPass = profile === 'jump' ? null : footDrift <= 3;
  const areaThreshold = profile === 'jump' ? 28 : 18;

  const checks = [
    check('帧数', frames.length >= 4, `${frames.length} 帧`, '动作帧数过少，请增加关键相位。'),
    check('画布一致', frames.every((frame) => frame.width === 256 && frame.height === 256), `${frames.length}/${frames.length} 帧已读取`, '统一输出为 256×256。'),
    check('透明背景', frames.every((frame) => frame.transparentRatio >= 0.3), `最低透明区比例 ${(Math.min(...frames.map((frame) => frame.transparentRatio)) * 100).toFixed(1)}%`, '检查色键抠图和 Alpha 通道。'),
    check('脚底线偏差', footPass, profile === 'jump' ? '跳跃动作不使用固定脚底线判定' : `${footDrift}px / 阈值 3px`, '重新对齐脚底锚点。'),
    check('主体高度偏差', heightDrift <= 7 || profile === 'jump', `${heightDrift}px / 基准 7px`, '统一人物缩放，检查是否切入了多余区域。'),
    check('相邻帧位移连续性', maxStep <= medianStep * 2.6 + 2, `最大 ${maxStep.toFixed(1)}px，中值 ${medianStep.toFixed(1)}px`, '检查跳变帧、错序帧或不稳定的人物位置。'),
    check('轮廓面积波动', maxAreaDelta <= areaThreshold, `最大 ${maxAreaDelta.toFixed(1)}% / 阈值 ${areaThreshold}%`, '检查人物是否忽大忽小或服装轮廓突变。'),
    check('循环首尾接缝', loop ? seamDistance <= 10 && seamAreaDelta <= 14 : null, loop ? `位移 ${seamDistance.toFixed(1)}px，面积 ${seamAreaDelta.toFixed(1)}%` : '单次动作，不适用', '调整首尾帧姿势或重新排序循环。'),
  ];

  const applicable = checks.filter((item) => item.pass !== null);
  const passed = applicable.filter((item) => item.pass).length;
  const failures = applicable.filter((item) => !item.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    input: { framesDir, prefix, frames: frames.length, fps, loop, profile },
    score: Math.round(passed / applicable.length * 100),
    passed: failures.length === 0,
    metrics: { footDrift, heightDrift, maxStep, medianStep, maxAreaDelta, seamDistance, seamAreaDelta },
    checks,
    frames,
  };

  const status = (pass) => pass === null ? '—' : pass ? '✓' : '✗';
  const markdown = `# ${prefix} 动画自动质检\n\n` +
    `- 目录：\`${framesDir}\`\n- 帧数：${frames.length}\n- 播放：${fps} FPS·${loop ? '循环' : '单次'}\n- 规则模板：${profile}\n- 得分：**${report.score} / 100**\n- 结果：**${report.passed ? '通过' : '需处理'}**\n\n` +
    `| 检查项 | 结果 | 详情 |\n|---|---:|---|\n` +
    checks.map((item) => `| ${item.name} | ${status(item.pass)} | ${item.detail} |`).join('\n') +
    (failures.length ? `\n\n## 建议\n\n${failures.map((item) => `- **${item.name}**：${item.recommendation}`).join('\n')}` : '\n\n未发现超出当前阈值的工程问题。') + '\n';

  fs.mkdirSync(path.dirname(outputBase), { recursive: true });
  fs.writeFileSync(`${outputBase}.json`, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(`${outputBase}.md`, markdown);
  console.log(`${report.passed ? 'PASS' : 'REVIEW'} ${prefix}: ${report.score}/100`);
  console.log(`Markdown: ${outputBase}.md`);
  console.log(`JSON: ${outputBase}.json`);
  if (failures.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
