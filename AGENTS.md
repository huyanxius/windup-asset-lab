# Windup Agent Rules

Read this file, `HANDOFF.md`, `docs/ARCHITECTURE.md`, and `CONTRIBUTING.md` before changing code.

## Required workflow

1. Start with `git status`. Preserve all user-owned or unrelated changes.
2. Work on a focused branch and submit through a PR; never push directly to `main` and never force-push.
3. Keep commits reviewable and separated by concern. Generated output and mechanical formatting may be committed with their source change.
4. Before handoff run `./tools/verify-architecture.sh` and `git diff --check`.
5. Do not use browser screenshot automation for verification. Visual acceptance is manual; automated checks cover logic, contracts and HTTP behavior.

## Architecture rules

- `contracts/windup.v1.json` is the only source for views, actions, 8 FPS, loop behavior, pose phases and image models. Run `node tools/generate-contract.mjs`; never hand-edit generated files.
- Frontend dependency direction is `app entry → pages → features → core/data`. `core` cannot import `pages` or `features`; `features` cannot import `pages`.
- All browser HTTP goes through `asset-lab/core/api-client.js`. All editor animation intervals go through `PlaybackClock`.
- `server/app.py` is an HTTP adapter only. Business use cases live in `GenerationApplication`; provider, storage and processing remain replaceable boundaries.
- A candidate asset never overwrites a formal asset until explicit promotion, and promotion must retain a backup.
- API keys never enter source, browser storage, task JSON, logs or Git. Provider credentials are session-isolated in memory.
- Editor styles use the fixed order `foundation → surface → drawer → workspace → components → integrations → motion`. Do not bulk-change precedence, remove `!important`, merge files, or introduce Cascade Layers without explicit manual visual acceptance of the drawer, filmstrip and full-screen layout.

## Scope safety

- Never commit `.env`, credentials, `node_modules`, generated job data or large build artifacts.
- The modified Skeleton walk PNGs may be user-owned; do not stage them unless the user explicitly asks.
- Do not modify the separate `/Users/huyan/Desktop/windup-pipeline` teammate repository while working in this repository.
