# Testing Guide

This file covers only the maintained test lanes and the internal harness role. For the shared local dev loop and root command map, use [CONTRIBUTING.md](../CONTRIBUTING.md).

## Test Layout

```text
tests/
├── unit/
├── nuxt/
├── server/
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
apps/harness/convex/
├── *.test.ts
└── lib/*.test.ts
```

## Commands

```bash
pnpm test:types
pnpm test:contracts:repo
pnpm test:contracts
pnpm test:internals
pnpm test
pnpm test:nuxt
pnpm test:browser
pnpm test:e2e
pnpm test:full
```

Maintained root test lanes:

- `pnpm test:nuxt`: Nuxt-only project coverage
- `pnpm test:browser`: browser component coverage
- `pnpm test:e2e`: managed end-to-end smoke suite
- `pnpm test:contracts`: public behavior plus curated example coverage
- `pnpm test:internals`: extracted internal state/runtime helpers only
- `pnpm test`: maintainer default gate for repo plus examples
- `pnpm test:full`: `test` plus managed e2e

Type-only lanes:

- `pnpm test:types`: root type gate
- `pnpm run test:types:harness-server`: unique server-side harness typing for Nitro/MCP bridge code
- `pnpm run test:types:examples:canonical`: intentional coverage for the advanced canonical workspace examples (`04–06`), where the broadest consumer-side typing surface lives

## Vitest Projects

- `unit`: pure helpers and node-only auth/helper/security suites under `tests/unit/**`
- `nuxt`: Nuxt runtime suites under `tests/nuxt/**`
- `server`: server-side auth/cache suites under `tests/server/**`
- `convex`: backend tests in `apps/harness/convex/**`
- `browser`: browser component tests in `tests/browser/**`
- `e2e`: full-stack suites in `tests/e2e/**`
- `examples`: curated workspace-app suites under `examples/*`

## Design Rules

1. `unit` owns pure logic and small mocks.
2. `nuxt` owns composable, plugin, and runtime integration.
3. `server` owns server helper behavior only.
4. `browser` owns component rendering behavior.
5. `convex` owns real backend permission and data behavior in `apps/harness/convex/*.test.ts`.
6. `e2e` owns package-boundary smoke coverage only.
7. Shared test infrastructure lives under `tests/support/*` and should stay focused on setup and reusable primitives rather than custom assertion DSLs.
8. New tests should use `tests/support/*` helpers instead of ad hoc local mocks or process management.
9. E2E specs must not inline process, port, or backend lifecycle helpers.
10. Prefer deterministic assertions over sleeps.

Before adding a new auth test, place it in the single suite that owns that behavior; do not duplicate the same invariant in both behavior and OWASP suites.

## Maintainer-facing lanes

The repo keeps four meaningful root lanes:

- `pnpm test:contracts`
  - `pnpm test:contracts:repo`
  - `pnpm test:examples`
  - public composable/plugin behavior
  - server helpers
  - installer behavior
  - example consumer coverage
  - doctor/apps/docs architecture guard tests
- `pnpm test:internals`
  - extracted pure helpers
  - internal state machines
  - no broad white-box tests for reactive composables

`pnpm test` is the maintainer default gate:

- `pnpm test:repo`
- `pnpm test:examples`

`pnpm test:nuxt` and `pnpm test:browser` are focused debugging lanes, not primary gates.

The repo intentionally does not keep separate root aliases for every Vitest project. If you need only the server or auth project, call Vitest directly with `--project`.

Rule of thumb:

- if a test protects user-facing behavior, keep it in contract coverage
- if a test protects extracted pure logic, keep it in internal coverage
- if a branch is hard to test cleanly, extract a pure helper first instead of poking deeper into the reactive runtime

## Support Layout

- `tests/support/auth`: auth harnesses, JWT factories, token exchange mocks, server auth fixtures
- `tests/support/nuxt`: composable/runtime capture helpers and mock Convex client utilities
- `tests/support/e2e`: managed local Convex, managed Nuxt dev server, ports, HTTP helpers, MCP helpers
- `tests/support/unit`: shared unit-test harnesses and validation helpers
- `tests/support/browser`: browser shims for Vitest aliases

## Managed E2E

`pnpm test:e2e` is managed-only. It rebuilds the module, kills conflicting listeners on the configured local Convex ports, boots its own local backend, waits for an explicit internal-harness readiness endpoint, injects the identity-forwarding env required by the MCP smoke suite, and tears everything down when the run finishes.

Managed bootstrap failures are test failures. The smoke suites do not downgrade local backend startup problems into skips.

Normal contributors should not prestart Convex for the smoke suite. The only required manual setup is the local Better Auth config inside `apps/harness/.env.local`, which is the canonical local env file read by Convex and the harness.

If local auth has not been initialized yet:

```bash
cd /path/to/@lupinum/trellis/apps/harness
pnpm exec convex dev --local --once
pnpm exec convex env set SITE_URL http://localhost:3000 --env-file .env.local
pnpm exec convex env set BETTER_AUTH_SECRET <strong-random-secret> --env-file .env.local
cd /path/to/@lupinum/trellis
pnpm test:e2e
```

## Maintenance

- `pnpm test:examples` runs the curated example suites that exercise the package from workspace apps.
- PR-safe default gate: `pnpm test:types && pnpm lint && pnpm test:contracts`
- broader integration gate: `pnpm test`
- release gate: `pnpm run release:verify`

`release:verify` is the 1.0 production gate. It runs formatting, lint, publish-surface checks, type checks, contract tests, the full repo/example test lane, managed e2e, starter fixture typecheck/build checks, package workspace-reference checks, production audit, and build.

Tracked Convex `_generated` artifacts are also checked for drift before release. If a test or codegen command mutates committed generated output, regenerate and commit the artifact or remove it from source control.

Example-specific Playwright flows, such as `examples/04-saas-platform/test:e2e`, are not part of the root 1.0 confidence gate because they are manual app-local flows rather than managed root infrastructure.

- For ad hoc test discovery, use `rg --files tests` directly instead of maintaining root-level listing scripts.

## Fixture classification

Current fixture roles:

- `tests/fixtures/consumer-smoke*`: package publish-surface smoke fixtures
- `tests/fixtures/doctor-*`: doctor-only fixtures
- `tests/fixtures/basic`: minimal scaffold fixture and merge/delete review candidate if it stops protecting a unique path

## Internal harness role

`apps/harness/` stays because it owns unique signal that the public examples do not:

- repo-level Convex runtime tests under `apps/harness/convex/**`
- the root `pnpm dev` maintainer app
- managed e2e target app
- auth, identity-forwarding, and MCP integration seams that are easier to verify in one controlled workspace

It is not the public product story and it should not be used as example-app documentation.
