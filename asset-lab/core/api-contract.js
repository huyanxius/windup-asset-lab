import { CONTRACT_VERSION } from '../data/generated-contract.js';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function contractPayload(payload, expectedVersion = CONTRACT_VERSION) {
  const actual = isRecord(payload) && typeof payload.contractVersion === 'string'
    ? payload.contractVersion
    : '缺失';
  if (actual !== expectedVersion) {
    throw new TypeError(`生成服务版本不匹配：后端 ${actual}，前端 ${expectedVersion}。请重启正确版本的服务。`);
  }
  return payload;
}

export function characterRecords(payload, expectedVersion = CONTRACT_VERSION) {
  const value = contractPayload(payload, expectedVersion);
  if (!Array.isArray(value.characters)) {
    throw new TypeError('角色资产接口格式不兼容：characters 必须是数组。');
  }
  value.characters.forEach((record) => {
    if (!isRecord(record)
      || !nonEmptyString(record.id)
      || !nonEmptyString(record.label)
      || !nonEmptyString(record.base)
      || !isRecord(record.assets)) {
      throw new TypeError('角色资产接口格式不兼容：角色记录缺少 id、label、base 或 assets。');
    }
    Object.values(record.assets).forEach((view) => {
      if (!isRecord(view)) throw new TypeError('角色资产接口格式不兼容：视角记录必须是对象。');
      Object.values(view).forEach((action) => {
        if (!isRecord(action) || !Array.isArray(action.frames) || action.frames.some((frame) => !nonEmptyString(frame))) {
          throw new TypeError('角色资产接口格式不兼容：动作 frames 必须是路径数组。');
        }
      });
    });
  });
  return value.characters;
}

export function generationJob(payload, expectedVersion = CONTRACT_VERSION) {
  const value = contractPayload(payload, expectedVersion);
  if (!nonEmptyString(value.id)
    || !nonEmptyString(value.status)
    || !isRecord(value.request)
    || (value.outputs !== undefined && !Array.isArray(value.outputs))) {
    throw new TypeError('生成任务接口格式不兼容：缺少 id、status、request 或 outputs。');
  }
  return { ...value, outputs: value.outputs || [] };
}
