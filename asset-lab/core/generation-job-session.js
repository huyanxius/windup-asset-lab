const ACTIVE_STATES = new Set(['queued', 'generating', 'processing']);
const TERMINAL_STATES = new Set(['approved', 'failed', 'interrupted']);
const STATUS_RANK = new Map([
  ['queued', 0],
  ['generating', 1],
  ['processing', 2],
  ['awaiting_review', 3],
  ['approved', 4],
]);
const VALID_STATES = new Set([...STATUS_RANK.keys(), 'failed', 'interrupted']);

const EMPTY_RECONNECT = Object.freeze({
  active: false,
  attempt: 0,
  delay: 0,
  error: null,
});

function clone(value) {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function messageFrom(error) {
  if (!error) return null;
  return typeof error === 'string' ? error : String(error.message || error);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function sameValue(left, right) {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function outputKey(output, index) {
  if (output?.path) return `path:${output.path}`;
  if (output?.url) return `url:${output.url}`;
  if (output?.file) return `file:${output.view || ''}:${output.action || ''}:${output.file}`;
  if (Number.isInteger(output?.frameIndex)) {
    return `frame:${output.kind || ''}:${output.view || ''}:${output.action || ''}:${output.frameIndex}`;
  }
  return `value:${index}:${JSON.stringify(stableValue(output))}`;
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('任务快照必须是对象');
  }
  const jobId = String(snapshot.id || snapshot.jobId || '').trim();
  if (!jobId) throw new TypeError('任务快照缺少标识');
  if (!VALID_STATES.has(snapshot.status)) throw new TypeError(`未知任务状态：${snapshot.status}`);
  if (!snapshot.request || typeof snapshot.request !== 'object' || Array.isArray(snapshot.request)) {
    throw new TypeError('任务快照缺少请求定义');
  }
  const progress = Number(snapshot.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new RangeError('任务进度必须在 0–100 之间');
  }
  const outputs = snapshot.outputs ?? [];
  if (!Array.isArray(outputs)) throw new TypeError('任务输出必须是数组');
  const keys = outputs.map(outputKey);
  if (new Set(keys).size !== keys.length) throw new TypeError('任务输出包含重复标识');
  return {
    jobId,
    request: clone(snapshot.request),
    status: snapshot.status,
    progress,
    outputs: clone(outputs),
    outputKeys: new Set(keys),
    error: messageFrom(snapshot.error),
  };
}

function assertForwardStatus(current, next) {
  if (!current || current === next) return;
  if (TERMINAL_STATES.has(current)) throw new Error(`非法任务状态回退：${current} → ${next}`);
  if (next === 'failed' || next === 'interrupted') return;
  const currentRank = STATUS_RANK.get(current);
  const nextRank = STATUS_RANK.get(next);
  if (currentRank == null || nextRank == null || nextRank < currentRank) {
    throw new Error(`非法任务状态回退：${current} → ${next}`);
  }
}

export class GenerationJobSession {
  #jobId = null;
  #request = null;
  #status = null;
  #progress = 0;
  #outputs = [];
  #outputKeys = new Set();
  #error = null;
  #reconnect = { ...EMPTY_RECONNECT };

  constructor(snapshot = null) {
    if (snapshot) this.applySnapshot(snapshot);
  }

  static fromSnapshot(snapshot) {
    return new GenerationJobSession(snapshot);
  }

  get jobId() { return this.#jobId; }
  get request() { return clone(this.#request); }
  get status() { return this.#status; }
  get progress() { return this.#progress; }
  get outputs() { return clone(this.#outputs); }
  get error() { return this.#error; }
  get reconnect() { return { ...this.#reconnect }; }
  get active() { return ACTIVE_STATES.has(this.#status); }
  get terminal() { return TERMINAL_STATES.has(this.#status); }

  applySnapshot(snapshot) {
    const next = normalizeSnapshot(snapshot);
    if (this.#jobId && next.jobId !== this.#jobId) {
      throw new Error(`任务标识不一致：${this.#jobId} ≠ ${next.jobId}`);
    }
    if (this.#request && !sameValue(this.#request, next.request)) {
      throw new Error('任务请求不能在执行期间改变');
    }
    assertForwardStatus(this.#status, next.status);
    if (this.#jobId && next.progress < this.#progress) {
      throw new Error(`任务进度不能回退：${this.#progress} → ${next.progress}`);
    }
    if (this.#jobId) {
      const missing = [...this.#outputKeys].some((key) => !next.outputKeys.has(key));
      if (missing || next.outputs.length < this.#outputs.length) {
        throw new Error('任务输出不能回退或丢失已发布帧');
      }
    }

    this.#jobId = next.jobId;
    this.#request = next.request;
    this.#status = next.status;
    this.#progress = next.progress;
    this.#outputs = next.outputs;
    this.#outputKeys = next.outputKeys;
    this.#error = next.error;
    this.clearReconnect();
    return this;
  }

  markReconnect(error, { attempt = this.#reconnect.attempt + 1, delay = 0 } = {}) {
    if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('重连次数必须为正整数');
    if (!Number.isFinite(delay) || delay < 0) throw new RangeError('重连延迟不能为负数');
    this.#reconnect = {
      active: true,
      attempt,
      delay,
      error: messageFrom(error),
    };
    return this;
  }

  clearReconnect() {
    this.#reconnect = { ...EMPTY_RECONNECT };
    return this;
  }

  toJSON() {
    return {
      id: this.#jobId,
      request: clone(this.#request),
      status: this.#status,
      progress: this.#progress,
      outputs: clone(this.#outputs),
      error: this.#error,
      reconnect: { ...this.#reconnect },
    };
  }
}
