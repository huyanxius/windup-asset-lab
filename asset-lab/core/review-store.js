const VALID_REVIEW_STATES = new Set(['pass', 'pending', 'reject']);

export class ReviewStore {
  constructor(storage = globalThis.localStorage, key = 'windup-review-state') {
    this.storage = storage;
    this.key = key;
    this.records = this.#read();
  }

  #read() {
    try {
      const value = JSON.parse(this.storage.getItem(this.key) || '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  #persist() {
    this.storage.setItem(this.key, JSON.stringify(this.records));
  }

  list(assetKey, asset) {
    if (!this.records[assetKey] || this.records[assetKey].length !== asset.frames.length) {
      this.records[assetKey] = asset.frames.map((_, index) =>
        asset.rejected?.includes(index) ? 'reject' : asset.initial,
      );
      this.#persist();
    }
    return this.records[assetKey];
  }

  set(assetKey, asset, frameIndex, value) {
    if (!VALID_REVIEW_STATES.has(value)) throw new Error(`未知审核状态：${value}`);
    const reviews = this.list(assetKey, asset);
    reviews[frameIndex] = value;
    this.#persist();
    return reviews;
  }

  reset(assetKey, length, value = 'pending') {
    this.records[assetKey] = Array.from({ length }, () => value);
    this.#persist();
    return this.records[assetKey];
  }
}
