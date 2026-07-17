import { characterCatalog } from '../data/character-catalog.js';
import { CONTRACT_VERSION, FIXED_FPS } from '../data/generated-contract.js';

const STORAGE_KEY = 'windup-demo-api-v1';
const BUILTIN_IDS = Object.freeze(['boy', 'lamplighter', 'skeleton', 'lirael']);
const DEMO_MODEL = 'windup-demo-fixture-v1';
const REVIEW_STATES = new Set(['pass', 'pending', 'reject']);

export class DemoApiError extends Error {
  constructor(message, status = 400, payload = {}) {
    super(message);
    this.name = 'DemoApiError';
    this.status = status;
    this.payload = payload;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyState() {
  return { sequence: 0, jobs: {}, characters: [], reviews: {} };
}

function safeBrowserStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function validState(value) {
  return value
    && typeof value === 'object'
    && value.jobs && typeof value.jobs === 'object'
    && Array.isArray(value.characters)
    && value.reviews && typeof value.reviews === 'object';
}

function createStateStore(storage) {
  let persistent = Boolean(storage);
  let state = emptyState();
  if (persistent) {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
      if (validState(parsed)) state = parsed;
    } catch {
      persistent = false;
    }
  }

  function save() {
    if (!persistent) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      persistent = false;
    }
  }

  return {
    get persistent() { return persistent; },
    get state() { return state; },
    save,
  };
}

function assetsFromLibrary(library) {
  return Object.fromEntries(Object.entries(library || {}).map(([view, viewRecord]) => {
    const actions = Object.fromEntries(Object.entries(viewRecord)
      .filter(([, action]) => action && Array.isArray(action.frames))
      .map(([action, value]) => [action, {
        frames: [...value.frames],
        fps: value.fps || FIXED_FPS,
        loop: value.loop !== false,
      }]));
    return [view, actions];
  }));
}

function builtinCharacters() {
  return BUILTIN_IDS.map((id) => {
    const character = characterCatalog[id];
    return {
      id,
      label: character.label,
      description: character.description || 'Windup 内置演示角色。',
      base: character.base,
      custom: false,
      demoOverride: true,
      assets: assetsFromLibrary(character.library),
    };
  });
}

function mergeCharacters(overrides) {
  const records = new Map(builtinCharacters().map((record) => [record.id, record]));
  overrides.forEach((record) => records.set(record.id, record));
  return [...records.values()].map(clone);
}

function chooseFixture(text) {
  const fixtures = ['boy', 'lamplighter', 'skeleton', 'lirael'];
  const score = [...String(text)].reduce((total, character) => total + character.codePointAt(0), 0);
  return builtinCharacters().find((record) => record.id === fixtures[score % fixtures.length]);
}

function framesFor(record, view, action) {
  return record.assets?.[view]?.[action]?.frames
    || record.assets?.side?.[action]?.frames
    || builtinCharacters().find((item) => item.id === 'boy').assets.side[action]?.frames
    || builtinCharacters().find((item) => item.id === 'boy').assets.side.walk.frames;
}

function frameOutputs(jobId, frames, { view, action, singleFrame = null }) {
  const selected = singleFrame == null ? frames : [frames[singleFrame % frames.length]];
  return selected.map((url, index) => {
    const frameIndex = singleFrame == null ? index : singleFrame;
    return {
      kind: 'frame',
      action,
      view,
      frameIndex,
      file: `${action}-${String(frameIndex + 1).padStart(2, '0')}.png`,
      path: `demo/${jobId}/${view}/${action}-${String(frameIndex + 1).padStart(2, '0')}.png`,
      url,
    };
  });
}

function characterOutputs(job) {
  const request = job.request;
  const fixture = chooseFixture([
    request.name,
    request.description,
    request.style,
    request.palette,
    request.referenceAssetId,
  ].join('|'));
  const outputs = [{
    kind: 'base',
    file: 'base.png',
    path: `demo/${job.id}/base.png`,
    url: fixture.base,
  }];
  request.starterActions.forEach((action) => {
    outputs.push(...frameOutputs(
      job.id,
      framesFor(fixture, request.starterView, action),
      { view: request.starterView, action },
    ));
  });
  return { fixture, outputs };
}

function actionOutputs(job, characters) {
  const request = job.request;
  const character = characters.find((record) => record.id === request.character)
    || builtinCharacters()[0];
  const frames = framesFor(character, request.view, request.action);
  return frameOutputs(job.id, frames, {
    view: request.view,
    action: request.action,
    singleFrame: request.mode === 'single' ? request.frameIndex : null,
  });
}

function nowIso() {
  return new Date().toISOString();
}

export function createDemoApiClient({ storage = safeBrowserStorage() } = {}) {
  const store = createStateStore(storage);

  function nextId(prefix) {
    store.state.sequence += 1;
    store.save();
    return `${prefix}${String(store.state.sequence).padStart(8, '0')}`.slice(0, 12);
  }

  function characters() {
    return mergeCharacters(store.state.characters);
  }

  function saveJob(job) {
    store.state.jobs[job.id] = job;
    store.save();
    return clone(job);
  }

  function getJob(jobId, advance = false) {
    const job = store.state.jobs[jobId];
    if (!job) throw new DemoApiError('演示任务不存在或已被清理。', 404);
    if (advance && ['queued', 'generating', 'processing'].includes(job.status)) {
      job.pollCount = Number(job.pollCount || 0) + 1;
      if (job.pollCount === 1) {
        job.status = 'generating';
        job.progress = 35;
        job.message = '演示素材正在组装…';
      } else if (job.pollCount === 2) {
        job.status = 'processing';
        job.progress = 80;
        job.outputs = job.demoOutputs;
        job.message = '演示帧正在完成本地质检…';
      } else {
        job.status = 'awaiting_review';
        job.progress = 100;
        job.outputs = job.demoOutputs;
        job.message = '演示候选已准备完成，请确认后入库。';
      }
      job.updatedAt = nowIso();
      store.save();
    }
    return clone(job);
  }

  function upsertCharacter(record) {
    const index = store.state.characters.findIndex((item) => item.id === record.id);
    if (index >= 0) store.state.characters[index] = record;
    else store.state.characters.push(record);
    store.save();
  }

  async function get(path) {
    if (path === '/api/health') {
      return {
        ok: true,
        demo: true,
        fallback: !store.persistent,
        provider: 'Windup 内置演示引擎',
        model: DEMO_MODEL,
        contractVersion: CONTRACT_VERSION,
        fps: FIXED_FPS,
      };
    }
    if (path === '/api/characters') {
      return { contractVersion: CONTRACT_VERSION, characters: characters() };
    }
    const generation = path.match(/^\/api\/generations\/([a-z0-9]+)$/);
    if (generation) return getJob(generation[1], true);
    if (path.startsWith('/api/reviews?')) {
      const query = new URL(path, 'https://demo.invalid').searchParams;
      const key = query.get('key') || '';
      const length = Math.max(0, Number(query.get('length') || 0));
      const defaults = (query.get('defaults') || '').split(',').filter(Boolean);
      if (!store.state.reviews[key]) {
        store.state.reviews[key] = {
          key,
          version: 1,
          reviews: Array.from({ length }, (_, index) => defaults[index] || query.get('initial') || 'pending'),
        };
        store.save();
      }
      return clone(store.state.reviews[key]);
    }
    throw new DemoApiError(`演示接口不存在：${path}`, 404);
  }

  async function post(path, body = {}) {
    if (path === '/api/characters/generations') {
      const id = nextId('dc');
      const characterId = `demo-${String(store.state.sequence).padStart(4, '0')}`;
      const request = {
        type: 'character',
        character: characterId,
        name: String(body.name || '演示角色').trim(),
        description: String(body.description || 'Windup 演示角色').trim(),
        style: String(body.style || '').trim(),
        palette: String(body.palette || '').trim(),
        model: DEMO_MODEL,
        projectId: 'windup-demo',
        referenceAssetId: body.referenceAssetId || null,
        sourceType: body.referenceAssetId ? 'demo_reference' : 'demo_text',
        starterView: 'side',
        starterActions: Array.isArray(body.starterActions) && body.starterActions.length
          ? [...body.starterActions]
          : ['idle', 'walk'],
        generationRoute: 'demo-fixture',
      };
      const job = {
        id,
        batch: `DEMO-C-${String(store.state.sequence).padStart(4, '0')}`,
        contractVersion: CONTRACT_VERSION,
        status: 'queued',
        progress: 0,
        message: '演示角色包已进入本地队列。',
        request,
        outputs: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        pollCount: 0,
      };
      const generated = characterOutputs(job);
      job.demoFixtureId = generated.fixture.id;
      job.demoOutputs = generated.outputs;
      return saveJob(job);
    }
    if (path === '/api/generations') {
      const id = nextId('da');
      const request = {
        character: String(body.character || 'boy'),
        view: String(body.view || 'side'),
        action: String(body.action || 'walk'),
        mode: body.mode === 'single' ? 'single' : 'full',
        frameIndex: Math.max(0, Math.min(7, Number(body.frameIndex || 0))),
        fps: FIXED_FPS,
        customPrompt: String(body.customPrompt || ''),
        model: DEMO_MODEL,
        generationRoute: 'demo-fixture',
      };
      const job = {
        id,
        batch: `DEMO-A-${String(store.state.sequence).padStart(4, '0')}`,
        contractVersion: CONTRACT_VERSION,
        status: 'queued',
        progress: 0,
        message: '演示动作已进入本地队列。',
        request,
        outputs: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
        pollCount: 0,
        generationRoute: 'demo-fixture',
        sourceCallCount: 0,
      };
      job.demoOutputs = actionOutputs(job, characters());
      return saveJob(job);
    }
    const promote = path.match(/^\/api\/generations\/([a-z0-9]+)\/promote$/);
    if (promote) {
      const job = store.state.jobs[promote[1]];
      if (!job || job.status !== 'awaiting_review') {
        throw new DemoApiError('演示任务尚不可采用。', 409);
      }
      if (job.request.type === 'character') {
        const fixture = builtinCharacters().find((record) => record.id === job.demoFixtureId)
          || builtinCharacters()[0];
        const assets = { side: {} };
        job.request.starterActions.forEach((action) => {
          assets.side[action] = {
            frames: [...framesFor(fixture, 'side', action)],
            fps: FIXED_FPS,
            loop: true,
          };
        });
        const character = {
          id: job.request.character,
          label: job.request.name,
          description: job.request.description,
          base: fixture.base,
          custom: true,
          demo: true,
          assets,
          cardData: {
            contractVersion: CONTRACT_VERSION,
            source: 'demo-fixture',
            style: job.request.style,
            palette: job.request.palette,
          },
        };
        upsertCharacter(character);
        job.character = character;
        job.message = '演示角色与基础动作已加入本地资产库。';
      } else {
        const current = characters().find((record) => record.id === job.request.character)
          || builtinCharacters()[0];
        const updated = clone(current);
        updated.demoOverride = true;
        updated.assets[job.request.view] ||= {};
        updated.assets[job.request.view][job.request.action] = {
          frames: job.demoOutputs.map((output) => output.url),
          fps: FIXED_FPS,
          loop: true,
        };
        upsertCharacter(updated);
        job.message = '演示候选已加入本地资产库。';
      }
      job.status = 'approved';
      job.progress = 100;
      job.updatedAt = nowIso();
      store.save();
      return clone(job);
    }
    if (path === '/api/reviews') {
      const current = store.state.reviews[body.key];
      if (!current) throw new DemoApiError('演示审核记录不存在。', 404);
      if (body.expectedVersion !== current.version) {
        throw new DemoApiError('演示审核版本冲突。', 409, { current: clone(current) });
      }
      if (!Array.isArray(body.reviews) || body.reviews.some((value) => !REVIEW_STATES.has(value))) {
        throw new DemoApiError('演示审核状态不合法。', 400);
      }
      const record = {
        key: body.key,
        version: current.version + 1,
        reviews: [...body.reviews],
      };
      store.state.reviews[body.key] = record;
      store.save();
      return clone(record);
    }
    throw new DemoApiError(`演示接口不存在：${path}`, 404);
  }

  async function upload(_path, file) {
    return {
      id: nextId('dr'),
      filename: file?.name || 'demo-reference',
      mediaType: file?.type || 'image/png',
      width: 256,
      height: 256,
      demo: true,
    };
  }

  return {
    get mode() { return store.persistent ? 'local-demo' : 'memory-fallback'; },
    baseUrl: '',
    get,
    post,
    upload,
    assetUrl: (path) => path,
  };
}
