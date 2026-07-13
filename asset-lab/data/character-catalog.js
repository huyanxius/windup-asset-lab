export const FIXED_FPS = 8;
export const CHARACTER_ROOT = '../assets/resources/character';
export const TEAMMATE_ROOT = '../assets/resources/characters';

export const actionOrder = ['idle', 'walk', 'run', 'jump', 'lantern'];
export const actionLabels = {
  idle: ['呼吸待机', '标准动作'],
  walk: ['行走', '标准动作'],
  run: ['奔跑', '标准动作'],
  jump: ['跳跃', '标准动作'],
  lantern: ['举灯点亮', '自定义动作'],
};

const viewLabels = {
  side: ['横屏侧视资产', '真实侧视序列帧'],
  topdown: ['真实俯视资产', '母版约束的独立俯视绘制'],
  isometric: ['真实 2.5D 资产', '母版约束的独立 3/4 绘制'],
};

export function makeFrames(base, prefix, count = 8) {
  return Array.from(
    { length: count },
    (_, index) => `${base}/${prefix}-${String(index + 1).padStart(2, '0')}.png`,
  );
}

function asset(label, key, frames, batch, options = {}) {
  return {
    label,
    key,
    frames,
    fps: FIXED_FPS,
    loop: true,
    initial: 'pending',
    batch,
    ...options,
  };
}

const lamplighterLibrary = {
  side: {
    label: '横屏侧视资产',
    truth: '真实侧视序列帧',
    idle: asset('呼吸待机', 'idle', makeFrames(`${CHARACTER_ROOT}/views/side`, 'idle'), 'B-20260713-11'),
    walk: asset('行走', 'walk', makeFrames(`${CHARACTER_ROOT}/frames`, 'walk'), 'B-20260713-05', { initial: 'pass' }),
    run: asset('奔跑', 'run', makeFrames(`${CHARACTER_ROOT}/views/side`, 'run'), 'B-20260713-09'),
    jump: asset('跳跃', 'jump', makeFrames(`${CHARACTER_ROOT}/views/side`, 'jump'), 'B-20260713-12', { loop: false }),
    lantern: asset('举灯点亮', 'lantern', makeFrames(`${CHARACTER_ROOT}/views/side`, 'lantern'), 'B-20260713-10', { loop: false, rejected: [4] }),
  },
  topdown: {
    label: '真实俯视资产',
    truth: '母版约束的独立俯视绘制',
    walk: asset('行走', 'walk', makeFrames(`${CHARACTER_ROOT}/views/topdown`, 'walk'), 'B-20260713-07'),
    run: asset('奔跑', 'run', makeFrames(`${CHARACTER_ROOT}/views/topdown`, 'run'), 'B-20260713-13'),
  },
  isometric: {
    label: '真实 2.5D 资产',
    truth: '母版约束的独立 3/4 绘制',
    walk: asset('行走', 'walk', makeFrames(`${CHARACTER_ROOT}/views/isometric`, 'walk'), 'B-20260713-08'),
    run: asset('奔跑', 'run', makeFrames(`${CHARACTER_ROOT}/views/isometric`, 'run'), 'B-20260713-14'),
  },
};

function teammateLibrary(character, count = 8) {
  return {
    side: {
      label: '横屏侧视资产',
      truth: '队友 Windup 管线生成 · 保留溯源',
      walk: asset(
        '行走',
        'walk',
        makeFrames(`${TEAMMATE_ROOT}/${character}/views/side`, 'walk', count),
        `TEAM-${character.toUpperCase()}-WALK`,
      ),
    },
    topdown: { label: '真实俯视资产', truth: '尚未生成：不使用伪透视替代' },
    isometric: { label: '真实 2.5D 资产', truth: '尚未生成：不使用伪透视替代' },
  };
}

export const characterCatalog = {
  lamplighter: {
    label: '点灯少年',
    base: `${CHARACTER_ROOT}/frames/walk-01.png`,
    library: lamplighterLibrary,
  },
  boy: {
    label: 'Boy · 队友资产',
    base: `${TEAMMATE_ROOT}/boy/base.png`,
    library: teammateLibrary('boy'),
  },
  skeleton: {
    label: 'Skeleton · 队友资产',
    base: `${TEAMMATE_ROOT}/skeleton/base.png`,
    library: teammateLibrary('skeleton'),
  },
  lirael: {
    label: 'Lirael · 队友资产',
    base: `${TEAMMATE_ROOT}/lirael/base.png`,
    library: teammateLibrary('lirael', 4),
  },
};

function libraryFromRecord(record, resolveAssetUrl) {
  return Object.fromEntries(Object.entries(viewLabels).map(([view, [label, truth]]) => {
    const actions = Object.fromEntries(Object.entries(record.assets?.[view] || {}).map(([action, item]) => [
      action,
      asset(
        actionLabels[action]?.[0] || action,
        action,
        item.frames.map(resolveAssetUrl),
        `LIB-${record.id.toUpperCase()}-${view.toUpperCase()}-${action.toUpperCase()}`,
        { fps: item.fps || FIXED_FPS, loop: item.loop !== false },
      ),
    ]));
    return [view, { label, truth, ...actions }];
  }));
}

export function mergeCharacterRecords(records, resolveAssetUrl = (path) => path) {
  records.forEach((record) => {
    if (characterCatalog[record.id] && !record.custom) return;
    characterCatalog[record.id] = {
      label: record.label,
      base: resolveAssetUrl(record.base),
      description: record.description || record.cardData?.description || '',
      custom: Boolean(record.custom),
      library: libraryFromRecord(record, resolveAssetUrl),
    };
  });
  return characterCatalog;
}

export function officialFrames(characterId, view, action, count) {
  if (characterId === 'lamplighter') {
    const base = view === 'side' && action === 'walk'
      ? `${CHARACTER_ROOT}/frames`
      : `${CHARACTER_ROOT}/views/${view}`;
    return makeFrames(base, action, count);
  }
  return makeFrames(`${TEAMMATE_ROOT}/${characterId}/views/${view}`, action, count);
}
