export const PRODUCTION_SOURCE_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'zero',
    label: '从零开始',
    eyebrow: 'TEXT TO CHARACTER',
    copy: '根据角色定义创建原创母版，并生成待机与行走候选。',
    href: './create-character.html?source=zero',
    action: '进入角色演示',
  }),
  Object.freeze({
    id: 'upload',
    label: '上传参考图',
    eyebrow: 'REFERENCE IMAGE',
    copy: '上传 PNG/JPEG 参考图，在本地演示流程中选择身份样例并组装侧视动作。',
    href: './create-character.html?source=upload',
    action: '上传并生成',
  }),
  Object.freeze({
    id: 'existing',
    label: '复用资产库',
    eyebrow: 'EXISTING ASSET',
    copy: '选择已入库角色，用内置素材演示动作补充或单帧修复。',
    href: './generate.html',
    action: '进入动作演示',
  }),
]);
