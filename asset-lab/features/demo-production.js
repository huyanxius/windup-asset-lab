import { DEFAULT_DEMO_CHARACTER_ASSETS } from '../data/default-demo-character.js';

export const DEMO_CHARACTER_ASSETS = Object.freeze({
  ...DEFAULT_DEMO_CHARACTER_ASSETS,
  frames: DEFAULT_DEMO_CHARACTER_ASSETS.walkFrames,
});

export const DEMO_SOURCE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'zero',
    label: '从零开始',
    eyebrow: 'TEXT TO CHARACTER',
    copy: '先写清角色是谁，再从身份母版开始生产动作。',
  }),
  Object.freeze({
    id: 'upload',
    label: '上传参考图',
    eyebrow: 'REFERENCE IMAGE',
    copy: '把参考图作为身份依据，完成风格整理、母版锁定与动作延展。',
  }),
  Object.freeze({
    id: 'existing',
    label: '复用资产库',
    eyebrow: 'EXISTING ASSET',
    copy: '选择已经入库的角色，保留身份母版，只继续补待机与行走动作。',
  }),
]);

const SOURCE_BY_ID = Object.freeze(Object.fromEntries(
  DEMO_SOURCE_OPTIONS.map((source) => [source.id, source]),
));

export const DEMO_PRODUCTION_STEPS = Object.freeze([
  Object.freeze({
    id: 'master', label: '生成角色母版', title: '正在生成角色母版', duration: 9000,
  }),
  Object.freeze({
    id: 'keyframe', label: '生成动作首帧', title: '正在生成动作首帧', duration: 7000,
  }),
  Object.freeze({
    id: 'animation', label: '生成动画', title: '正在生成八帧动画', duration: 15000,
  }),
  Object.freeze({
    id: 'publish', label: '写入正式资产', title: '正在写入项目资产', duration: 2500,
  }),
]);

export const DEFAULT_DEMO_PROFILE = Object.freeze({
  name: '阿岚',
  role: '横版冒险游戏中的年轻信使',
  description: '短发、轻便旅行装、清晰侧面轮廓。动作轻快，但不夸张。',
  style: '低饱和文艺像素风，深灰蓝主色，少量暖色点缀',
  action: 'side / idle + walk / 8 FPS',
  sourceAsset: '',
});

function cleanProfile(profile = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_DEMO_PROFILE).map(([key, fallback]) => {
    const value = String(profile[key] || '').trim();
    return [key, value || fallback];
  }));
}

function metadataFor(profile, source) {
  return {
    character: { id: 'demo-aran', name: profile.name, role: profile.role, sourceAsset: profile.sourceAsset },
    assets: [
      { view: 'side', action: 'idle', frames: 8, fps: 8, loop: true },
      { view: 'side', action: 'walk', frames: 8, fps: 8, loop: true },
    ],
    canvas: { width: 256, height: 256, alpha: true, anchor: 'feet-center' },
    target: ['Cocos Creator', '微信小游戏'],
    source: source?.id || 'internal',
    sourceLabel: source?.label || '内置角色素材',
  };
}

export class DemoProductionController {
  constructor(options = {}) {
    this.schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    this.onChange = options.onChange || (() => {});
    this.profile = cleanProfile();
    this.sourceId = null;
    this.master = 'idle';
    this.masterCandidate = null;
    this.actions = {
      idle: { keyframe: 'locked', animation: 'locked', brief: '', fps: null },
      walk: { keyframe: 'locked', animation: 'locked', brief: '', fps: null },
    };
    this.status = 'editing';
    this.jobs = new Map();
    this.completed = false;
    this.workflow = null;
    this.runToken = 0;
  }

  snapshot() {
    const jobs = [...this.jobs.values()].map(({ token, ...job }) => ({ ...job }));
    return {
      actions: {
        idle: { ...this.actions.idle },
        walk: { ...this.actions.walk },
      },
      completed: this.completed,
      job: jobs.at(-1) || null,
      jobs,
      master: this.master,
      masterCandidate: this.masterCandidate,
      profile: { ...this.profile },
      source: SOURCE_BY_ID[this.sourceId] || null,
      sourceId: this.sourceId,
      status: this.status,
      workflow: this.workflow ? { ...this.workflow } : null,
    };
  }

  applyWorkflowTemplate(template) {
    const pipeline = template?.pipeline || {};
    const sourceId = SOURCE_BY_ID[pipeline.source] ? pipeline.source : 'zero';
    if (!template?.id || !['automatic', 'guided'].includes(template?.execution?.mode)) return this.snapshot();
    this.reset();
    this.sourceId = sourceId;
    this.workflow = {
      briefs: { ...(pipeline.briefs || {}) },
      fps: [8, 12, 16].includes(Number(pipeline.fps)) ? Number(pipeline.fps) : 8,
      id: template.id,
      mode: template.execution.mode,
      name: template.name,
      status: 'ready',
    };
    this.emit();
    return this.snapshot();
  }

  startWorkflowRun() {
    if (!this.workflow || this.workflow.mode !== 'automatic' || !this.sourceId || this.jobs.size) return this.snapshot();
    this.workflow.status = 'running';
    return this.startMaster();
  }

  configure(profile) {
    this.profile = cleanProfile(profile);
    this.emit();
    return this.snapshot();
  }

  selectSource(sourceId) {
    if (!SOURCE_BY_ID[sourceId]) return this.snapshot();
    this.sourceId = sourceId;
    this.emit();
    return this.snapshot();
  }

  startMaster() {
    if (!this.sourceId || this.jobs.size) return this.snapshot();
    this.master = 'generating';
    this.masterCandidate = null;
    this.actions.idle = { keyframe: 'locked', animation: 'locked', brief: '', fps: null };
    this.actions.walk = { keyframe: 'locked', animation: 'locked', brief: '', fps: null };
    return this.runJob('master', null, DEMO_PRODUCTION_STEPS[0], () => {
      this.master = 'review';
    });
  }

  selectMasterCandidate(candidateId) {
    if (this.master !== 'review') return this.snapshot();
    this.masterCandidate = candidateId;
    this.emit();
    return this.snapshot();
  }

  confirmMaster() {
    if (this.master !== 'review' || !this.masterCandidate) return this.snapshot();
    this.master = 'confirmed';
    this.actions.idle.keyframe = 'ready';
    this.actions.walk.keyframe = 'ready';
    this.emit();
    return this.snapshot();
  }

  generateKeyframe(action, options = {}) {
    const branch = this.actions[action];
    const brief = String(options.brief || '').trim();
    if (!branch || !brief || this.master !== 'confirmed' || !['ready', 'review'].includes(branch.keyframe)) return this.snapshot();
    branch.brief = brief;
    branch.keyframe = 'generating';
    branch.animation = 'locked';
    return this.runJob('keyframe', action, DEMO_PRODUCTION_STEPS[1], () => {
      branch.keyframe = 'review';
    });
  }

  confirmKeyframe(action) {
    const branch = this.actions[action];
    if (!branch || branch.keyframe !== 'review') return this.snapshot();
    branch.keyframe = 'confirmed';
    branch.animation = 'ready';
    this.emit();
    return this.snapshot();
  }

  generateAnimation(action, options = {}) {
    const branch = this.actions[action];
    const fps = Number(options.fps);
    if (!branch || ![8, 12, 16].includes(fps) || branch.keyframe !== 'confirmed' || !['ready', 'review'].includes(branch.animation)) return this.snapshot();
    branch.fps = fps;
    branch.animation = 'generating';
    return this.runJob('animation', action, DEMO_PRODUCTION_STEPS[2], () => {
      branch.animation = 'review';
    });
  }

  confirmAnimation(action) {
    const branch = this.actions[action];
    if (!branch || branch.animation !== 'review') return this.snapshot();
    branch.animation = 'confirmed';
    this.emit();
    return this.snapshot();
  }

  publish() {
    const ready = Object.values(this.actions).every((branch) => branch.animation === 'confirmed');
    if (!ready || this.jobs.size || this.completed) return this.snapshot();
    return this.runJob('publish', null, DEMO_PRODUCTION_STEPS[3], () => {
      this.completed = true;
      if (this.workflow) this.workflow.status = 'completed';
    });
  }

  runJob(kind, action, step, complete) {
    const token = ++this.runToken;
    const key = `${kind}:${action || 'global'}`;
    if (this.jobs.has(key)) return this.snapshot();
    this.status = 'running';
    this.jobs.set(key, { action, duration: step.duration, kind, title: step.title, token });
    this.emit();
    this.schedule(() => {
      if (this.jobs.get(key)?.token !== token) return;
      complete();
      this.jobs.delete(key);
      this.status = this.jobs.size ? 'running' : this.completed ? 'completed' : 'editing';
      this.advanceWorkflow();
      this.emit();
    }, step.duration);
    return this.snapshot();
  }

  advanceWorkflow() {
    if (this.workflow?.status !== 'running' || this.jobs.size) return;
    if (this.master === 'review') {
      this.masterCandidate = 'boy';
      this.master = 'confirmed';
      this.actions.idle.keyframe = 'ready';
      this.actions.walk.keyframe = 'ready';
      for (const action of ['walk', 'idle']) {
        this.generateKeyframe(action, {
          brief: this.workflow.briefs[action] || (action === 'walk' ? '轻快、重心稳定的侧向行走' : '平稳呼吸、轮廓清晰的待机'),
        });
      }
      return;
    }
    const branches = Object.values(this.actions);
    if (branches.every((branch) => branch.keyframe === 'review')) {
      for (const branch of branches) {
        branch.keyframe = 'confirmed';
        branch.animation = 'ready';
      }
      for (const action of ['walk', 'idle']) this.generateAnimation(action, { fps: this.workflow.fps });
      return;
    }
    if (branches.every((branch) => branch.animation === 'review')) {
      for (const branch of branches) branch.animation = 'confirmed';
      this.workflow.status = 'awaiting_review';
      return;
    }
  }

  reset({ notify = true } = {}) {
    this.runToken += 1;
    this.profile = cleanProfile();
    this.sourceId = null;
    this.master = 'idle';
    this.masterCandidate = null;
    this.actions.idle = { keyframe: 'locked', animation: 'locked', brief: '', fps: null };
    this.actions.walk = { keyframe: 'locked', animation: 'locked', brief: '', fps: null };
    this.status = 'editing';
    this.jobs.clear();
    this.completed = false;
    this.workflow = null;
    if (notify) this.emit();
    return this.snapshot();
  }

  metadata() {
    return metadataFor(this.profile, SOURCE_BY_ID[this.sourceId] || null);
  }

  emit() {
    this.onChange(this.snapshot());
  }
}
