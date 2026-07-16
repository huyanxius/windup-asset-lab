# WindUp Asset Lab

> **Character Asset Studio for Generation, Review, and Cocos Delivery**

WindUp is a specialized workflow prototype for 2D game character asset production. It connects AI role generation, frame-by-frame action division, geometric quality inspection, human review, and Cocos Creator runtime verification into a single traceable delivery pipeline.

Every asset goes through **candidate isolation → automated geometric QA → human semantic review → atomic promotion → Cocos runtime verification** before becoming part of the official game library.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technical Stack](#technical-stack)
- [System Requirements](#system-requirements)
- [Directory Structure](#directory-structure)
- [Quick Start](#quick-start)
  - [Demo Mode (Zero Cost)](#demo-mode-zero-cost)
  - [Production Mode (With AI Provider)](#production-mode-with-ai-provider)
- [Complete Workflow](#complete-workflow)
  - [1. Character Generation](#1-character-generation)
  - [2. Action Generation](#2-action-generation)
  - [3. Quality Inspection](#3-quality-inspection)
  - [4. Human Review](#4-human-review)
  - [5. Asset Promotion](#5-asset-promotion)
  - [6. Cocos Runtime Verification](#6-cocos-runtime-verification)
- [Architecture](#architecture)
  - [Core Design Principles](#core-design-principles)
  - [Module Boundaries & Dependency Direction](#module-boundaries--dependency-direction)
  - [State Ownership](#state-ownership)
  - [Data Lifecycle](#data-lifecycle)
  - [Product Contract](#product-contract)
  - [Architecture Gate Automation](#architecture-gate-automation)
- [API Reference](#api-reference)
  - [Health & Status](#health--status)
  - [Provider Connection](#provider-connection)
  - [Character Management](#character-management)
  - [Action Generation](#action-generation)
  - [Review & Approval](#review--approval)
  - [Asset Promotion](#asset-promotion)
- [Configuration](#configuration)
- [Testing](#testing)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Known Asset Gaps](#known-asset-gaps)
- [Future Evolution Triggers](#future-evolution-triggers)
- [Contributing](#contributing)
- [Architecture Decision Records](#architecture-decision-records)

---

## Overview

### Why WindUp?

AI image generation for game assets is inherently unstable. A single character sprite might look great in isolation, but producing a coherent 8-frame walk cycle, ensuring geometric consistency across frames, verifying proper anchoring, and confirming runtime behavior in the actual game engine requires a structured pipeline.

WindUp addresses this by introducing:

1. **Candidate Isolation** — Generated assets land in a temporary job directory, never directly overwriting official assets.
2. **Automated Geometric QA** — Deterministic post-processing (chroma-key matting, frame splitting, normalization) ensures frame consistency in scale, position, and background removal.
3. **Human Semantic Review** — Artists review frames for semantic correctness (pose, anatomy, style consistency) that automated checks cannot judge.
4. **Atomic Promotion** — Only after all frames pass review are assets moved to the official library with backup and rollback support.
5. **Runtime Verification** — Assets are tested in a Cocos Creator environment to confirm they play correctly at the target 8 FPS.

### Supported Views

| View | Label | Description |
|------|-------|-------------|
| `side` | 横屏侧视资产 | True side-view sprite sequence |
| `topdown` | 真实俯视资产 | Independent top-down rendering under master constraints |
| `isometric` | 真实 2.5D 资产 | Independent 3/4 perspective rendering under master constraints |

### Supported Actions

| Action | Type | Loop | Description |
|--------|------|------|-------------|
| `idle` | Standard | Yes | Breathing standby — 8 phases with micro vertical offsets to prevent pixel-identical frames |
| `walk` | Standard | Yes | Full walk cycle — 8 phases driven by deterministic OpenPose skeletons |
| `run` | Standard | Yes | Running cycle — 8 phases including flight and compression |
| `jump` | Standard | No | Jump sequence — anticipation, launch, rise, apex, fall, land, recovery |
| `lantern` | Custom | No | Lantern lighting — 8 phases from held-low to maximum glow |

---

## Features

- **Multi-View Generation**: Side, top-down, and isometric character views with independent assets (no CSS rotation tricks).
- **Dual Generation Routes**:
  - **Sheet Route** (default): Generates one 8-panel horizontal strip via a single API call, then deterministically splits into individual frames. Reduces 8 API calls to 1.
  - **Frame Route**: Generates frames individually for repair or specific poses. Used for `walk` actions (deterministic skeleton conditioning) and single-frame rejection repair.
- **Deterministic Post-Processing**: Chroma key matting (magenta #FF00FF background), frame splitting, and 256×256 normalization with unified foot anchor.
- **Geometric Quality Assurance**: Automatic measurement of height consistency, center drift, foot baseline stability, and coverage ratios.
- **Optimistic Concurrency Control**: Review states are versioned with conflict detection (HTTP 409) and automatic merge on concurrent edits.
- **Cocos Creator Integration**: Real-time preview and control of assets within an iframe via `postMessage` protocol.
- **Full Provenance Tracking**: Every generation is logged with model, prompt, elapsed time, and provider mode.
- **Demo Mode**: Zero-cost local testing using existing assets without API calls.

---

## Technical Stack

| Layer | Technology | Details |
|-------|------------|---------|
| **Frontend** | HTML, CSS, Vanilla JavaScript (ES Modules) | No build step, no framework |
| **Backend** | Python 3.10+ `ThreadingHTTPServer` | Stdlib only, no third-party HTTP framework |
| **Game Engine** | Cocos Creator 3.8.8 (TypeScript) | 8 FPS fixed, nearest-neighbor texture filtering |
| **Image Processing** | Pillow (Python stdlib) | Chroma key, cropping, scaling, normalization |
| **AI Provider** | 七牛云 QnAIGC (OpenAI-compatible) | Gemini 2.5/3.1 Flash Image models |
| **Testing** | Node.js `node:test`, Python `unittest`/`pytest` | 22 frontend tests, 8 backend tests |

---

## System Requirements

- **Python** 3.10+ (stdlib only, no `pip install` needed)
- **Node.js** 18+ (for frontend tests and contract generation)
- **Cocos Creator** 3.8.8 (for runtime verification)
- **Browser**: Modern Chrome/Firefox/Edge with ES Module support
- **Environment Variable**: `QNAIGC_KEY` (production mode) or use `--demo` flag

---

## Directory Structure

```
windup-asset-lab/
├── asset-lab/                          # Frontend Character Asset Studio
│   ├── app.js                          # Ultra-thin review entry point
│   ├── pages/                          # Page components (composition roots)
│   │   ├── editor.js                   # Editor composition root
│   │   ├── editor-view.js              # DOM rendering (reads state, never modifies)
│   │   ├── editor-bindings.js          # Mouse, keyboard, button event adaptation
│   │   ├── editor-elements.js          # DOM ID contract and startup validation
│   │   ├── generate.html/js            # Standalone action generation page
│   │   ├── create-character.html/js    # Standalone character creation page
│   │   └── characters.html/js          # Standalone character asset management
│   ├── core/                           # State owners and infrastructure ports
│   │   ├── editor-session.js           # Unique owner: character/view/action/frame/offset/anchor
│   │   ├── motion-state.js             # Pure action FSM: pause/play/auto/manual
│   │   ├── playback-clock.js           # Unique 8 FPS timer
│   │   ├── api-client.js               # Unique HTTP client with session isolation
│   │   ├── runtime-config.js           # API, Cocos, and message namespace config
│   │   ├── job-poller.js               # Generation task lifecycle polling
│   │   └── review-store.js             # Local instant feedback + server version sync
│   ├── features/                       # Reusable interaction capabilities
│   │   ├── quality-check.js            # Frame geometry QA display
│   │   ├── sprite-packer.js            # Cocos atlas and metadata generation
│   │   ├── game-bridge.js              # Studio ↔ Cocos message protocol
│   │   ├── drawer-controller.js        # Left sidebar drawer lifecycle
│   │   ├── onboarding-controller.js    # Spotlight, mode selection, click guide
│   │   ├── provider-session-controller.js # Shared Key/model connection state
│   │   └── workflow-stepper.js         # Generation flow step state
│   ├── data/                           # Constants and generated boundaries
│   │   ├── generated-contract.js       # Auto-generated frontend domain constants
│   │   ├── generated-contract.d.ts     # Auto-generated frontend type boundaries
│   │   └── character-catalog.js        # Character/frame directory (no duplicate action specs)
│   └── styles/                         # Seven-layer CSS (fixed order, not Cascade Layers)
│       ├── foundation.css              # Design variables and base components (Layer 1)
│       ├── surface.css                 # Black/white professional surfaces
│       ├── drawer.css                  # macOS frosted glass drawer structure
│       ├── workspace.css               # Full-screen stage and floating layout
│       ├── components.css              # Inspector, atlas, and other parts
│       ├── integrations.css            # Character and generation entry styles
│       └── motion.css                  # Animations and reduced-motion fallback
│
├── server/                             # Backend Service
│   ├── app.py                          # Thin HTTP adapter: routing, cookies, CORS, static files
│   └── windup_pipeline/                # Core business logic
│       ├── application.py              # Application use cases (create job, promote, health)
│       ├── config.py                   # Environment config and image processing specs
│       ├── domain.py                   # Built-in catalog + generated contract exports
│       ├── generated_contract.py       # Auto-generated backend domain constants
│       ├── provider.py                 # QnAIGC authentication, requests, retries, error mapping
│       ├── generate.py                 # Image model request assembly (text + refs → PNG)
│       ├── generation_executor.py      # Background task execution, progress, provenance
│       ├── action_pipeline.py          # Sheet/frame dual routes with fallback strategy
│       ├── processing.py               # Matting, splitting, normalization, geometry QA
│       ├── publisher.py                # Atomic promotion with backup and rollback
│       ├── review_store.py             # Optimistic lock versioned review storage
│       ├── job_store.py                # Thread-safe task persistence boundary
│       ├── session_store.py            # Non-persistent session-level API credentials
│       ├── asset_catalog.py            # Formal asset discovery and manifest generation
│       ├── skeleton_gen.py             # Deterministic OpenPose skeleton generation for walk
│       ├── describe.py                 # VLM-based character view/facing validation
│       ├── matte.py                    # AI-based background cutout fallback
│       └── time_utils.py               # ISO timestamp utilities
│
├── assets/                             # Official Character Assets (Cocos-ready)
│   ├── resources/
│   │   ├── character/                  # Built-in character frames
│   │   └── characters/                 # Custom character frames (boy, skeleton, lirael)
│   └── scripts/
│       └── GameRoot.ts                 # Cocos game main logic: keyboard, animation, bridge
│
├── contracts/                          # Versioned product contracts
│   ├── windup.schema.json              # Contract validation schema
│   └── windup.v1.json                  # Source of truth: views, actions, FPS, phases, models
│
├── tests/                              # Unit and integration tests
│   ├── *.test.mjs                      # Frontend Node.js tests
│   └── test_*.py                       # Backend Python tests
│
├── tools/                              # Utility scripts
│   ├── generate-contract.mjs           # Generate JS/TS/Python constants from windup.v1.json
│   ├── check-boundaries.mjs            # Architecture gate: dependency direction, fetch, intervals
│   ├── format-css.mjs                  # CSS module formatter
│   ├── verify-architecture.sh          # Full verification: contract + boundaries + tests + lint
│   └── verify-architecture.bat         # Windows equivalent
│
├── docs/                               # Architecture and process documentation
│   ├── ARCHITECTURE.md                 # Module boundaries, state ownership, extension guide
│   ├── ENGINEERING_PLAYBOOK.md         # End-to-end workflow, data lifecycle, failure handling
│   ├── DECISIONS.md                    # Architecture Decision Records (ADR-001 through ADR-007)
│   └── HANDOFF.md                      # Project handoff notes and asset gaps
│
├── generation-data/                    # Runtime data (NOT committed to Git)
│   ├── jobs/                           # Candidate assets per generation job
│   ├── reviews/                        # Versioned review decisions
│   ├── backups/                        # Pre-promotion backups
│   ├── characters/                     # Custom character cards and frames
│   └── provenance.jsonl                # Immutable generation audit log
│
├── AGENTS.md                           # AI agent collaboration rules
├── CONTRIBUTING.md                     # Human contributor guidelines
├── HANDOFF.md                          # Project handoff document
├── README.md                           # This file
└── .gitignore                          # Exclusion rules for secrets and generated data
```

---

## Quick Start

### Demo Mode (Zero Cost)

Start the backend in demo mode — no API key needed, uses existing assets:

```bash
cd windup-asset-lab-codex-issue-14-workflow-skeleton
python server/app.py --demo
```

Open the studio in your browser:

```
http://127.0.0.1:4174/asset-lab/
```

Available pages:

| Page | URL | Purpose |
|------|-----|---------|
| **Review Studio** | `/asset-lab/` | Frame-by-frame review, playback, Cocos bridge |
| **Action Generation** | `/asset-lab/generate.html` | Generate actions for existing characters |
| **Character Creation** | `/asset-lab/create-character.html` | Create new characters with starter packs |
| **Character Management** | `/asset-lab/characters.html` | Browse and manage all characters |

### Production Mode (With AI Provider)

1. **Set your API key** (choose one method):

   ```bash
   # Method 1: Environment variable
   export QNAIGC_KEY="your_api_key_here"
   
   # Method 2: Configure in the UI (persisted per browser session via HttpOnly cookie)
   ```

   Optional overrides:
   ```bash
   export QNAIGC_BASE="https://api.qnaigc.com/v1"   # Default
   export QNAIGC_IMAGE_MODEL="gemini-2.5-flash-image" # Default
   ```

2. **Start the backend**:

   ```bash
   python server/app.py
   ```

3. **Connect your API key** in the UI:
   - Navigate to the Generation page (`/asset-lab/generate.html`)
   - Enter your API key and select a model
   - Click "Connect" — the system validates credentials against the provider

4. **Start Cocos Creator** (for runtime verification):
   ```bash
   open -a CocosCreator /path/to/project
   # Or serve the built web version:
   python -m http.server 4173 --bind 127.0.0.1 --directory build/lamplighter-mvp
   ```

---

## Complete Workflow

### 1. Character Generation

Creates a new character from a text description.

**Input**: Name, Description, Style, Palette, Model Selection, Starter Actions (1–3 actions).

**Process**:
1. **Master Sprite Generation**: AI generates a full-body character sprite in pseudo-side 3/4 view facing right.
2. **View & Facing Validation**: A VLM (Visual Language Model) checks that the master sprite has the correct view (profile/pseudo-side/three-quarter) and faces right. If not, regenerates up to 2 times.
3. **Chroma Key Matting**: Removes the solid magenta (#FF00FF) background. Falls back to AI segmentation if chroma key fails.
4. **Normalization**: Cropped to bounding box, scaled to fit within 224×208, placed on a 256×256 canvas with unified foot anchor at Y=238.
5. **Starter Action Generation**: Generates the requested starter actions (default: `idle` + `walk`) using the same sheet/frame pipeline.

**Output**: Base sprite and starter action frames stored in `generation-data/jobs/<job_id>/normalized/`.

**Key Details**:
- Default background color is magenta (`#FF00FF`) — chosen to avoid clashing with character palettes.
- No shadows are generated (cleaner matting).
- The master sprite serves as the identity reference for all subsequent action frames.

### 2. Action Generation

Generates animation frames for a character's action.

**Input**: Character ID, View, Action Type, Route (sheet/frame), Mode (full/single).

**Route Selection Logic**:

```
mode == "single"  → frames route (repair)
action == "walk"  → frames route (deterministic skeleton conditioning)
else              → sheet route (default, 1 API call for 8 frames)
```

#### Sheet Route (Default)

1. **Single API Call**: Generates one ultra-wide horizontal strip (~8:1 aspect ratio) containing all 8 phases.
2. **Deterministic Splitting**: Crops each panel equally, computes a shared scale factor, normalizes all frames.
3. **Fallback**: If the sheet format fails validation (wrong aspect ratio, wrong panel count), retries once. On second failure, falls back to frame-by-frame generation.

#### Frame Route (Walk / Repair)

1. **Skeleton Conditioning** (walk only): Generates deterministic OpenPose skeleton images from sine-wave phase definitions. White dots mark joints; bright colors = near-side limbs; dark = far-side.
2. **Contextual Prompting**: Each frame prompt includes:
   - Identity reference (master sprite)
   - Previous frame cutout (prevents costume/color drift)
   - Pose description (from contract phases)
   - Skeleton image (for walk actions)
   - Creator constraints (optional custom prompt)
3. **Progressive Reference**: Uses the cutout (matte) of the previous frame as the reference for the next — not the raw magenta-background image.

**Output**: Candidate frames in `generation-data/jobs/<job_id>/normalized/`.

### 3. Quality Inspection

Automatic geometric QA runs after generation completes.

**Metrics Measured**:

| Metric | Threshold | Warning |
|--------|-----------|---------|
| Frame visibility | All 8 frames must have visible characters | "存在不可见帧" |
| Background removal | No frame >50% coverage | "疑似存在背景未去除的帧" |
| Height consistency | Spread <28% of median height | "主体高度波动过大" |
| Center drift | Horizontal spread <42px | "主体水平中心漂移过大" |
| Foot baseline | Spread <5px (non-jump/idle) | "脚底基线不连续" |
| Idle foot stability | Spread <3px | "待机帧脚底波动过大" |

**Scoring**: `geometryContinuity = max(0, 100 - heightSpread*90 - centerSpread*0.8 - footSpread*2)`

> Note: Automated QA measures geometry only. Semantic motion quality (pose correctness, anatomy, style consistency) requires human review.

### 4. Human Review

The review studio presents frames in a timeline view with playback controls.

**Interface Components**:
- **Left Drawer**: macOS-style frosted glass sidebar showing asset filmstrip
- **Center Stage**: Full-screen frame preview with playback controls
- **Right Inspector**: Frame details, quality metrics, review actions

**Review Actions**:
- **Pass**: Mark frame as approved
- **Reject**: Mark frame as needing regeneration
- **Nudge**: Adjust frame position (vertical offset)

**Concurrency Control**:
- Reviews are versioned (starts at version 1)
- Concurrent edits detect conflicts (HTTP 409)
- Conflicts show the current state for manual merge

### 5. Asset Promotion

When all frames pass review, the asset can be promoted to the official library.

**Process**:
1. **Validation**: Checks that the job is in `awaiting_review` status and all outputs are present.
2. **Staging**: Copies candidate assets to a temporary staging directory (`.{character_id}-{job_id}.tmp`).
3. **Backup**: If official assets already exist at the target paths, they are backed up to `generation-data/backups/<job_id>/`.
4. **Atomic Move**: The staging directory is renamed to the final character directory (atomic on most filesystems).
5. **Catalog Registration**: The character card is written and the in-memory catalog is updated.
6. **Cleanup**: On failure, backups are restored and staging is cleaned up.

**Character Pack Promotion** (new characters):
- Validates base sprite + all starter action frames are present.
- Checks for existing character with the same ID (prevents overwrites).
- Creates the full directory structure: `base.png`, `views/<view>/<action>-NN.png`.

### 6. Cocos Runtime Verification

The studio can send preview payloads to a running Cocos Creator instance via `postMessage`.

**Protocol**:
```javascript
// From Studio → Cocos
{ type: 'windup:preview-animation', character: 'skeleton', action: 'walk', view: 'side', fps: 8, loop: true }

// From Cocos → Studio
{ type: 'windup:preview-ready' }
{ type: 'windup:preview-applied', character, action, view, frames: 8 }
{ type: 'windup:preview-error', reason: '...' }
```

**Cocos Side** (`GameRoot.ts`):
- Receives preview messages and loads the corresponding frame directory.
- Applies nearest-neighbor texture filtering for pixel-perfect rendering.
- Supports keyboard input (A/D, Arrow keys) for character movement.
- Space toggles lantern mode.
- Preview origin is configurable via `window.WINDUP_CONFIG.previewOrigin` (defaults to `'*'` for local dev).

---

## Architecture

### Core Design Principles

1. **One State, One Owner** — Character playback and movement are decided solely by `motion-state.js`. Pages compose capabilities but never duplicate state machines.
2. **Pages Assemble, Don't Implement** — Network, polling, review storage, QA, atlases, and game communication are provided by independent modules.
3. **Candidate-Formal Isolation** — Generated assets enter a job directory first; only explicit promotion moves them to the official library with backup.
4. **Single External Boundary** — API keys, auth, timeouts, retries, and upstream errors are handled exclusively in `provider.py`. Credentials are isolated per browser session.
5. **Single Contract Source** — Actions, views, 8 FPS, loop semantics, phases, and models come from `contracts/windup.v1.json`. Both frontend and backend files are generated from this single source.
6. **Replaceable Infrastructure** — HTTP pages never read tasks or review JSON directly; future migrations to SQLite, object storage, or queues require no changes to the interface layer.

### Module Boundaries & Dependency Direction

```
Frontend:
  HTML / app entry → pages → features → core/data

Backend:
  server/app.py (HTTP adapter) → GenerationApplication → Stores / Executor / Publisher
                                               ↓
                                    ActionPipeline / Provider / Processing
                                               ↓
                                          External (QnAIGC / filesystem)
```

**Strict dependency rules**:
- `core` cannot import `pages` or `features`
- `features` cannot import `pages`
- HTTP routes delegate to `GenerationApplication`; they don't implement business logic
- All browser HTTP goes through `api-client.js`
- All editor animation intervals go through `PlaybackClock`

### State Ownership

| State | Unique Owner | How Pages Use It |
|-------|-------------|------------------|
| Character, view, action, frame, per-frame offset, anchor | `EditorSession` | Call explicit select/adjust methods |
| Play/pause, auto/manual movement, direction, position | `motion-state.js` (pure reducer) | Send events to the reducer |
| 8 FPS timer | `PlaybackClock` | Start/stop a clock, don't create intervals directly |
| Review decisions | Frontend `ReviewStore` + Backend `ReviewStore` | Local instant update, server version sync, 409 merge |
| API credentials | `ProviderSessionStore` | HttpOnly cookie isolation; task threads receive credential snapshots only |
| DOM presentation | `EditorView` | Read state and render, never modify domain state |
| Browser input | `editor-bindings.js` | Translate events to application commands |

### Data Lifecycle

| Data | Owner | Lifetime | Storage |
|------|-------|----------|---------|
| Character/view/action/frame | `EditorSession` | Page session | Browser memory |
| Playback & movement | motion reducer | Page session | Browser memory |
| API credentials | `ProviderSessionStore` | Backend session | Process memory only |
| Generation tasks | `JobStore` | Recoverable | `generation-data/jobs/` |
| Review decisions | `ReviewStore` | Cross-page/collaborative | `generation-data/reviews/` |
| Candidate assets | job | Pre-review | Job directory |
| Formal assets | `AssetCatalog` / `AssetPublisher` | Long-term | `assets/resources/`, `generation-data/characters/` |
| Provenance & backups | promotion flow | Audit long-term | `generation-data/provenance.jsonl`, backups/ |

### Product Contract

The product contract (`contracts/windup.v1.json`) is the single source of truth for:

- **Views**: `side`, `topdown`, `isometric` with labels and truth descriptions
- **Actions**: `idle`, `walk`, `run`, `jump`, `lantern` with loop semantics and 8 phase descriptions
- **FPS**: Fixed at 8 throughout the entire pipeline
- **Image Models**: `gemini-2.5-flash-image`, `gemini-3.1-flash-image-preview`, `gemini-3.0-pro-image-preview`
- **Generation**: Routes (`sheet`, `frames`), default route, sheet dimensions (8 columns × 1 row), starter pack (side view, idle + walk)

**Regeneration**: After modifying the contract, run:
```bash
node tools/generate-contract.mjs
```
This generates:
- `asset-lab/data/generated-contract.js` — Frontend constants
- `asset-lab/data/generated-contract.d.ts` — Frontend TypeScript types
- `server/windup_pipeline/generated_contract.py` — Backend constants

**Never hand-edit generated files.** Changes must flow through the versioned contract.

### Architecture Gate Automation

`tools/check-boundaries.mjs` automatically verifies:
- No reverse dependencies: `core → pages/features` or `features → pages`
- No bypass of `api-client`: detects direct browser `fetch` calls
- No bypass of `PlaybackClock`: detects animation intervals not managed by the clock
- HTTP adapter doesn't absorb business/storage logic or exceed reasonable size
- No global API key writes, hardcoded runtime addresses, or contract drift

Run the full verification suite:
```bash
./tools/verify-architecture.sh
```

This executes:
1. Contract generation and validation
2. Boundary checking
3. Frontend Node.js tests
4. Backend Python tests
5. Python syntax compilation check
6. JavaScript syntax validation
7. Git diff whitespace check

---

## API Reference

Base URL: `http://127.0.0.1:4174`

All API responses include `Cache-Control: no-store`. Sessions use `HttpOnly` cookies (`WINDUP_SESSION`).

### Health & Status

```http
GET /api/health
```

Returns provider status, demo mode, contract version, and character summaries.

**Response**:
```json
{
  "ok": true,
  "configured": true,
  "verified": true,
  "demo": false,
  "provider": "七牛云 QnAIGC",
  "contractVersion": "1.1.0",
  "fps": 8,
  "characters": [{"id": "lamplighter", "label": "旧试验角色 · 独立样例"}]
}
```

### Provider Connection

```http
POST /api/provider/session
Content-Type: application/json
X-Windup-Request: studio
```

Connect and validate an API key.

**Request**:
```json
{
  "apiKey": "your_qnaigc_api_key",
  "model": "gemini-2.5-flash-image"
}
```

**Response**:
```json
{
  "ok": true,
  "configured": true,
  "verified": true,
  "providerError": "",
  "model": "gemini-2.5-flash-image",
  "storage": "isolated-process-session"
}
```

### Model List

```http
GET /api/provider/models
```

Returns available image models from the contract.

### Character Management

```http
GET /api/characters
```

Returns all registered characters with their manifests.

### Create Character Job

```http
POST /api/characters/generations
Content-Type: application/json
```

Create a new character with starter actions.

**Request**:
```json
{
  "name": "Hero Knight",
  "description": "A brave knight in dark armor with a red cape",
  "style": "pixel art, chibi proportions",
  "palette": "dark fantasy",
  "model": "gemini-2.5-flash-image",
  "starterActions": ["idle", "walk"]
}
```

**Response** (202 Accepted):
```json
{
  "id": "abc123def456",
  "batch": "C-20260716-120000",
  "status": "queued",
  "progress": 0,
  "message": "新角色与基础动作包已进入队列"
}
```

### Create Action Job

```http
POST /api/generations
Content-Type: application/json
```

Generate action frames for an existing character.

**Request**:
```json
{
  "character": "boy",
  "view": "side",
  "action": "run",
  "mode": "full",
  "route": "sheet",
  "customPrompt": "Add a sword in the right hand",
  "model": "gemini-2.5-flash-image"
}
```

**Response** (202 Accepted):
```json
{
  "id": "def789ghi012",
  "batch": "G-20260716-120500",
  "status": "queued",
  "progress": 0,
  "message": "已进入生成队列"
}
```

### Poll Job Status

```http
GET /api/generations/{job_id}
```

Poll for generation progress. States: `queued` → `generating` → `awaiting_review` (success) or `failed`.

### Review Management

```http
GET /api/reviews?key={key}&length=8&initial=pending
```

Get or initialize review records for a job.

```http
POST /api/reviews
Content-Type: application/json
```

Submit review decisions.

**Request**:
```json
{
  "key": "abc123def456-side-walk",
  "expectedVersion": 1,
  "reviews": ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass"]
}
```

**Response** (409 Conflict if version mismatch):
```json
{
  "error": "审核记录已被其他会话更新",
  "current": {"key": "...", "version": 2, "reviews": [...]}
}
```

### Asset Promotion

```http
POST /api/generations/{job_id}/promote
```

Promote candidate assets to the official library.

**Response**:
```json
{
  "message": "候选帧已采用，正式资产已备份",
  "promoted": ["assets/resources/characters/boy/views/side/walk-01.png", ...]
}
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `QNAIGC_KEY` / `SUFY_KEY` | `""` | API key for image generation provider |
| `QNAIGC_BASE` / `SUFY_BASE` | `https://api.qnaigc.com/v1` | Provider API base URL |
| `QNAIGC_IMAGE_MODEL` / `SUFY_IMAGE_MODEL` | `gemini-2.5-flash-image` | Default image generation model |
| `SUFY_VLM_MODEL` | `gemini-2.5-flash` | Vision language model for quality checks |
| `WINDUP_ALLOWED_ORIGINS` | `localhost/127.0.0.1 only` | Comma-separated list of allowed CORS origins |
| `WINDUP_DEMO` | `""` | Set to `"1"` to enable demo mode |

### Server Startup

```bash
# Demo mode (zero cost, uses existing assets)
python server/app.py --demo

# Production mode
python server/app.py

# Custom host/port
python server/app.py --host 0.0.0.0 --port 8080
```

### CSS Layer Order (Fixed)

Editor styles MUST be loaded in this exact order. Do not use Cascade Layers or bulk-change precedence:

1. `foundation.css` — Design variables, base components
2. `surface.css` — Professional black/white surfaces
3. `drawer.css` — Frosted glass sidebar
4. `workspace.css` — Full-screen stage layout
5. `components.css` — Inspector, atlas, parts
6. `integrations.css` — Character and generation entry
7. `motion.css` — Animations, reduced-motion fallback

---

## Testing

### Frontend Tests

```bash
node --test tests/*.test.mjs
```

22 tests covering:
- API client session isolation
- Contract version and drift detection
- CSS layer contract compliance
- Editor DOM ID contract
- Layout constraints (no scrollable overflow)
- Motion state machine transitions
- Playback clock 8 FPS timing
- Provider session isolation
- Review store concurrency (409 conflict handling)
- Runtime config and workflow routing

### Backend Tests

```bash
python -m pytest tests/
# or
python -m unittest discover -s tests -p 'test_*.py'
```

8+ tests covering:
- Job store thread safety and recovery
- Review store versioned updates and conflicts
- Session store isolation
- Processing pipeline (matting, splitting, normalization)
- HTTP contract compliance
- Demo vs production mode behavior

### Full Verification

```bash
./tools/verify-architecture.sh
# or on Windows:
tools\verify-architecture.bat
```

Runs: contract generation, boundary checking, frontend tests, backend tests, Python compilation, JavaScript syntax validation, and git diff whitespace check.

---

## Security

### API Key Protection

- API keys are submitted once per browser session via the provider connection endpoint.
- Stored in **HttpOnly cookies** (`WINDUP_SESSION`) and process memory only.
- **Never** stored in: browser localStorage, task JSON files, logs, or Git.
- Each browser session has isolated credentials — one session cannot overwrite another's key or model.
- Keys are validated with a non-producing probe (`__windup_auth_probe__`) before acceptance.

### CORS Protection

- In production, set `WINDUP_ALLOWED_ORIGINS` to restrict allowed origins.
- Without this variable, CORS defaults to `localhost` and `127.0.0.1` only.
- A startup warning is printed if `WINDUP_ALLOWED_ORIGINS` is not set in non-demo mode.

### Path Validation

- Candidate asset paths are validated to prevent directory traversal (`..` check).
- Absolute paths in asset references are rejected.
- Character IDs must match `^[a-z0-9-]+$`.

### Asset Safety

- Candidate assets never overwrite formal assets directly.
- Promotion always creates backups before overwriting.
- Failed promotions restore backups automatically.

---

## Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Idle animation appears static | Missing breathing offset table | Fixed in `processing.py` — idle breath offsets `[0,1,1,0,-1,-1,-1,0]` applied during normalization |
| Frame color bleed between frames | `prev_path` using raw (magenta) instead of cutout | Fixed — `gen_frame` now passes cutout path as previous reference |
| Background not removed | Chroma key fails when background color differs from corner sample | Falls back to AI segmentation (`matte.py`); if both fail, frame is rejected |
| Sheet generation fails twice | AI returns wrong aspect ratio or multi-row grid | Retries once, then falls back to frame-by-frame generation |
| Walk frames have wrong poses | Not using skeleton conditioning | Walk actions always use the frame route with deterministic OpenPose skeletons |
| CORS errors from Cocos | `WINDUP_ALLOWED_ORIGINS` not configured | Set the environment variable or ensure Cocos serves from localhost |
| Review conflicts (409) | Multiple tabs/editors reviewing the same job | Merge the conflicting reviews manually or reload the review page |
| Service restart loses tasks | Active jobs marked as `interrupted` | User must explicitly resend the job |
| Contract drift detected | Generated files out of sync with `windup.v1.json` | Run `node tools/generate-contract.mjs` |

### Debugging Tips

1. **Check provenance log**: `generation-data/provenance.jsonl` shows every API call with model, prompt, elapsed time, and provider mode.
2. **Inspect job directory**: `generation-data/jobs/<job_id>/` contains `raw/`, `cutout/`, and `normalized/` subdirectories for debugging.
3. **Verify architecture**: Run `./tools/verify-architecture.sh` before submitting changes.
4. **Check CSS order**: Use `node tools/format-css.mjs asset-lab/styles/*.css` after style changes.

---

## Known Asset Gaps

| Gap | Priority | Description |
|-----|----------|-------------|
| Top-down / Isometric actions | Medium | Need idle, jump, lantern for topdown and isometric views |
| Side view additional actions | Low | Can add attack, hit, death, interaction poses |
| View angle differentiation | Medium | Top-down and isometric angles need further distinction |
| Geometric QA semantics | Ongoing | Automated QA cannot judge foot semantics, anatomy, or style consistency — human review remains essential |

---

## Future Evolution Triggers

Don't introduce heavy infrastructure prematurely. Upgrade when these thresholds are reached:

| Trigger Condition | Upgrade Action | Upward Contract Stays |
|-------------------|---------------|----------------------|
| Frequent task queuing or lost execution state on restart | Background threads → Redis/cloud task queue | Generation job API/status |
| Thousands of task/review files needing queries | JSON Store → SQLite/PostgreSQL | Store methods and version semantics |
| Multi-member remote access or billing involved | Memory sessions → accounts, RBAC, key hosting | Provider session API |
| Assets too large for Git/local disk | File directories → object storage + CDN | Asset URL resolver |
| Frontend domain model grows significantly | Generated `.d.ts` → full TypeScript migration | Versioned product contract |
| Three repositories need independent releases | Relative directory integration → versioned package/API | Character/action manifest |

---

## Contributing

Please read `AGENTS.md`, `CONTRIBUTING.md`, and `docs/ARCHITECTURE.md` before making changes.

### Development Workflow

1. **Start with `git status`** — preserve all user-owned or unrelated changes.
2. **Work on a focused branch** — submit through a PR; never push directly to `main`.
3. **Keep commits reviewable** — separated by concern.
4. **Before handoff**: run `./tools/verify-architecture.sh` and `git diff --check`.
5. **Do not use browser screenshot automation** — visual acceptance is manual.

### Adding an Action

1. Add action name, loop semantics, and 8 phases to `contracts/windup.v1.json`.
2. Run `node tools/generate-contract.mjs` to regenerate frontend constants, types, and backend constants.
3. Add asset directory entries in `data/character-catalog.js`.
4. Write pure function tests for new state transitions — don't modify multiple states in DOM events.

### Definition of Done

- Feature has one clear state owner, no second set of equivalent state.
- Errors, empty states, retries, and recovery paths are defined.
- API keys, user prompts, and candidate assets don't enter Git.
- New public contracts have version or compatibility strategies.
- Related logic tests and `./tools/verify-architecture.sh` pass.
- README/HANDOFF/architecture docs synced only when facts change.
- PR has a single theme, commits split by concern, author can explain data flow and failure paths.

### Review Priority

Review in this order by risk, not file order:
1. Security & data coverage
2. Contract compatibility
3. State ownership
4. Concurrency & failure recovery
5. Testability
6. UI presentation

At least one teammate review required before merge.

---

## Architecture Decision Records

### ADR-001: Single Source for Product Contract
- **Decision**: `contracts/windup.v1.json` is the sole source for actions, views, FPS, loops, phases, and models.
- **Reason**: Prevents frontend/backend divergence causing generation, review, and playback semantic drift.
- **Result**: JS constants/types and Python constants are auto-generated; CI checks for drift.

### ADR-002: Candidate Assets Reviewed Before Adoption
- **Decision**: Generation results only enter job directories; explicit `promote` required before writing to the formal directory.
- **Reason**: Model output is unstable; automated QA cannot judge complete semantics.
- **Result**: Generation, review, and formal delivery can fail and retry without breaking existing assets.

### ADR-003: API Key Session Isolation, No Persistence
- **Decision**: Pages submit the key once; backend saves it in process memory keyed by HttpOnly session ID; jobs receive credential snapshots only.
- **Reason**: Avoids browser storage, task files, and multi-user global overwrite key leaks.
- **Result**: Service restart requires reconnect; production account system can replace `ProviderSessionStore`.

### ADR-004: MVP Uses File Stores, Upper Layers Depend Only on Interfaces
- **Decision**: Jobs and reviews use atomic JSON files with thread locks.
- **Reason**: Local competition prototype needs no database ops, but requires recovery and concurrency protection.
- **Result**: Replacing stores at scale threshold doesn't change routes or page use cases.

### ADR-005: State Ownership Prioritized Over Frameworks
- **Decision**: Continue with small ES Modules; use `EditorSession`, pure reducers, controllers, and generation types for clear boundaries.
- **Reason**: Current complexity doesn't need a large frontend framework; the problem is state competition, not rendering libraries.
- **Result**: Migrate to TypeScript when cross-page domain models grow significantly, without changing product contracts.

### ADR-006: Full Actions Prefer Action Strips, Single Frames for Repair
- **Decision**: Full 8-frame actions default to one horizontal strip with deterministic splitting; rejected frames continue with independent generation.
- **Reason**: Per-frame generation needs 8 model calls (slower, style drift); strips share one composition context.
- **Result**: Full actions typically drop from 8 calls to 1; strip format anomalies fall back to per-frame; provider errors fail directly.

### ADR-007: Catalog, Execution, and Formal Release Are Independent Boundaries
- **Decision**: `AssetCatalog` reads formal assets only; `GenerationExecutor` runs candidate tasks only; `AssetPublisher` handles formal adoption with backups only.
- **Reason**: Combining directory scanning, model calls, task state, and file overwrites in one service creates multiple risk domains.
- **Result**: `GenerationApplication` only validates and orchestrates; new characters assemble completely in temp directories before atomic入库; action adoption failure restores backups.

---

*WindUp Asset Lab — Character generation, review, and delivery pipeline.*
