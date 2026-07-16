const VALID_REVIEW_STATES = new Set(['pass', 'pending', 'reject']);

export class ReviewStore {
  constructor(storage = globalThis.localStorage, key = 'windup-review-state', api = null) {
    this.storage = storage;
    this.key = key;
    this.api = api;
    this.records = this.#read();
    this.versions = new Map();
    this.syncQueues = new Map();
    this.hydrations = new Map();
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
    this.#enqueue(assetKey, asset, { frameIndex, value });
    return reviews;
  }

  async hydrate(assetKey, asset, onChange = () => {}) {
    if (!this.api || this.versions.has(assetKey)) return this.list(assetKey, asset);
    if (this.hydrations.has(assetKey)) return this.hydrations.get(assetKey);
    const hydration = this.#hydrate(assetKey, asset, onChange)
      .finally(() => this.hydrations.delete(assetKey));
    this.hydrations.set(assetKey, hydration);
    return hydration;
  }

  async flush(assetKey) {
    await this.hydrations.get(assetKey);
    await this.syncQueues.get(assetKey);
  }

  async #hydrate(assetKey, asset, onChange) {
    const defaults = this.list(assetKey, asset);
    const record = await this.api.get(`/api/reviews?${new URLSearchParams({
      key: assetKey,
      length: String(asset.frames.length),
      initial: asset.initial || 'pending',
      defaults: defaults.join(','),
    })}`);
    this.versions.set(assetKey, record.version);
    this.records[assetKey] = record.reviews;
    this.#persist();
    onChange(record.reviews);
    return record.reviews;
  }

  #enqueue(assetKey, asset, change) {
    if (!this.api) return;
    const previous = this.syncQueues.get(assetKey) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => this.#push(assetKey, asset, change))
      .catch(() => {});
    this.syncQueues.set(assetKey, next);
  }

  async #push(assetKey, asset, change) {
    if (!this.versions.has(assetKey)) await this.hydrate(assetKey, asset);
    const reviews = [...this.records[assetKey]];
    reviews[change.frameIndex] = change.value;
    const body = { key: assetKey, expectedVersion: this.versions.get(assetKey), reviews };
    try {
      const record = await this.api.post('/api/reviews', body);
      this.versions.set(assetKey, record.version);
      this.records[assetKey] = record.reviews;
    } catch (error) {
      if (error.status !== 409 || !error.payload.current) throw error;
      const current = error.payload.current;
      const merged = [...current.reviews];
      merged[change.frameIndex] = change.value;
      const record = await this.api.post('/api/reviews', {
        key: assetKey,
        expectedVersion: current.version,
        reviews: merged,
      });
      this.versions.set(assetKey, record.version);
      this.records[assetKey] = record.reviews;
    }
    this.#persist();
  }
}
