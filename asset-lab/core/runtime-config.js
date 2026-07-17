const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function clean(value) {
  return String(value || '').replace(/\/$/, '');
}

export function resolveRuntimeConfig(
  locationLike = globalThis.location || { hostname: 'localhost', port: '5174', origin: '' },
  overrides = globalThis.WINDUP_CONFIG || {},
) {
  const local = LOCAL_HOSTS.has(locationLike.hostname);
  const apiBase = clean(
    overrides.apiBase
      ?? globalThis.WINDUP_API_BASE
      ?? (local && locationLike.port !== '5174' ? 'http://127.0.0.1:5174' : ''),
  );
  const gameOrigin = clean(
    overrides.gameOrigin
      ?? (local ? 'http://127.0.0.1:5173' : locationLike.origin),
  );
  const gamePath = String(overrides.gamePath ?? '/');
  return Object.freeze({
    apiBase,
    gameOrigin,
    gameUrl: overrides.gameUrl || `${gameOrigin}${gamePath.startsWith('/') ? gamePath : `/${gamePath}`}`,
    previewNamespace: String(overrides.previewNamespace || 'windup'),
  });
}

export const runtimeConfig = resolveRuntimeConfig();
