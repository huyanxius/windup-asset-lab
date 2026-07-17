import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const startupScript = new URL('../start.bat', import.meta.url);
const macStartupScript = new URL('../start.command', import.meta.url);
const backendScript = new URL('../server/app.py', import.meta.url);

test('Windows launcher starts the API-backed studio and Cocos runtime', async () => {
  const [source, backend] = await Promise.all([
    readFile(startupScript, 'utf8'),
    readFile(backendScript, 'utf8'),
  ]);

  assert.match(source, /-m server\.app --demo --port 5174/);
  assert.match(source, /http\.server 5173/);
  assert.match(source, /http:\/\/127\.0\.0\.1:5174\/asset-lab\//);
  assert.match(source, /\/api\/characters/);
  assert.doesNotMatch(source, /node server\.js/);
  assert.doesNotMatch(source, /http\.server 3000/);
  assert.match(backend, /default=5174/);
});

test('macOS launcher mirrors the API-backed studio and Cocos startup flow', async () => {
  const source = await readFile(macStartupScript, 'utf8');

  assert.match(source, /^#!\/usr\/bin\/env bash/);
  assert.match(source, /dirname "\$0"/);
  assert.match(source, /sys\.version_info >= \(3, 11\)/);
  assert.match(source, /from PIL import Image/);
  assert.match(source, /-m server\.app --demo --port 5174/);
  assert.match(source, /http\.server 5173/);
  assert.match(source, /http:\/\/127\.0\.0\.1:5174\/api\/characters/);
  assert.match(source, /open "http:\/\/127\.0\.0\.1:5174\/asset-lab\/"/);
  assert.match(source, /trap cleanup/);
  assert.doesNotMatch(source, /node server\.js/);
});
