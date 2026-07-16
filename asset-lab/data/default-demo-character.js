export const DEFAULT_DEMO_CHARACTER_ID = 'boy';
export const DEFAULT_DEMO_CHARACTER_LABEL = '少年';
export const DEFAULT_DEMO_ASSET_VERSION = 'hq-20260716-r2';

const CHARACTER_ROOT = '../assets/resources/characters/boy';

function versionAsset(path) {
  return `${path}?v=${DEFAULT_DEMO_ASSET_VERSION}`;
}

function actionFrames(action) {
  return Object.freeze(Array.from({ length: 8 }, (_, index) => (
    versionAsset(`${CHARACTER_ROOT}/views/side/${action}-${String(index + 1).padStart(2, '0')}.png`)
  )));
}

export const DEFAULT_DEMO_CHARACTER_ASSETS = Object.freeze({
  base: versionAsset(`${CHARACTER_ROOT}/base.png`),
  idleFrames: actionFrames('idle'),
  walkFrames: actionFrames('walk'),
});
