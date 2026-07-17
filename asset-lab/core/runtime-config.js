const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function clean(value) {
  return String(value || '').replace(/\/$/, '');
}

export function resolveRuntimeConfig(
  locationLike = globalThis.location || { hostname: 'localhost', port: '4174', origin: '' },
  overrides = globalThis.WINDUP_CONFIG || {},
) {
  const local = LOCAL_HOSTS.has(locationLike.hostname);
  const backendHosted = String(locationLike.pathname || '').startsWith('/asset-lab');
  const apiBase = clean(
    overrides.apiBase
      ?? globalThis.WINDUP_API_BASE
      ?? (local && locationLike.port !== '4174' && !backendHosted ? 'http://127.0.0.1:4174' : ''),
  );
  const gameOrigin = clean(
    overrides.gameOrigin
      ?? (local ? 'http://127.0.0.1:4173' : locationLike.origin),
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
