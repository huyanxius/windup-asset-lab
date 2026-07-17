export const NATURAL_CREATION_STEPS = Object.freeze([
  Object.freeze({
    id: 'interpret',
    label: '理解创作指令',
    copy: '提取角色身份、视角、动作和交付格式。',
    duration: 1800,
    progress: 9,
  }),
  Object.freeze({
    id: 'master',
    label: '创建身份母版',
    copy: '锁定角色轮廓、服装结构与核心色彩。',
    duration: 3200,
    progress: 25,
  }),
  Object.freeze({
    id: 'motion',
    label: '生成动作序列',
    copy: '逐张接收 Idle 与 Walk 的八帧循环动画。',
    duration: 9600,
    progress: 73,
  }),
  Object.freeze({
    id: 'quality',
    label: '执行质量检查',
    copy: '按产物检查透明背景、画布尺寸、脚底基线、主体高度、相邻位移和循环接缝。',
    duration: 3500,
    progress: 91,
  }),
  Object.freeze({
    id: 'package',
    label: '准备导出资产',
    copy: '整理 Sprite Sheet、JSON metadata 与预览入口。',
    duration: 2200,
    progress: 98,
  }),
]);

export const NATURAL_CREATION_ASSET_SEQUENCE = Object.freeze([
  Object.freeze({ id: 'master', kind: 'master', label: '身份母版' }),
  ...['idle', 'walk'].flatMap((action) => Array.from({ length: 8 }, (_, index) => Object.freeze({
    action,
    frameIndex: index,
    id: `${action}-${String(index + 1).padStart(2, '0')}`,
    kind: 'frame',
    label: `${action.toUpperCase()} · FRAME ${String(index + 1).padStart(2, '0')}`,
  }))),
]);

const QUALITY_CHECKS = Object.freeze([
  '透明背景',
  '画布尺寸',
  '脚底基线',
  '主体高度',
  '相邻位移',
  '循环接缝',
]);

export const NATURAL_CREATION_DURATION_MS = NATURAL_CREATION_STEPS.reduce(
  (total, step) => total + step.duration,
  0,
);

const STYLE_TERMS = Object.freeze([
  '低饱和',
  '高饱和',
  '像素',
  '复古',
  '水彩',
  '赛博',
  '暗黑',
  '可爱',
  '写实',
  '卡通',
  '极简',
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function inferredName(command) {
  const explicit = command.match(
    /(?:名叫|叫做|角色名(?:为|是)?)[「“"]?([\p{L}\p{N}·_-]{2,16}?)[」”"]?(?=的(?:低饱和|高饱和|像素|角色|人物|横版|侧视|俯视|2\.5D)|[，,。；;\s]|$)/u,
  );
  if (explicit) return explicit[1];

  const created = command.match(
    /(?:创建|做|生成)(?:一个|一名|一位)?[「“"]?([\p{L}\p{N}·_-]{2,12}?)[」”"]?(?=角色|人物|英雄|并|，|,|。|；|;|\s|$)/u,
  );
  return created?.[1] || '快速角色';
}

function inferredStyle(command) {
  const terms = STYLE_TERMS.filter((term) => command.toLowerCase().includes(term.toLowerCase()));
  return terms.length ? `${terms.join(' · ')}角色资产` : '清晰轮廓 · 低饱和像素角色资产';
}

function inferredRole(command) {
  const roles = ['守夜人', '信使', '骑士', '游侠', '法师', '战士', '冒险者'];
  return roles.find((role) => command.includes(role)) || '游戏角色';
}

function inferredFormats(command) {
  const formats = [];
  if (/sprite\s*sheet|spritesheet|图集/i.test(command)) formats.push('Sprite Sheet');
  if (/json|metadata|元数据/i.test(command)) formats.push('JSON');
  if (/zip|压缩包/i.test(command)) formats.push('ZIP');
  if (/png/i.test(command)) formats.push('PNG');
  return formats.length ? formats : ['Sprite Sheet', 'JSON'];
}

export function parseNaturalCreationCommand(value) {
  const command = clean(value).slice(0, 600);
  const view = /俯视|top[\s-]?down/i.test(command)
    ? 'topdown'
    : /2\.5d|等距|isometric/i.test(command)
      ? 'isometric'
      : 'side';
  const directions = /八向|8\s*向/i.test(command) ? '8' : /四向|4\s*向/i.test(command) ? '4' : '1';
  const mentionsIdle = /待机|呼吸|idle/i.test(command);
  const mentionsWalk = /行走|走路|步行|walk/i.test(command);
  const actions = mentionsIdle || mentionsWalk
    ? ['idle', 'walk'].filter((action) => action === 'idle' ? mentionsIdle : mentionsWalk)
    : ['idle', 'walk'];

  return Object.freeze({
    actions,
    canvasSize: /512\s*[×x*]\s*512|512\s*像素/i.test(command) ? '512'
      : /128\s*[×x*]\s*128|128\s*像素/i.test(command) ? '128'
        : '256',
    command,
    description: command || '创建一套可预览、检查并导出的角色资产。',
    directions,
    exportFormats: inferredFormats(command),
    name: inferredName(command),
    projectName: `${inferredName(command)}一键资产`,
    role: inferredRole(command),
    sourceId: 'zero',
    style: inferredStyle(command),
    view,
  });
}

export class NaturalCreationController {
  constructor(options = {}) {
    this.schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
    this.onChange = options.onChange || (() => {});
    this.runToken = 0;
    this.reset({ notify: false });
  }

  snapshot() {
    return {
      error: this.error,
      activeArtifact: this.activeArtifact ? { ...this.activeArtifact } : null,
      artifacts: this.artifacts.map((artifact) => ({ ...artifact })),
      intent: this.intent,
      progress: this.progress,
      qualityChecks: this.qualityChecks.map((check) => ({ ...check })),
      savedName: this.savedName,
      status: this.status,
      stepIndex: this.stepIndex,
      steps: NATURAL_CREATION_STEPS.map((step, index) => ({
        ...step,
        status: this.status === 'completed' || index < this.stepIndex
          ? 'completed'
          : index === this.stepIndex && this.status === 'running'
            ? 'running'
            : 'pending',
      })),
    };
  }

  start(value, characterId) {
    const command = clean(value);
    if (command.length < 4) {
      this.error = '请用一句完整的话描述希望创建的角色与交付目标。';
      this.emit();
      return this.snapshot();
    }

    this.runToken += 1;
    this.error = '';
    this.activeArtifact = null;
    this.artifacts = [];
    this.intent = { ...parseNaturalCreationCommand(command), characterId: characterId || 'boy' };
    this.progress = 2;
    this.qualityChecks = [];
    this.savedName = '';
    this.status = 'running';
    this.stepIndex = 0;
    this.emit();
    this.scheduleCurrentStep(this.runToken);
    return this.snapshot();
  }

  scheduleCurrentStep(token) {
    const step = NATURAL_CREATION_STEPS[this.stepIndex];
    if (!step) return;
    this.scheduleStepEvents(step, token);
    this.schedule(() => {
      if (token !== this.runToken || this.status !== 'running') return;
      this.progress = step.progress;
      if (this.stepIndex >= NATURAL_CREATION_STEPS.length - 1) {
        this.status = 'completed';
        this.progress = 100;
        this.activeArtifact = null;
        this.emit();
        return;
      }
      this.stepIndex += 1;
      this.emit();
      this.scheduleCurrentStep(token);
    }, step.duration);
  }

  scheduleStepEvents(step, token) {
    const events = step.id === 'master'
      ? [NATURAL_CREATION_ASSET_SEQUENCE[0]]
      : step.id === 'motion'
        ? NATURAL_CREATION_ASSET_SEQUENCE.slice(1)
        : [];

    events.forEach((artifact, index) => {
      const delay = Math.round(((index + 1) / (events.length + 1)) * step.duration);
      this.schedule(() => {
        if (token !== this.runToken || this.status !== 'running' || this.stepIndex !== NATURAL_CREATION_STEPS.indexOf(step)) return;
        if (!this.artifacts.some((item) => item.id === artifact.id)) {
          const arrived = { ...artifact, arrivedAt: Date.now() };
          this.artifacts.push(arrived);
          this.activeArtifact = arrived;
        }
        const previousProgress = this.stepIndex > 0 ? NATURAL_CREATION_STEPS[this.stepIndex - 1].progress : 2;
        this.progress = Math.round(previousProgress + ((step.progress - previousProgress) * (index + 1)) / (events.length + 1));
        this.emit();
      }, delay);
    });

    if (step.id !== 'quality') return;
    QUALITY_CHECKS.forEach((label, index) => {
      const delay = Math.round(((index + 1) / (QUALITY_CHECKS.length + 1)) * step.duration);
      this.schedule(() => {
        if (token !== this.runToken || this.status !== 'running' || this.stepIndex !== NATURAL_CREATION_STEPS.indexOf(step)) return;
        this.qualityChecks.push({ id: `quality-${index + 1}`, label, status: 'passed' });
        const previousProgress = NATURAL_CREATION_STEPS[this.stepIndex - 1].progress;
        this.progress = Math.round(previousProgress + ((step.progress - previousProgress) * (index + 1)) / (QUALITY_CHECKS.length + 1));
        this.emit();
      }, delay);
    });
  }

  markSaved(value) {
    if (this.status !== 'completed') return this.snapshot();
    this.savedName = clean(value) || `${this.intent?.name || '角色'}快捷方案`;
    this.emit();
    return this.snapshot();
  }

  restore(snapshot) {
    if (!snapshot || !snapshot.status) return;
    this.runToken += 1;               // Cancel any in-flight timers from a previous run.
    this.error = snapshot.error || '';
    this.activeArtifact = snapshot.activeArtifact ? { ...snapshot.activeArtifact } : null;
    this.artifacts = (snapshot.artifacts || []).map((a) => ({ ...a }));
    this.intent = snapshot.intent ? { ...snapshot.intent } : null;
    this.progress = snapshot.progress || 0;
    this.qualityChecks = (snapshot.qualityChecks || []).map((c) => ({ ...c }));
    this.savedName = snapshot.savedName || '';
    this.status = snapshot.status;     // 'idle' | 'running' | 'completed'
    this.stepIndex = typeof snapshot.stepIndex === 'number' ? snapshot.stepIndex : -1;
    this.emit();
  }

  reset({ notify = true } = {}) {
    this.runToken += 1;
    this.error = '';
    this.activeArtifact = null;
    this.artifacts = [];
    this.intent = null;
    this.progress = 0;
    this.qualityChecks = [];
    this.savedName = '';
    this.status = 'idle';
    this.stepIndex = -1;
    if (notify) this.emit();
    return this.snapshot();
  }

  emit() {
    this.onChange(this.snapshot());
  }
}
