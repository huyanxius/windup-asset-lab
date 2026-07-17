import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

const ASSETS_DIR   = path.join(ROOT, 'assets');
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts');
const LAB_DIR       = path.join(ROOT, 'asset-lab');
const BUILD_DIR     = path.join(ROOT, 'build', 'lamplighter-mvp');

const PORT_LAB      = 3000;
const PORT_GAME     = 3001;

const MIME = {
  '.html':   'text/html; charset=utf-8',
  '.js':     'application/javascript; charset=utf-8',
  '.mjs':    'application/javascript; charset=utf-8',
  '.css':    'text/css; charset=utf-8',
  '.png':    'image/png',
  '.gif':    'image/gif',
  '.svg':    'image/svg+xml',
  '.ico':    'image/x-icon',
  '.json':   'application/json; charset=utf-8',
  '.txt':    'text/plain; charset=utf-8',
  '.woff':   'font/woff',
  '.woff2':  'font/woff2',
  '.ttf':    'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.webp':   'image/webp',
  '.jpg':    'image/jpeg',
  '.jpeg':   'image/jpeg',
  '.webm':   'video/webm',
  '.mp4':    'video/mp4',
  '.zip':    'application/zip',
  '.csv':    'text/csv; charset=utf-8',
  '.parquet':'application/vnd.apache.parquet',
  '.glb':    'model/gltf-binary',
  '.gltf':   'application/json; charset=utf-8',
  '.meta':   'text/plain; charset=utf-8',
  '.jsonl':  'application/x-ndjson; charset=utf-8',
};

function getContentType(filepath) {
  return MIME[path.extname(filepath).toLowerCase()] || 'application/octet-stream';
}

function sendFile(res, filepath) {
  fs.readFile(filepath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': getContentType(filepath) });
    res.end(data);
  });
}

function createRouter(baseDir, mountPrefix) {
  return (urlPath) => {
    if (urlPath.startsWith(mountPrefix)) {
      const relative = urlPath.slice(mountPrefix.length);
      return path.join(baseDir, relative || 'index.html');
    }
    return null;
  };
}

const resolveAssets  = createRouter(ASSETS_DIR, '/assets');
const resolveArtifacts = createRouter(ARTIFACTS_DIR, '/artifacts');
const resolveBuild   = createRouter(BUILD_DIR, '/build');

function handleRequest(req, res) {
  const cleanPath = req.url.split('?')[0].split('#')[0];
  const normalized = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) || '/' : cleanPath;

  // 1. /assets/* -> project/assets/
  const assetsFile = resolveAssets(normalized);
  if (assetsFile) {
    sendFile(res, assetsFile);
    return;
  }

  // 2. /artifacts/* -> project/artifacts/
  const artifactsFile = resolveArtifacts(normalized);
  if (artifactsFile) {
    sendFile(res, artifactsFile);
    return;
  }

  // 3. /build/* -> project/build/
  const buildFile = resolveBuild(normalized);
  if (buildFile) {
    sendFile(res, buildFile);
    return;
  }

  // 4. Everything else -> asset-lab/
  const labFile = path.join(LAB_DIR, normalized === '/' ? 'index.html' : normalized);
  sendFile(res, labFile);
}

function startServer(port, label) {
  const server = http.createServer(handleRequest);
  server.listen(port, '127.0.0.1', () => {
    console.log(`  ${label.padEnd(14)} http://127.0.0.1:${port}`);
  });
  return server;
}

console.log('========================================');
console.log('  Windup Asset Lab — Unified Server');
console.log('========================================');
console.log();

startServer(PORT_LAB, 'Asset Lab');
startServer(PORT_GAME, 'Game Build');

console.log();
console.log('Mounted paths:');
console.log('  /assets/*     -> ./assets/');
console.log('  /artifacts/*  -> ./artifacts/');
console.log('  /build/*      -> ./build/lamplighter-mvp/');
console.log('  /*            -> ./asset-lab/');
console.log();
console.log('Press Ctrl+C to stop.');
