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
    id: 'identity',
    label: '锁定角色定义',
    title: '角色定义已锁定',
    copy: '姓名、定位、轮廓和配色成为这一轮生产的身份基准。',
    duration: 2200,
  }),
  Object.freeze({
    id: 'master',
    label: '建立身份母版',
    title: '侧视身份母版已建立',
    copy: '角色素材进入 256 × 256 透明画布，并锁定朝向与脚底基线。',
    duration: 2400,
  }),
  Object.freeze({
    id: 'action',
    label: '生成基础动作',
    title: '待机与行走动作已生成',
    copy: '待机与行走序列沿用同一身份母版，按动作批次依次产出。',
    duration: 2800,
  }),
  Object.freeze({
    id: 'slice',
    label: '切分与归一化',
    title: '两套动作已整理为 16 帧',
    copy: '候选图像正按相位逐帧切分，同步统一尺寸、透明底、锚点和命名。',
    duration: 2500,
  }),
  Object.freeze({
    id: 'quality',
    label: '自动质量检查',
    title: '自动质检已通过',
    copy: '画布、Alpha、脚底线、主体高度、相邻位移和循环接缝均已检查。',
    duration: 2600,
  }),
  Object.freeze({
    id: 'promote',
    label: '采用正式资产',
    title: '候选资产已正式采用',
    copy: '候选与正式资产保持隔离；版本记录和入库状态已保存。',
    duration: 2300,
  }),
  Object.freeze({
    id: 'package',
    label: '生成引擎包',
    title: 'Cocos 资源包已就绪',
    copy: '待机与行走透明 PNG、8 FPS metadata、Sprite Sheet 与微信小游戏交付说明已齐备。',
    duration: 2400,
  }),
]);

export const DEFAULT_DEMO_PROFILE = Object.freeze({
  name: '阿岚',
  role: '横版冒险游戏中的年轻信使',
  description: '短发、轻便旅行装、清晰侧面轮廓。动作轻快，但不夸张。',
  style: '低饱和文艺像素风，深灰蓝主色，少量暖色点缀',
  action: 'side / idle + walk / 8 FPS',
});

function cleanProfile(profile = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_DEMO_PROFILE).map(([key, fallback]) => {
    const value = String(profile[key] || '').trim();
    return [key, value || fallback];
  }));
}

function metadataFor(profile, source) {
  return {
    character: { id: 'demo-aran', name: profile.name, role: profile.role },
    assets: [
      { view: 'side', action: 'idle', frames: 8, fps: 8, loop: true },
      { view: 'side', action: 'walk', frames: 8, fps: 8, loop: true },
    ],
    canvas: { width: 256, height: 256, alpha: true, anchor: 'feet-center' },
    target: ['Cocos Creator', '微信小游戏'],
    source: source?.id || 'demonstration',
    sourceLabel: source?.label || '内置角色素材',
  };
}

export class DemoProductionController {
  constructor(options = {}) {
    this.schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    this.onChange = options.onChange || (() => {});
    this.profile = cleanProfile();
    this.sourceId = null;
    this.status = 'draft';
    this.stepIndex = -1;
    this.runToken = 0;
  }

  snapshot() {
    const completed = this.status === 'completed';
    const activeStep = DEMO_PRODUCTION_STEPS[Math.max(0, this.stepIndex)];
    const fixedProgress = {
      action_review: 72,
      action_setup: 36,
      draft: 0,
      master_review: 28,
    }[this.status];
    return {
      activeStep,
      completed,
      gate: ['master_review', 'action_setup', 'action_review'].includes(this.status)
        ? this.status
        : null,
      profile: { ...this.profile },
      source: SOURCE_BY_ID[this.sourceId] || null,
      sourceId: this.sourceId,
      progress: completed
        ? 100
        : fixedProgress ?? Math.round((this.stepIndex + 1) / DEMO_PRODUCTION_STEPS.length * 100),
      status: this.status,
      stepIndex: this.stepIndex,
      steps: DEMO_PRODUCTION_STEPS,
    };
  }

  configure(profile) {
    this.runToken += 1;
    this.profile = cleanProfile(profile);
    this.status = 'draft';
    this.stepIndex = -1;
    this.emit();
    return this.snapshot();
  }

  selectSource(sourceId) {
    if (!SOURCE_BY_ID[sourceId]) return this.snapshot();
    this.runToken += 1;
    this.sourceId = sourceId;
    this.status = 'draft';
    this.stepIndex = -1;
    this.emit();
    return this.snapshot();
  }

  clearSource() {
    this.runToken += 1;
    this.sourceId = null;
    this.status = 'draft';
    this.stepIndex = -1;
    this.emit();
    return this.snapshot();
  }

  start() {
    return this.startMaster();
  }

  startMaster() {
    if (!this.sourceId || this.status === 'running') return this.snapshot();
    return this.runFrom(0);
  }

  confirmMaster() {
    if (this.status !== 'master_review') return this.snapshot();
    this.runToken += 1;
    this.status = 'action_setup';
    this.emit();
    return this.snapshot();
  }

  startActions() {
    if (!['action_setup', 'action_review'].includes(this.status)) return this.snapshot();
    return this.runFrom(2);
  }

  approveActions() {
    if (this.status !== 'action_review') return this.snapshot();
    return this.runFrom(5);
  }

  regenerateMaster() {
    if (!['master_review', 'action_setup'].includes(this.status)) return this.snapshot();
    return this.runFrom(0);
  }

  regenerateActions() {
    if (this.status !== 'action_review') return this.snapshot();
    return this.runFrom(2);
  }

  reset() {
    this.runToken += 1;
    this.status = 'draft';
    this.stepIndex = -1;
    this.emit();
    return this.snapshot();
  }

  runFrom(stepIndex) {
    const token = ++this.runToken;
    this.status = 'running';
    this.stepIndex = stepIndex;
    this.emit();
    this.scheduleNext(token);
    return this.snapshot();
  }

  advance(token = this.runToken) {
    if (token !== this.runToken || this.status !== 'running') return this.snapshot();
    if (this.stepIndex === 1) {
      this.status = 'master_review';
      this.emit();
      return this.snapshot();
    }
    if (this.stepIndex === 4) {
      this.status = 'action_review';
      this.emit();
      return this.snapshot();
    }
    if (this.stepIndex >= DEMO_PRODUCTION_STEPS.length - 1) {
      this.status = 'completed';
      this.emit();
      return this.snapshot();
    }
    this.stepIndex += 1;
    this.emit();
    this.scheduleNext(token);
    return this.snapshot();
  }

  scheduleNext(token) {
    const step = DEMO_PRODUCTION_STEPS[this.stepIndex];
    this.schedule(() => this.advance(token), step.duration);
  }

  metadata() {
    return metadataFor(this.profile, SOURCE_BY_ID[this.sourceId] || null);
  }

  emit() {
    this.onChange(this.snapshot());
  }
}
