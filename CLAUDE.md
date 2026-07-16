# Windup Asset Lab — Project Context & Working Rules

## What is this project?

Windup is a **Character Asset Studio** for AI-generated 2D game sprites. It connects character generation, action strip splitting, geometric QA, frame-by-frame manual review, and Cocos Creator 3.8.8 runtime verification into a single traceable delivery pipeline.

The project is one of three collaborating repositories in a competition submission:
- `game-asset-character` (main repo) — overall project entry
- **`windup-asset-lab` (this repo)** — asset studio, review workflow, Cocos integration
- `windup-pipeline` (teammate repo) — AI generation pipeline

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML / CSS / Vanilla JS (ES Modules) |
| Backend | Python `ThreadingHTTPServer` + Application Service |
| Game Engine | Cocos Creator 3.8.8 (TypeScript) |
| Image Processing | Pillow (Python) |
| AI Generation | Qiniu Cloud QnAIGC (OpenAI-compatible, `gemini-2.5-flash-image`) |
| Testing | Node.js `node:test` (frontend) + Python `unittest` (backend) |

## Quick Start

```bash
# Backend studio (demo mode — no API calls)
python3 -m server.app --demo

# Cocos web runtime
python3 -m http.server 4173 --bind 127.0.0.1 --directory build/lamplighter-mvp

# URLs
# Asset Lab: http://127.0.0.1:4174/asset-lab/
# Cocos:     http://127.0.0.1:4173/
```

With real AI generation:
```bash
QNAIGC_KEY="your-key" python3 -m server.app
```

## Repository Map

```
.
├─ asset-lab/                     # Frontend studio (generate, review, export)
│  ├─ core/                       # EditorSession, motion-state, PlaybackClock, api-client, review-store
│  ├─ pages/                      # editor.js (composition root), editor-view, editor-bindings
│  ├─ features/                   # quality-check, sprite-packer, game-bridge, drawer-controller
│  ├─ data/                       # character-catalog, generated-contract
│  └─ styles/                     # 7-layer CSS (foundation → motion)
├─ assets/scripts/GameRoot.ts     # Cocos runtime
├─ contracts/                     # windup.v1.json (single source of truth)
├─ server/
│  ├─ app.py                     # Thin HTTP adapter (routes, CORS, cookies only)
│  └─ windup_pipeline/           # Application, executor, pipeline, catalog, publisher
├─ tools/                        # Frame splitting, normalization, audit scripts
├─ build/lamplighter-mvp/         # Cocos web build
├─ reports/                      # QA reports and实测 data
├─ docs/                         # ARCHITECTURE, DECISIONS, ENGINEERING_PLAYBOOK
├─ GENERATION_CONSTRAINTS.md     # Every prompt原文 with rationale
├─ GAME_SPEC.md                  # 《点灯人》 game design spec
└─ HANDOFF.md                    # Current handover state
```

## Critical Architecture Rules

### 1. Contract is the single source of truth
`contracts/windup.v1.json` defines views, actions, 8 FPS, loop behavior, pose phases, and image models.
- Run `node tools/generate-contract.mjs` after any contract change.
- **Never hand-edit** `generated-contract.js`, `generated-contract.d.ts`, or `generated_contract.py`.

### 2. Dependency direction is strict
```
HTML/app entry → pages → features → core/data
HTTP adapter → Application → Stores/Executor/Publisher → Pipeline → Provider/Processing
```
- `core` cannot import `pages` or `features`.
- `features` cannot import `pages`.
- All browser HTTP goes through `api-client.js`.
- All editor animation intervals go through `PlaybackClock`.

### 3. Candidate vs. formal asset isolation
Generated results enter `generation-data/jobs/` first. Manual promotion via `promote_job()` backs up originals and atomically writes to the formal asset directory. **No candidate ever overwrites a formal asset directly.**

### 4. API Key security
- Keys are session-isolated via HttpOnly cookies in process memory only.
- Jobs receive key snapshots, never the raw key.
- Keys must never enter source code, browser storage, task JSON, logs, or Git.

### 5. CSS loading order is fixed
Styles load in this exact order: `foundation → surface → drawer → workspace → components → integrations → motion`. Do not bulk-change precedence, remove `!important`, or introduce Cascade Layers without manual visual acceptance.

### 6. State ownership (unique owners)
| State | Owner |
|---|---|
| Character/view/action/frame/anchor | `EditorSession` |
| Play/pause/auto/manual movement | `motion-state.js` reducer |
| 8 FPS timer | `PlaybackClock` |
| Review decisions | `ReviewStore` (optimistic lock versioning) |
| API credentials | `ProviderSessionStore` (memory only) |
| DOM rendering | `EditorView` |

### 7. Generation routes
- **`sheet` (default):** One API call generates an 8-panel horizontal strip → deterministic split → fastest.
- **`frames`:** Per-frame generation. Used for walk (with deterministic skeleton poses), single-frame repair, and sheet fallback.
- Walk uses `skeleton_gen.py` to produce deterministic OpenPose skeletons as pose-condition images — the pose is defined by code, not guessed by AI.

## How to Extend

### Adding a new action
1. Add to `contracts/windup.v1.json` (name, loop, 8 phases).
2. Run `node tools/generate-contract.mjs`.
3. Add to `data/character-catalog.js`.
4. Write pure-function tests for new state transitions.

### Adding a new character
- Built-in: add to catalog.
- User-created: POST `/api/characters/generations` — generates master + starter pack (idle + walk), atomic promotion.

### Changing generation supplier
Implement a new adapter with the same interface as `provider.py`. Page code must not know the supplier SDK.

### Changing task storage
Implement `JobStore`'s `add/get/update/load` semantics. Routes and generation flow must not depend on JSON file structure.

## Security Notes
- `postMessage` in `GameRoot.ts` currently uses `'*'` as target origin — should be config-driven.
- No authentication layer — fine for local dev, needs JWT/OAuth for production.
- CORS defaults to localhost whitelist; set `WINDUP_ALLOWED_ORIGINS` for production.

## Testing
- Frontend: `node --test tests/**/*.mjs`
- Backend: `python -m pytest tests/` or individual test files
- Architecture: `./tools/verify-architecture.sh`
- CSS format: `node tools/format-css.mjs asset-lab/styles/*.css`

## Known Issues & Debt
- **Idle animation is static:** `IDENTICAL` constraints + foot-anchor cancel all breathing displacement. Fix: add small offset table for idle frames (like jump).
- **No E2E tests:** Only unit-level tests exist.
- **JSON file storage:** Thread locks help but don't solve high-concurrency scenarios. Threshold for SQLite upgrade is defined in ENGINEERING_PLAYBOOK.md.
- **CSS 7-layer coupling:** Hard to maintain. Plan gradual migration to CSS Custom Properties.
- **Demo mode masks API issues:** Demo copies real frames, may give false sense of pipeline health.

## Files to Read Before Changing Code
1. `AGENTS.md` — agent-specific rules
2. `HANDOFF.md` — current project state
3. `docs/ARCHITECTURE.md` — module boundaries & state ownership
4. `docs/ENGINEERING_PLAYBOOK.md` — end-to-end flow & upgrade triggers
5. `docs/DECISIONS.md` — immutable architecture decisions
6. `GENERATION_CONSTRAINTS.md` — every prompt原文 with rationale and modification history
7. `CONTRIBUTING.md` — human contributor workflow

## Definition of Done
- Feature has one clear state owner, no duplicate state.
- Error, empty, retry, and recovery paths are defined.
- API keys, prompts, and candidate assets never enter Git.
- New public contracts have versioning or compatibility strategy.
- Related logic tests pass + `./tools/verify-architecture.sh` passes.
- Documentation only updated when facts change.
