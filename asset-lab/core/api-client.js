import { resolveRuntimeConfig } from './runtime-config.js';

export class ApiError extends Error {
  constructor(message, status, payload = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function resolveApiBase(locationLike = globalThis.location) {
  return resolveRuntimeConfig(locationLike).apiBase;
}

export function createApiClient(baseUrl = resolveApiBase()) {
  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(payload.error || `请求失败（HTTP ${response.status}）`, response.status, payload);
    }
    return payload;
  }

  return {
    baseUrl,
    get: (path) => request(path),
    post: (path, body, headers = {}) => request(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    upload: (path, file) => request(path, {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-Windup-Filename': encodeURIComponent(file.name || 'reference'),
      },
      body: file,
    }),
    assetUrl(path) {
      if (!path || /^https?:/.test(path)) return path;
      if (path.startsWith('../') || path.startsWith('./')) return path;
      return baseUrl ? `${baseUrl}/${path.replace(/^\//, '')}` : `/${path.replace(/^\//, '')}`;
    },
  };
}
