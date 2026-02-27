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

1. Run local Convex backend (or export `CONVEX_URL` + `CONVEX_SITE_URL`).
2. Configure Better Auth in local Convex env:
   - `BETTER_AUTH_SECRET`
   - `SITE_URL` (must include `http://localhost:3000` for strict auth-loop E2E)
3. Keep E2E manual/local (`pnpm test:e2e`), not part of CI gate.

### Auth-loop bootstrap (strict fail-fast)

```bash
cd /Users/matthias/Git/libs/better-convex-nuxt/playground
npx convex dev --local --once
npx convex env set SITE_URL http://localhost:3000 --env-file .env.local
npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
cd /Users/matthias/Git/libs/better-convex-nuxt
pnpm test:e2e
```

The auth-loop suite is intentionally strict: it does not soft-skip setup errors.
If setup is incomplete, preflight checks fail immediately with actionable diagnostics.

## Regression workflow

1. Reproduce with a failing test in the right tier.
2. Fix the bug.
3. Keep the regression test as a contract.
