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
├── support/
│   ├── auth/
│   ├── browser/
│   ├── e2e/
│   ├── nuxt/
│   └── unit/
└── fixtures/
```

Backend tests live in:

```text
test/internal-harness/convex/
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
pnpm test:list
```

## Vitest Projects

- `unit`: pure helpers under `test/unit/**` and auth helper/security suites under `test/auth/**/*.test.ts`
- `nuxt`: Nuxt runtime suites under `test/nuxt/**` and `test/auth/**/*.nuxt.test.ts`
- `server`: server-side auth/cache suites under `test/auth/**/*.server.test.ts`
- `convex`: backend tests in `test/internal-harness/convex/**`
- `browser`: browser component tests in `test/browser/**`
- `e2e`: full-stack suites in `test/e2e/**`

## Design Rules

1. `unit` owns pure logic and small mocks.
2. `nuxt` owns composable, plugin, and runtime integration.
3. `server` owns server helper behavior only.
4. `browser` owns component rendering behavior.
5. `convex` owns real backend permission and data behavior in `test/internal-harness/convex/*.test.ts`.
6. `e2e` owns package-boundary smoke coverage only.
7. Shared test infrastructure lives under `test/support/*` and should stay focused on setup and reusable primitives rather than custom assertion DSLs.
8. New tests should use `test/support/*` helpers instead of ad hoc local mocks or process management.
9. E2E specs must not inline process, port, or backend lifecycle helpers.
10. Prefer deterministic assertions over sleeps.

Before adding a new auth test, place it in the single suite that owns that behavior; do not duplicate the same invariant in both behavior and OWASP suites.

## Support Layout

- `test/support/auth`: auth harnesses, JWT factories, token exchange mocks, server auth fixtures
- `test/support/nuxt`: composable/runtime capture helpers and mock Convex client utilities
- `test/support/e2e`: managed local Convex, managed Nuxt dev server, ports, HTTP helpers, MCP helpers
- `test/support/unit`: shared unit-test harnesses and validation helpers
- `test/support/browser`: browser shims for Vitest aliases

## Managed E2E

`pnpm test:e2e` is managed-only. It rebuilds the module, kills conflicting listeners on the configured local Convex ports, boots its own local backend, injects the trusted-caller env required by the MCP smoke suite, and tears everything down when the run finishes.

Normal contributors should not prestart Convex for the smoke suite. The only required manual setup is the local Better Auth config inside `test/internal-harness/.env.local`.

If local auth has not been initialized yet:

```bash
cd /path/to/@lupinum/trellis/test/internal-harness
npx convex dev --local --once
npx convex env set SITE_URL http://localhost:3000 --env-file .env.local
npx convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
cd /path/to/@lupinum/trellis
pnpm test:e2e
```

## Maintenance

- `pnpm test:list` lists repo-owned test files while excluding `test/fixtures/**/node_modules`.
