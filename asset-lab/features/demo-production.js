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
