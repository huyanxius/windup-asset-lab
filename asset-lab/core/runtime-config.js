const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

function clean(value) {
  return String(value || '').replace(/\/$/, '');
}

export function resolveRuntimeConfig(
  locationLike = globalThis.location || { hostname: 'localhost', port: '4174', origin: '' },
  overrides = globalThis.WINDUP_CONFIG || {},
) {
  const local = LOCAL_HOSTS.has(locationLike.hostname);
  const gameOrigin = clean(
    overrides.gameOrigin
      ?? (local ? 'http://127.0.0.1:4173' : locationLike.origin),
  );
  const gamePath = String(overrides.gamePath ?? '/');
  return Object.freeze({
    gameOrigin,
    gameUrl: overrides.gameUrl || `${gameOrigin}${gamePath.startsWith('/') ? gamePath : `/${gamePath}`}`,
    previewNamespace: String(overrides.previewNamespace || 'windup'),
  });
}

export const runtimeConfig = resolveRuntimeConfig();
