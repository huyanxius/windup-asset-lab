# Windup Asset Lab — Project Context

Windup is a demo-only 2D character asset studio. It demonstrates character definition, action candidates, frame review, sprite export, and Cocos Creator 3.8.8 preview without calling an external generation provider.

## Quick start

```bash
python3 -m server.app
```

- Asset Lab: `http://127.0.0.1:4174/asset-lab/`
- Cocos preview: `http://127.0.0.1:4173/`

No API Key, provider account, model endpoint, or network generation configuration is supported.

## Runtime architecture

- `asset-lab/core/demo-api-client.js` owns all demo character, action, job, promotion, and review calls.
- Demo state is stored in `localStorage` when available.
- If browser storage fails, the client switches to current-page memory.
- If saved state is absent or corrupt, bundled characters remain available.
- Browser code must not call `fetch` or expose a configurable generation API base.
- `server/app.py` serves static files and demo-only compatibility routes.
- `contracts/windup.v1.json` remains the single source for views, actions, 8 FPS, loop behavior, phases, and the demo model ID.

## State owners

| State | Owner |
|---|---|
| Character/view/action/frame/anchor | `EditorSession` |
| Play/pause/auto/manual movement | `motion-state.js` |
| 8 FPS timer | `PlaybackClock` |
| Demo jobs, characters, promotion, reviews | `demo-api-client.js` |
| Review UI state | `ReviewStore` |
| DOM rendering | `EditorView` |

## Required checks

```bash
node tools/generate-contract.mjs --check
node tools/check-boundaries.mjs
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

Read `AGENTS.md`, `HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and `CONTRIBUTING.md` before changing code.
