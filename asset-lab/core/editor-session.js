import { FIXED_FPS, actionOrder } from '../data/character-catalog.js';

const DEFAULT_ANCHOR = Object.freeze({ x: 128, y: 238 });

export class EditorSession {
  constructor(catalog, { characterId = 'lamplighter', view = 'side', action = 'idle' } = {}) {
    this.catalog = catalog;
    this.characterId = characterId;
    this.view = view;
    this.action = action;
    this.frame = 0;
    this.offsets = new Map();
    this.anchors = new Map();
  }

  get character() { return this.catalog[this.characterId]; }
  get library() { return this.character.library; }
  get currentView() { return this.library[this.view]; }
  get asset() { return this.currentView?.[this.action] || null; }
  get reviewKey() { return `${this.characterId}:${this.view}:${this.action}`; }

  frameUrl(index = this.frame) {
    if (!this.asset) return '';
    const source = this.asset.frames[index];
    return this.asset.revision ? `${source}?v=${this.asset.revision}` : source;
  }

  frameOffset(index = this.frame) {
    return this.offsets.get(`${this.reviewKey}:${index}`) || { x: 0, y: 0 };
  }

  nudgeFrame(dx, dy) {
    const key = `${this.reviewKey}:${this.frame}`;
    const current = this.frameOffset();
    this.offsets.set(key, { x: current.x + dx, y: current.y + dy });
  }

  get anchor() { return this.anchors.get(this.reviewKey) || { ...DEFAULT_ANCHOR }; }

  setAnchor(x, y) {
    this.anchors.set(this.reviewKey, { x: Math.round(x), y: Math.round(y) });
  }

  firstAvailableAction(view = this.view) {
    return actionOrder.find((key) => this.library[view]?.[key]) || null;
  }

  selectCharacter(characterId) {
    if (!this.catalog[characterId]) return false;
    this.characterId = characterId;
    this.action = this.library[this.view]?.[this.action] ? this.action : this.firstAvailableAction() || 'walk';
    this.frame = 0;
    return true;
  }

  selectView(view) {
    if (!this.library[view] || view === this.view) return false;
    this.view = view;
    this.action = this.library[view]?.[this.action] ? this.action : this.firstAvailableAction() || 'walk';
    this.frame = 0;
    return true;
  }

  selectAction(action) {
    if (!this.library[this.view]?.[action]) return false;
    this.action = action;
    this.frame = 0;
    return true;
  }

  selectFrame(frame) {
    if (!this.asset) return false;
    this.frame = Math.max(0, Math.min(this.asset.frames.length - 1, Number(frame)));
    return true;
  }

  stepFrame(delta) {
    if (!this.asset) return false;
    this.frame = (this.frame + delta + this.asset.frames.length) % this.asset.frames.length;
    return true;
  }

  generationUrl({ singleFrame = false } = {}) {
    const query = new URLSearchParams({
      character: this.characterId,
      view: this.view,
      action: this.action,
      mode: singleFrame ? 'single' : 'full',
      frame: String(this.frame + 1),
    });
    return `./generate.html?${query}`;
  }

  gamePayload(namespace = 'windup', loop = true) {
    if (!this.asset) return null;
    return {
      type: `${namespace}:preview-animation`,
      character: this.characterId,
      action: this.asset.key,
      view: this.view,
      fps: FIXED_FPS,
      loop,
    };
  }
}
