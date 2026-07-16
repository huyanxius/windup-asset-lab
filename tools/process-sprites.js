const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const input = path.join(root, 'artifacts/raw/character-youth-chibi-walk-v5.png');
const sheetOutput = path.join(root, 'assets/textures/character/lamplighter-sheet.png');
const framesDir = path.join(root, 'assets/textures/character/frames');

const columns = 8;
const rows = 1;
const actions = ['walk'];
const normalizedHeight = 208;
const normalizedWidth = 224;
const footLine = 238;

async function normalizeFrame(frame) {
  const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const visible = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const components = [];

  for (let i = 0; i < pixelCount; i += 1) visible[i] = data[i * 4 + 3] >= 24 ? 1 : 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (!visible[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    let componentLeft = info.width;
    let componentTop = info.height;
    let componentRight = -1;
    let componentBottom = -1;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % info.width;
      const y = Math.floor(index / info.width);
      size += 1;
      componentLeft = Math.min(componentLeft, x);
      componentTop = Math.min(componentTop, y);
      componentRight = Math.max(componentRight, x);
      componentBottom = Math.max(componentBottom, y);

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= info.width || nextY < 0 || nextY >= info.height) continue;
          const next = nextY * info.width + nextX;
          if (!visible[next] || visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    if (size >= 200) components.push({
      left: componentLeft,
      top: componentTop,
      right: componentRight,
      bottom: componentBottom,
    });
  }

  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  for (const component of components) {
    left = Math.min(left, component.left);
    top = Math.min(top, component.top);
    right = Math.max(right, component.right);
    bottom = Math.max(bottom, component.bottom);
  }

  if (right < left || bottom < top) return frame;

  const subject = await sharp(frame)
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize({
      width: normalizedWidth,
      height: normalizedHeight,
      fit: 'inside',
      kernel: sharp.kernel.nearest,
    })
    .png()
    .toBuffer();
  const subjectInfo = await sharp(subject).metadata();
  const x = Math.round((256 - subjectInfo.width) / 2);
  const y = footLine - subjectInfo.height;

  return sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: subject, left: x, top: y }]).png().toBuffer();
}

async function main() {
  fs.mkdirSync(framesDir, { recursive: true });
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const chromaTool = path.join(codexHome, 'skills/.system/imagegen/scripts/remove_chroma_key.py');
  execFileSync('python3', [
    chromaTool,
    '--input', input,
    '--out', sheetOutput,
    '--auto-key', 'border',
    '--soft-matte',
    '--transparent-threshold', '12',
    '--opaque-threshold', '220',
    '--edge-contract', '1',
    '--despill',
    '--force',
  ], { stdio: 'inherit' });

  const transparent = await fs.promises.readFile(sheetOutput);

  const metadata = await sharp(transparent).metadata();
  const frameWidth = Math.floor(metadata.width / columns);
  const frameHeight = Math.floor(metadata.height / rows);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const extractedFrame = await sharp(transparent)
        .extract({ left: column * frameWidth, top: row * frameHeight, width: frameWidth, height: frameHeight })
        .png()
        .toBuffer();
      const frame = await normalizeFrame(extractedFrame);
      const filename = `${actions[row]}-${String(column + 1).padStart(2, '0')}.png`;
      await fs.promises.writeFile(path.join(framesDir, filename), frame);
    }
  }

  console.log(`Created ${rows * columns} frames at ${frameWidth}x${frameHeight}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
