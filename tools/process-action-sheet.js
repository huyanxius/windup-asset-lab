const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const [inputArg, outputDirArg, prefix = 'frame', columnsArg = '8'] = process.argv.slice(2);
if (!inputArg || !outputDirArg) {
  console.error('Usage: node tools/process-action-sheet.js <input> <output-dir> [prefix] [columns]');
  process.exit(1);
}

const input = path.resolve(inputArg);
const outputDir = path.resolve(outputDirArg);
const columns = Number(columnsArg);
const sheetDir = path.resolve(__dirname, '../assets/textures/character/sheets');
const transparentSheet = path.join(sheetDir, `${path.basename(outputDir)}-${prefix}.png`);

async function normalizeFrame(frame) {
  const trimmed = await sharp(frame)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
    .resize({ width: 224, height: 208, fit: 'inside', kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
  const info = await sharp(trimmed).metadata();
  return sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{
    input: trimmed,
    left: Math.round((256 - info.width) / 2),
    top: 238 - info.height,
  }]).png().toBuffer();
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(sheetDir, { recursive: true });
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const chromaTool = path.join(codexHome, 'skills/.system/imagegen/scripts/remove_chroma_key.py');
  execFileSync('python3', [
    chromaTool,
    '--input', input,
    '--out', transparentSheet,
    '--auto-key', 'border',
    '--soft-matte',
    '--transparent-threshold', '12',
    '--opaque-threshold', '220',
    '--edge-contract', '1',
    '--despill',
    '--force',
  ], { stdio: 'inherit' });

  const metadata = await sharp(transparentSheet).metadata();
  for (let index = 0; index < columns; index += 1) {
    const left = Math.round(index * metadata.width / columns);
    const right = Math.round((index + 1) * metadata.width / columns);
    const extracted = await sharp(transparentSheet)
      .extract({ left, top: 0, width: right - left, height: metadata.height })
      .png()
      .toBuffer();
    const normalized = await normalizeFrame(extracted);
    const name = `${prefix}-${String(index + 1).padStart(2, '0')}.png`;
    await fs.promises.writeFile(path.join(outputDir, name), normalized);
  }
  console.log(`Created ${columns} normalized frames in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
