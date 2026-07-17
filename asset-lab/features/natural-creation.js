export const NATURAL_CREATION_STEPS = Object.freeze([
  Object.freeze({
    id: 'interpret',
    label: '理解创作指令',
    copy: '提取角色身份、视角、动作和交付格式。',
    duration: 1200,
    progress: 16,
  }),
  Object.freeze({
    id: 'master',
    label: '创建身份母版',
    copy: '使用样例资产模拟角色轮廓、服装和色彩锁定。',
    duration: 1600,
    progress: 38,
  }),
  Object.freeze({
    id: 'motion',
    label: '生成动作序列',
    copy: '组织 Idle 与 Walk 的八帧循环动画。',
    duration: 2100,
    progress: 66,
  }),
  Object.freeze({
    id: 'quality',
    label: '执行质量检查',
    copy: '模拟检查透明背景、脚底基线、相邻位移和循环接缝。',
    duration: 1700,
    progress: 84,
  }),
  Object.freeze({
    id: 'package',
    label: '准备导出资产',
    copy: '整理 Sprite Sheet、JSON metadata 与预览入口。',
    duration: 1400,
    progress: 96,
  }),
]);

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
    description: command || '使用本地样例数据创建一套可预览角色资产。',
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
      intent: this.intent,
      progress: this.progress,
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

  start(value) {
    const command = clean(value);
    if (command.length < 4) {
      this.error = '请用一句完整的话描述希望创建的角色与交付目标。';
      this.emit();
      return this.snapshot();
    }

    this.runToken += 1;
    this.error = '';
    this.intent = parseNaturalCreationCommand(command);
    this.progress = NATURAL_CREATION_STEPS[0].progress;
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
    this.schedule(() => {
      if (token !== this.runToken || this.status !== 'running') return;
      if (this.stepIndex >= NATURAL_CREATION_STEPS.length - 1) {
        this.status = 'completed';
        this.progress = 100;
        this.emit();
        return;
      }
      this.stepIndex += 1;
      this.progress = NATURAL_CREATION_STEPS[this.stepIndex].progress;
      this.emit();
      this.scheduleCurrentStep(token);
    }, step.duration);
  }

  skip() {
    if (this.status !== 'running') return this.snapshot();
    this.runToken += 1;
    this.status = 'completed';
    this.stepIndex = NATURAL_CREATION_STEPS.length - 1;
    this.progress = 100;
    this.emit();
    return this.snapshot();
  }

  markSaved(value) {
    if (this.status !== 'completed') return this.snapshot();
    this.savedName = clean(value) || `${this.intent?.name || '角色'}快捷方案`;
    this.emit();
    return this.snapshot();
  }

  reset({ notify = true } = {}) {
    this.runToken += 1;
    this.error = '';
    this.intent = null;
    this.progress = 0;
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
