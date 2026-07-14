# Testing Guide (Deterministic Multi-Tier)

## Why this layout

Flaky tests came from using full browser E2E for composable-level behavior.
The suite now uses deterministic tiers so we only use E2E where the full stack
boundary is required.

## Test layout

```
test/
├── unit/                                  # Pure TS logic
├── nuxt/                                  # Composables in Nuxt runtime (happy-dom)
├── browser/                               # Native browser component rendering
├── e2e/                                   # Thin full-stack manual tests
├── helpers/                               # Shared deterministic harnesses
└── fixtures/                              # Minimal Nuxt fixture(s)

playground/convex/
├── *.test.ts                              # Backend function tests with convex-test
└── lib/*.test.ts                          # Backend helper/permission unit tests
```

## Vitest projects

- `unit`: Node-only tests.
- `convex`: backend logic via `convex-test` (`edge-runtime`).
- `nuxt`: composable contracts in Nuxt runtime.
- `browser`: component rendering in Chromium via Vitest Browser Mode.
- `e2e`: thin full-stack tests; serial execution.

## Commands

```bash
# CI/local reliability gate (unit + convex + nuxt + browser)
pnpm test

# Fast dev loop for frontend/runtime
pnpm test:watch

# Nuxt runtime composables only
pnpm test:nuxt

# Browser component suite
pnpm test:browser

# Full-stack E2E (manual/local)
pnpm test:e2e

# Non-E2E full matrix
pnpm test:full
```

## Design rules

1. Runtime/composable behavior goes to `test/nuxt`.
2. Pure DOM visibility/render rules go to `test/browser`.
3. End-to-end stays thin and intentional in `test/e2e`.
4. Backend behavior belongs in `playground/convex/*.test.ts`.
5. Avoid fixed sleeps in `test/nuxt` and `test/browser`.
6. Prefer direct reactive state assertions over scraping `body` text.

## E2E local requirements

1. Run a local Convex backend (or export its `CONVEX_URL` + `CONVEX_SITE_URL`).
2. Configure Better Auth in local Convex env:
   - `BETTER_AUTH_SECRET`
   - `SITE_URL` (must be `http://localhost:3050` for the auth-loop E2E)
3. Keep E2E manual/local (`pnpm test:e2e`), not part of CI gate.

`pnpm test:e2e` sets `CONVEX_E2E_AUTO_START=true`. The helper launches the root
workspace's pinned Convex CLI directly with the same `convex dev` command shown
below, reads the URLs written by the CLI, configures the two E2E-only Better Auth
values, and stops only the backend process it started. It does not assume fixed
ports.

This is the supported Convex 1.40 ceremony. In a clean non-interactive checkout,
`convex dev` provisions an anonymous local deployment automatically. If
`.env.local` already selects a local deployment, the same command starts that
deployment. The removed `convex dev --local` flag is not supported by Convex
1.40. The first clean start needs network access to download the local backend
binary.

### Auth-loop bootstrap

The automatic path needs no separate bootstrap:

```bash
pnpm test:e2e
```

To run the backend yourself, keep this command running in one terminal:

```bash
cd playground
pnpm exec convex dev
```

Then configure and run the suite from another terminal:

```bash
cd playground
pnpm exec convex env set SITE_URL http://localhost:3050 --env-file .env.local
pnpm exec convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
cd ..
CONVEX_E2E_AUTO_START=false pnpm test:e2e
```

For an account-linked project whose local deployment is not currently selected,
select it once before starting the backend:

```bash
cd playground
pnpm exec convex deployment select local
pnpm exec convex dev
```

## Regression workflow

1. Reproduce with a failing test in the right tier.
2. Fix the bug.
3. Keep the regression test as a contract.
