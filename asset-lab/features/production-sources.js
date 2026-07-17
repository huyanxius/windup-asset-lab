export const PRODUCTION_SOURCE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'zero',
    label: '从零开始',
    eyebrow: 'TEXT TO CHARACTER',
    copy: '根据角色定义创建原创母版，并生成待机与行走候选。',
    href: './create-character.html?source=zero',
    action: '进入真实角色生成',
  }),
  Object.freeze({
    id: 'upload',
    label: '上传参考图',
    eyebrow: 'REFERENCE IMAGE',
    copy: '上传 PNG/JPEG 参考图，以真实图像作为身份依据生成侧视母版与动作。',
    href: './create-character.html?source=upload',
    action: '上传并生成',
  }),
  Object.freeze({
    id: 'existing',
    label: '复用资产库',
    eyebrow: 'EXISTING ASSET',
    copy: '选择已入库角色，调用真实动作生成接口补充或修复动作。',
    href: './generate.html',
    action: '进入真实动作生成',
  }),
]);
