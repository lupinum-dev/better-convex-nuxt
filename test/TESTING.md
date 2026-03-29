# Testing Guide

This file only covers test strategy and test-specific setup. For shared local env and workspace setup, use [DEVELOPMENT.md](../DEVELOPMENT.md).

## Test Layout

```text
test/
├── unit/
├── nuxt/
├── auth/
├── browser/
├── e2e/
├── harness/
├── helpers/
└── fixtures/
```

Backend tests live in:

```text
playground/convex/
├── *.test.ts
└── lib/*.test.ts
```

## Commands

```bash
pnpm test
pnpm test:auth
pnpm test:server
pnpm test:watch
pnpm test:nuxt
pnpm test:browser
pnpm test:e2e
pnpm test:full
```

## Vitest Projects

- `unit`: pure helpers under `test/unit/**` and auth helper/security suites under `test/auth/**/*.test.ts`
- `nuxt`: Nuxt runtime suites under `test/nuxt/**` and `test/auth/**/*.nuxt.test.ts`
- `server`: server-side auth/cache suites under `test/auth/**/*.server.test.ts`
- `convex`: backend tests in `playground/convex/**`
- `browser`: browser component tests in `test/browser/**`
- `e2e`: full-stack suites in `test/e2e/**`

## Design Rules

1. Runtime/composable behavior goes in `test/nuxt`.
2. New auth runtime and security coverage goes in `test/auth`.
3. Shared auth test utilities live in `test/harness`.
4. Pure browser rendering behavior goes in `test/browser`.
5. Full-stack tests stay thin and intentional in `test/e2e`.
6. Convex/backend behavior belongs in `playground/convex/*.test.ts`.
7. Prefer deterministic assertions over sleeps.

## E2E Auth Setup

For local auth-loop E2E you need:

- local Convex running
- `CONVEX_URL`
- optionally `CONVEX_SITE_URL` if you are not using the local default
- `SITE_URL`
- `BETTER_AUTH_SECRET`

Example:

```bash
cd /Users/matthias/Git/libs/better-convex-nuxt/playground
npx convex dev --local --once
npx convex env set SITE_URL http://localhost:3000 --env-file .env.local
npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
cd /Users/matthias/Git/libs/better-convex-nuxt
pnpm test:e2e
```

The auth-loop suite is intentionally strict and fails fast when setup is incomplete.
