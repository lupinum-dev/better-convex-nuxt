# Testing Harness Implementation Plan

> **Status:** Ready for implementation
> **Source RFC:** `testing-harness-rfc.md`
> **Delivery model:** Greenfield hard cutover
> **Audience:** A contributor who is new to the repository
> **Last revised:** 2026-07-09

## 1. Purpose

This document turns the testing RFC into an ordered, file-level implementation
plan. Follow the phases in order. Do not leave the old and new full-stack paths
running side by side after a migration phase passes.

The final system has one clear owner for each type of proof:

| Layer | Runner                           | Responsibility                                          |
| ----- | -------------------------------- | ------------------------------------------------------- |
| L0    | ESLint, TypeScript, Node scripts | Static, package, export, and consumer contracts         |
| L1    | Vitest `unit`                    | Pure logic, state transitions, parsers, races           |
| L2    | Vitest `convex`                  | Convex backend business rules with `convex-test`        |
| L3    | Vitest `nuxt`                    | Nuxt composable and lifecycle orchestration             |
| L4    | Playwright Test                  | Real Nuxt + real local Convex + real browser boundaries |

The implementation is complete only when the old Vitest `browser` and `e2e`
projects, their duplicate scripts, and `test/helpers/local-convex.ts` are deleted.

## 2. Non-negotiable implementation rules

1. Work on one phase at a time.
2. Begin every phase from a green baseline.
3. Add the replacement before deleting the old path, then delete the old path in
   the same phase once the replacement passes.
4. Do not add test-only code to `src/runtime/**` unless a task explicitly proves
   that no existing boundary can observe the invariant.
5. Do not add a generic operation ledger, event bus, test endpoint in the shipped
   module, dual-driver conformance framework, or generated Cartesian matrix.
6. Use controlled promises for races and Playwright routing for network
   disruption. Never use fixed sleeps.
7. Required tests use zero retries and may not conditionally skip.
8. All full-stack test data is reset before every test and additionally carries a
   per-test identifier where useful for diagnostics.
9. CI uses the committed lockfile and repository-pinned pnpm version.
10. When a task changes a command, update `test/TESTING.md` in the same commit.

## 3. Target repository layout

The completed migration should leave this relevant structure:

```text
.
├── playwright.config.ts
├── scripts/
│   ├── check-forbidden-pattern.mjs
│   ├── pack-consumer-fixture.mjs
│   ├── start-test-stack.mjs
│   └── verify-release.mjs
├── test/
│   ├── fullstack/
│   │   ├── core/
│   │   │   ├── auth.spec.ts
│   │   │   ├── module-and-server.spec.ts
│   │   │   ├── pagination.spec.ts
│   │   │   ├── query.spec.ts
│   │   │   ├── routing.spec.ts
│   │   │   ├── upload.spec.ts
│   │   │   └── writes.spec.ts
│   │   ├── resilience/
│   │   │   ├── auth-races.spec.ts
│   │   │   ├── navigation-soak.spec.ts
│   │   │   └── websocket-recovery.spec.ts
│   │   ├── fixtures.ts
│   │   └── helpers/
│   │       ├── auth.ts
│   │       └── stack-runtime.ts
│   ├── fixtures/
│   │   ├── consumer-smoke/
│   │   ├── missing-convex-api/
│   │   └── nuxt-floor/
│   ├── helpers/
│   │   ├── mock-convex-client.ts
│   │   ├── nuxt-runtime-harness.ts
│   │   └── wait-for.ts
│   ├── nuxt/
│   └── unit/
├── playground/
│   ├── pages/__test__/
│   │   ├── auth-mixed.vue
│   │   ├── navigation-index.vue
│   │   ├── navigation-target.vue
│   │   ├── pagination.vue
│   │   ├── query-client-live.vue
│   │   ├── query-http-only.vue
│   │   ├── query-lifecycle.vue
│   │   ├── query-shared.vue
│   │   ├── query-ssr-live.vue
│   │   ├── upload.vue
│   │   └── writes.vue
│   └── server/api/__test__/
│       └── health.get.ts
└── vitest.config.ts
```

`test/.runtime/` is generated and ignored. It contains the selected local Convex
deployment environment, the Playwright stack descriptor, logs, reports, traces,
and packed tarballs. It is never committed.

## 4. Phase summary and dependencies

| Phase | Outcome                                                            | Depends on |
| ----- | ------------------------------------------------------------------ | ---------- |
| 0     | Baseline, migration map, timings                                   | Nothing    |
| 1     | Deterministic tooling and contract checks                          | Phase 0    |
| 2     | One working Playwright/Convex stack and migrated old E2E tests     | Phase 1    |
| 3     | Critical query, hydration, auth, and privacy contracts             | Phase 2    |
| 4     | Pagination, writes, upload, packaging, and browser-project removal | Phase 3    |
| 5     | Resilience, compatibility, and Renovate attribution                | Phase 4    |
| 6     | Release adoption, final deletion, and documentation                | Phase 5    |

Do not start Phase 3 until Phase 2 can start and stop the stack reliably on a
fresh CI runner.

### Master progress checklist

- [ ] P0.1 Record the clean baseline
- [ ] P0.2 Create the migration map
- [ ] P0.3 Capture operation-count regressions
- [ ] P1.1 Make installs reproducible
- [ ] P1.2 Replace unsafe negative grep scripts
- [ ] P1.3 Establish the final command vocabulary
- [ ] P1.4 Add generated-runtime ignores
- [ ] P1.5 Add executable timing budgets
- [ ] P2.1 Simplify runner dependencies
- [ ] P2.2 Add the Playwright configuration
- [ ] P2.3 Implement one stack owner
- [ ] P2.4 Add a real readiness endpoint
- [ ] P2.5 Harden the existing reset mutation
- [ ] P2.6 Add Playwright fixtures and diagnostics
- [ ] P2.7 Create explicit test-only pages
- [ ] P2.8 Migrate the useful old E2E contracts
- [ ] P2.9 Remove the old Vitest E2E path
- [ ] P3.1 Implement Q1
- [ ] P3.2 Implement Q2 and Q3
- [ ] P3.3 Implement Q4 and Q5
- [ ] P3.4 Implement Q6
- [ ] P3.5 Implement A1–A3
- [ ] P3.6 Implement A4
- [ ] P3.7 Complete A5 at the correct tiers
- [ ] P3.8 Promote L4 core to a required check
- [ ] P4.1 Implement P1 pagination coverage
- [ ] P4.2 Implement W1 and W2
- [ ] P4.3 Implement U1
- [ ] P4.4 Implement N1
- [ ] P4.5 Implement N2 and N3
- [ ] P4.6 Build the demo against the current tarball
- [ ] P4.7 Remove the Vitest browser project
- [ ] P5.1 Implement R1 and R2
- [ ] P5.2 Implement R3
- [ ] P5.3 Implement R4
- [ ] P5.4 Prove the declared Nuxt floor
- [ ] P5.5 Reconfigure Renovate
- [ ] P5.6 Add latest-supported verification
- [ ] P6.1 Create one release verifier
- [ ] P6.2 Install the final CI structure
- [ ] P6.3 Delete migration residue
- [ ] P6.4 Rewrite the operating guide
- [ ] P6.5 Run final acceptance

---

## 5. Phase 0 — Freeze behavior and measure

### P0.1 Record the clean baseline

Run from the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run dev:prepare
pnpm run format:check
pnpm run lint
pnpm run test:types
pnpm run check:contracts
pnpm run test
```

Record the following in a new section at the bottom of `test/TESTING.md` named
“Migration baseline”:

- commit SHA;
- Node version;
- pnpm version;
- test count per Vitest project;
- wall time for `test`, `check:contracts`, and `prepack`;
- which existing E2E files run without a real Convex backend;
- which existing E2E files skip without `CONVEX_URL`.

**Verification criteria**

- Every baseline command exits 0.
- The baseline records actual measured values, not estimates.
- `git diff --check` exits 0.

### P0.2 Create the migration map

Add this mapping to `test/TESTING.md` during the migration and remove it in Phase
6 after all rows are complete:

| Existing file                                          | New owner          | Replacement                                                     |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------- |
| `test/e2e/auth-loop.e2e.test.ts`                       | L4 core            | `auth.spec.ts` A2/A3                                            |
| `test/e2e/auth-proxy-plugin-routes.e2e.test.ts`        | L4 core            | `module-and-server.spec.ts` N3                                  |
| `test/e2e/connection-state.e2e.test.ts`                | L3 + L4 resilience | connection shape runtime test + R3                              |
| `test/e2e/plugin-server-misconfig-overlay.e2e.test.ts` | L1                 | existing plugin-server failure-policy tests, expanded if needed |
| `test/e2e/realtime-subscription.e2e.test.ts`           | L4 core            | `query.spec.ts` Q1                                              |
| `test/e2e/route-protection.e2e.test.ts`                | L4 core            | `routing.spec.ts` N2                                            |
| `test/e2e/server-utils-smoke.e2e.test.ts`              | L4 core            | `module-and-server.spec.ts` N3                                  |
| `test/e2e/smoke-ssr.e2e.test.ts`                       | L0/L4 core         | packed consumer N1                                              |
| `test/browser/ConvexAuthComponents.browser.test.ts`    | L3                 | Nuxt component/runtime tests                                    |

Do not preserve a test merely because it already exists. Preserve its useful
contract at the lowest adequate layer.

**Verification criteria**

- Every old browser/E2E file has exactly one target owner.
- No old file is marked “keep both”.
- The misconfiguration overlay test is retained only if it proves something not
  already covered by `test/unit/plugin-server-auth-misconfig.test.ts`.

### P0.3 Capture operation-count regressions before infrastructure work

Confirm or add deterministic tests for these existing invariants:

- one underlying listener for two identical query consumers;
- listener remains after the first consumer unmounts;
- listener is removed after the final consumer unmounts;
- active args -> `skip` removes the listener;
- `auth:'none'` and `auth:'auto'` use different subscription cache keys;
- signed-out purge removes private payload keys and retains public-only keys;
- SSR queries reuse the plugin-resolved token rather than exchanging again;
- stale auth results cannot commit after sign-out.

Primary files:

- `test/nuxt/useConvexQuery.nuxt.test.ts`
- `test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts`
- `test/nuxt/useConvexQuery.signout-public.nuxt.test.ts`
- `test/nuxt/useConvexQuery.signout-purge.nuxt.test.ts`
- `test/nuxt/client-engine.signout-lifecycle.nuxt.test.ts`
- `test/unit/convex-cache-auth-token.test.ts`
- `test/unit/server-convex-utils.test.ts`

**Verification criteria**

- Each invariant has an explicit count or state assertion.
- Removing the guarded release, purge, or generation check makes the owning test
  fail.
- No production instrumentation is added.

---

## 6. Phase 1 — Deterministic foundation

### P1.1 Make installs reproducible

Update `.github/workflows/ci.yml`:

- keep `actions/setup-node` on the chosen supported Node version;
- run `corepack enable` without globally installing `corepack@latest`;
- run `pnpm install --frozen-lockfile` from the repository root;
- replace `npx nypm@latest` calls;
- use `pnpm exec playwright install --with-deps chromium`;
- use pnpm scripts consistently.

Update `.github/workflows/deploy-convex.yml` separately. It has its own demo
lockfile, so use `pnpm install --frozen-lockfile` in `demo/` and `pnpm exec convex
deploy`.

Do not merge the demo lockfile into the root lockfile as part of this testing
change.

**Verification criteria**

- A clean CI install does not modify any lockfile.
- Searching `.github` for `nypm@latest`, `corepack@latest`, and `npx playwright`
  returns no blocking-CI matches.
- Running `pnpm install --frozen-lockfile` from a clean checkout exits 0.

### P1.2 Replace unsafe negative grep scripts

Create `scripts/check-forbidden-pattern.mjs` using Cornerstone C1. Convert every
`check:no-*` package script to call it with a pattern followed by one or more
paths.

Create `test/unit/check-forbidden-pattern.test.ts`. Test four outcomes:

1. no match -> exit 0;
2. match -> non-zero and matching lines printed;
3. nonexistent path -> non-zero harness error;
4. unavailable ripgrep binary -> non-zero harness error.

The script must distinguish ripgrep exit 1 (“no match”) from all execution
errors.

**Verification criteria**

- Every old `sh -c '! rg` package script is removed.
- `rg -n "sh -c.*! rg" package.json scripts` finds nothing.
- All four meta-tests pass.
- Seeding one forbidden API use makes `pnpm run lint` fail.

### P1.3 Establish the final command vocabulary

Add or normalize these package scripts:

```json
{
  "check": "pnpm run format:check && pnpm run lint && pnpm run test:types && pnpm run check:contracts",
  "test": "vitest run --project=unit --project=convex --project=nuxt",
  "test:unit": "vitest run --project=unit",
  "test:convex": "vitest run --project=convex",
  "test:nuxt": "vitest run --project=nuxt",
  "test:fullstack": "playwright test --project=core",
  "test:resilience": "playwright test --project=resilience",
  "verify:release": "node scripts/verify-release.mjs"
}
```

During Phases 1–3, retain the old scripts only while they still own unmigrated
tests. Remove `test:browser`, `test:e2e`, `test:e2e:full`, and the old `test:full`
at their deletion tasks.

**Verification criteria**

- Each final command is documented in `test/TESTING.md`.
- `pnpm test` does not invoke Playwright or a local backend.
- `pnpm test:fullstack` has one meaning: L4 core.

### P1.4 Add generated-runtime ignores

Add these paths to `.gitignore`:

```gitignore
test/.runtime/
playwright-report/
```

The stack owner must write generated Convex configuration under `test/.runtime`,
not `playground/.env.local`. A test run must never overwrite a developer's
selected deployment.

**Verification criteria**

- `git check-ignore test/.runtime/stack.json` exits 0.
- Starting the test stack leaves `playground/.env.local` byte-for-byte unchanged.

### P1.5 Add executable timing budgets

Add CI job timeouts and record command durations in the job summary:

| Command                   | Ceiling            |
| ------------------------- | ------------------ |
| `pnpm test:unit`          | 20 seconds locally |
| `pnpm test:convex`        | 30 seconds locally |
| `pnpm test:nuxt`          | 90 seconds locally |
| `pnpm test:fullstack`     | 8 minutes in CI    |
| `pnpm test:resilience`    | 12 minutes in CI   |
| full release verification | 30 minutes         |

Do not fail on small per-run timing variance. The CI job timeout is the hard
guard; the documented baseline is the trend reference.

**Verification criteria**

- Every CI job has an explicit timeout.
- The measured baseline and ceiling are present in `test/TESTING.md`.
- A deliberately hung test is terminated by the owning job timeout.

**Phase 1 exit gate**

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
git diff --check
```

All commands must pass twice from a clean install without changing tracked files.

---

## 7. Phase 2 — Playwright hard cutover

### P2.1 Simplify runner dependencies

Keep `@playwright/test`. Do not add a second browser automation package.

After the old Vitest browser project is deleted in Phase 4, remove:

- `@vitest/browser-playwright`;
- `vitest-browser-vue`;
- direct `playwright-core` if no other code imports it;
- `@vitejs/plugin-vue` if it is no longer used outside the deleted browser
  project.

Do not remove those packages before their last caller is migrated.

**Verification criteria**

- `pnpm why @playwright/test` shows one full-stack runner dependency.
- No dependency is removed while a tracked source/config file imports it.
- After Phase 4, repository search finds no Vitest Browser Mode imports.

### P2.2 Add the Playwright configuration

Create `playwright.config.ts` from Cornerstone C2.

Important decisions:

- standard `@playwright/test`, not Vitest E2E;
- `testDir: './test/fullstack'`;
- one worker;
- zero retries;
- `trace: 'retain-on-failure'`;
- Chromium only;
- `core` and `resilience` projects selected by directories;
- one `webServer` command: `node scripts/start-test-stack.mjs`;
- readiness URL: `http://127.0.0.1:4300/api/__test__/health`;
- `reuseExistingServer: false` so an unrelated local process cannot satisfy CI.

**Verification criteria**

- `pnpm exec playwright test --list` lists the correct project/test paths.
- `test.only` fails in CI.
- A failed sample assertion produces a trace and screenshot under ignored output.
- No retry turns a failure green.

### P2.3 Implement one stack owner

Create `scripts/start-test-stack.mjs` from Cornerstone C3. It owns:

- creation of `test/.runtime/convex.env`;
- a dedicated local backend port, initially 3214;
- a dedicated Nuxt port, initially 4300;
- an unguessable Better Auth secret;
- an unguessable reset token;
- Convex environment setup;
- Nuxt startup;
- prefixed log forwarding;
- `test/.runtime/stack.json`;
- process-group teardown on success, failure, SIGINT, and SIGTERM.

Use the pinned local CLI through `pnpm exec convex`. Start it with piped stdio and
the dedicated `--env-file`. Piped stdio makes the invocation non-interactive, so
an unconfigured checkout selects an anonymous local deployment rather than a
developer cloud deployment.

Required Convex environment variables:

- `SITE_URL=http://127.0.0.1:4300`;
- `BETTER_AUTH_SECRET=<generated secret>`;
- `IS_TEST=true`;
- `BCN_TEST_RESET_TOKEN=<generated token>`.

Required `stack.json` fields:

```json
{
  "appUrl": "http://127.0.0.1:4300",
  "convexUrl": "http://127.0.0.1:3214",
  "convexSiteUrl": "http://127.0.0.1:3215",
  "resetToken": "generated-per-run-value"
}
```

The actual URLs should be read from the generated Convex env file when available;
do not assume the site URL is always `port + 1` after readiness.

**Verification criteria**

- Fresh checkout: stack starts without a TTY, account, deploy key, or committed
  `.env.local`.
- A second stack on the same ports fails with a useful occupied-port message.
- Killing Playwright leaves no Convex or Nuxt child process.
- Removing the Convex binary/network access fails before tests with captured logs.
- The health endpoint becomes ready within 60 seconds on CI.

### P2.4 Add a real readiness endpoint

Create `playground/server/api/__test__/health.get.ts` from Cornerstone C4.

It must check all three layers:

1. the Nuxt/Nitro server is running;
2. an unauthenticated `serverConvexQuery` reaches
   `api.testing.healthCheck` on the real backend;
3. the Better Auth `get-session` endpoint is reachable at the configured Convex
   site URL.

Return 404 unless `BCN_TEST_MODE=true` exists in the Nuxt process environment.
Return 503 with a safe component name when a dependency is not ready. Do not
include secrets, response bodies, cookies, or tokens.

**Verification criteria**

- Healthy stack returns HTTP 200 and `{ nuxt: true, convex: true, auth: true }`.
- Stopped Convex backend returns 503.
- Invalid Better Auth configuration returns 503.
- Starting the playground normally without `BCN_TEST_MODE` returns 404.

### P2.5 Harden the existing reset mutation

Modify `playground/convex/testing.ts`; do not add a second reset function.

Required changes:

- replace `ALLOW_TEST_RESET` and the fixed confirmation string with `IS_TEST` and
  the per-run `BCN_TEST_RESET_TOKEN`;
- delete every app-table document;
- fail if a Better Auth component table cannot be cleared;
- cancel pending scheduled functions;
- delete stored files;
- return deletion counts useful for diagnostics;
- never log raw auth documents or tokens.

Use Cornerstone C5 for the guarded shape.

Add `playground/convex/testing.test.ts` or extend the appropriate Convex tests:

- wrong/missing reset token rejects;
- missing `IS_TEST` rejects;
- app tables are cleared;
- stored files are deleted;
- scheduled work is cancelled where `convex-test` supports the assertion.

**Verification criteria**

- The reset test fails if either guard is removed.
- The full-stack fixture can reset twice idempotently.
- A seeded user, session, task, note, scheduled job, and stored file are absent
  after reset.
- No `catch` block converts failed Better Auth cleanup into a green reset.

### P2.6 Add Playwright fixtures and diagnostics

Create:

- `test/fullstack/helpers/stack-runtime.ts`;
- `test/fullstack/helpers/auth.ts`;
- `test/fullstack/fixtures.ts`.

Use Cornerstones C6 and C7.

Fixtures must provide:

- parsed, validated stack runtime values;
- automatic backend reset before each test;
- deterministic `testId` based on Playwright's test ID;
- collection of browser console errors and warnings;
- collection of uncaught page errors;
- collection of browser-visible request failures;
- optional WebSocket frame/open/close diagnostics;
- isolated additional browser sessions;
- attachments on failure.

Unexpected browser errors fail the test. An expected-error test must register a
specific regular-expression allowance before causing the error. Do not globally
ignore hydration warnings, network failures, or messages containing “Convex”.

**Verification criteria**

- A deliberate `console.error` makes a green test red.
- A deliberate uncaught page exception makes a green test red.
- A failing test report contains the diagnostics attachment.
- Each test begins with empty app and auth data.

### P2.7 Create explicit test-only pages

Create the `playground/pages/__test__/` pages listed in section 3. These pages
must be deliberately plain and stable:

- no application layout dependency;
- no animation;
- no third-party UI components;
- semantic headings/buttons plus `data-testid` for machine state;
- query results serialized in a deterministic order;
- no timers used to indicate readiness;
- every action exposes a clear settled state.

Do not create one query-param-driven mega page. Each page pins one public contract
and can be understood without reading a mode generator.

**Verification criteria**

- Every page has one named contract and stable readiness marker.
- Every button/input used by a test has a semantic locator or `data-testid`.
- No `setTimeout`, animation-dependent assertion, or mode query parser is added.
- `pnpm exec nuxi typecheck --cwd playground` passes.

### P2.8 Migrate the useful old E2E contracts

Before adding new coverage, move the existing useful contracts:

- realtime subscription -> `core/query.spec.ts`;
- auth signup/sign-out -> `core/auth.spec.ts`;
- route protection -> `core/routing.spec.ts`;
- server helper round trip -> `core/module-and-server.spec.ts`;
- auth proxy catch-all -> test against a guarded playground HTTP probe route;
- connection state shape -> L3 runtime assertion;
- SSR smoke -> packed consumer task in Phase 4.

For each move:

1. make the new test fail when its guarded behavior is disabled;
2. restore the behavior and make it green;
3. delete the old test immediately.

The plugin misconfiguration overlay test is deleted after its production/dev
policy and secret-redaction assertions are explicitly covered at L1. Do not start
a second Nuxt server solely to retain that test.

**Verification criteria**

- Every migration-map row points to a green replacement test.
- Each replacement has a recorded red proof from disabling the guarded behavior.
- No old test remains after its replacement is green.
- Test count output shows no conditional infrastructure skips.

### P2.9 Remove the old Vitest E2E path

After every `test/e2e/*.e2e.test.ts` row has a verified owner:

- delete `test/e2e/`;
- delete the `e2e` project from `vitest.config.ts`;
- delete `test/helpers/local-convex.ts`;
- delete `test:e2e` and `test:e2e:full` scripts;
- remove `CONVEX_E2E_AUTO_START` documentation and code references;
- update `test/TESTING.md`.

**Verification criteria**

- `vitest.config.ts` has no `e2e` project.
- `test/e2e`, `local-convex.ts`, and old E2E scripts do not exist.
- `pnpm test` and `pnpm test:fullstack` both pass from a clean checkout.
- Missing local-backend readiness fails L4 instead of skipping tests.

**Phase 2 exit gate**

```bash
pnpm run check
pnpm run test
pnpm run test:fullstack
rg -n "ensureLocalConvex|CONVEX_E2E_AUTO_START|project=e2e" . \
  --glob '!node_modules/**' --glob '!testing-harness-implementation-plan.md'
git diff --check
```

The first three commands pass. The search returns no production/test harness
references outside historical documentation. Starting with `CONVEX_URL` unset
still runs every L4 core test against an automatically created local backend.

---

## 8. Phase 3 — Critical seam contracts

### P3.1 Implement Q1: SSR to realtime handoff

Files:

- `playground/pages/__test__/query-ssr-live.vue`
- `test/fullstack/core/query.spec.ts`

Steps:

1. Reset and seed one public note.
2. Request the page through Playwright's API request context and assert the raw
   HTML contains the note.
3. Attach browser request and console diagnostics before navigation.
4. Navigate and wait for hydration using a stable page marker.
5. Assert no hydration warning and no pending/loading flash was recorded by the
   page's state history.
6. Assert the browser did not issue an HTTP `/api/query` request for the hydrated
   key.
7. Open a second page, create another note through the real mutation, and assert
   the first page updates once.

Do not interpret the normal WebSocket subscription as a duplicate HTTP fetch.

**Verification criteria**

- Forcing a client `refresh()` on mount makes the no-refetch assertion fail.
- Replacing SSR data with a loading shell makes the raw-HTML assertion fail.
- One backend mutation creates one visible update.

### P3.2 Implement Q2 and Q3: client-only and HTTP-only queries

Files:

- `query-client-live.vue`
- `query-http-only.vue`
- `query.spec.ts`

Q2 assertions:

- SSR contains the stable placeholder and no seeded data;
- client starts in the documented pending state;
- data settles through one live subscription;
- a later mutation updates the page.

Q3 assertions:

- SSR contains data;
- a later mutation does not update the page;
- one explicit refresh updates it;
- refresh is not called automatically.

**Verification criteria**

- Q2 raw HTML excludes seeded query data and the hydrated page eventually shows it.
- Q2 receives exactly one visible update for one later mutation.
- Q3 stays unchanged after a backend mutation until refresh.
- Adding an automatic Q3 refresh or subscription makes the owning assertion fail.

### P3.3 Implement Q4 and Q5: args/skip and shared ownership

Files:

- `query-lifecycle.vue`
- `query-shared.vue`
- L3 query tests
- `query.spec.ts`

The exact underlying listener count remains an L3 assertion using
`MockConvexClient`. L4 asserts observable delivery:

- old args never overwrite new args;
- skipped state remains idle;
- after one of two consumers unmounts, the other still updates;
- after the final consumer unmounts, remounting creates a single current stream,
  not duplicate visible deliveries.

**Verification criteria**

- L3 asserts exact listener counts for Q4/Q5.
- L4 asserts old args and unmounted consumers never receive visible updates.
- Disabling final release makes the L3 test fail.
- Releasing on first-consumer unmount makes both L3 and L4 ownership tests fail.

### P3.4 Implement Q6: client-navigation blocking

Files:

- `navigation-index.vue`
- `navigation-target.vue`
- `query.spec.ts`

Expose an ordered state log on the page, such as:

```json
["source-mounted", "navigation-started", "target-data-ready", "target-mounted"]
```

Test uncached link navigation, cached navigation, and back/forward. Assert the
target never renders an incomplete state and abandoned routes do not continue
showing updates.

Do not assert millisecond timing. Assert event order and visible states.

**Verification criteria**

- Uncached navigation records the required event order.
- Cached navigation has no loading flash.
- Back/forward produces one current visible stream.
- A target render before `target-data-ready` makes the test fail.

### P3.5 Implement A1–A3: anonymous, authenticated SSR, and sign-out

Files:

- `playground/pages/__test__/auth-mixed.vue`
- `test/fullstack/core/auth.spec.ts`
- `test/fullstack/helpers/auth.ts`

Requirements:

- anonymous `auth:'auto'` private query is idle;
- public `auth:'none'` query works while signed out;
- raw anonymous HTML contains no JWT-shaped string and no private user data;
- real signup creates a session cookie and authenticated Convex identity;
- authenticated SSR response carries `Cache-Control: private, no-store`;
- no unauthenticated flash occurs on hydration;
- sign-out removes private data while public data remains live;
- protected navigation redirects with the return target.

Use a unique email derived from `testId`, not `Date.now()`.

**Verification criteria**

- Anonymous HTML contains neither a JWT-shaped value nor private user content.
- Authenticated SSR returns `private, no-store` and the expected user content.
- Sign-out removes private content and retains live public content.
- Removing the cache header or private purge makes the owning test fail.
- The test does not log or attach raw cookies/tokens.

### P3.6 Implement A4: cross-session isolation

Use two isolated browser contexts from the fixture:

1. sign up user A and user B;
2. create one private task for each;
3. assert each context sees only its own task;
4. mutate both and assert realtime remains isolated;
5. sign out A;
6. assert B remains authenticated and continues receiving only B's updates.

**Verification criteria**

- Deliberately changing `tasks.list` to omit its owner filter makes the test fail.
- No assertion compares only counts; assert unique task content and user identity.

### P3.7 Complete A5 at the correct tiers

At L1, ensure all token-exchange failure policies are covered:

- 401 is graceful anonymous state;
- 404/5xx/network failures follow dev and production policy;
- production client state contains only a generic error;
- logs may contain actionable status but never cookie/token values;
- cache headers are set only when private token state is serialized.

At L4, assert an invalid/expired real session never leaks upstream response text
or a token into HTML. Do not add a special runtime failure switch solely for this
test.

**Verification criteria**

- Every documented 401/404/5xx/network branch has a deterministic L1 assertion.
- Production assertions compare against the generic public error only.
- Seeded cookie/token sentinel strings never appear in rendered HTML or public
  errors.
- No new runtime configuration switch exists solely to force failures.

### P3.8 Promote L4 core to a required check

Initially add `fullstack-core` to CI as advisory. After 20 consecutive green CI
executions:

- make it required for PRs and main;
- retain zero retries;
- archive traces only on failure;
- record the measured median and slowest run in `test/TESTING.md`.

**Verification criteria**

- CI history shows 20 consecutive retry-free green executions.
- Branch protection requires the `fullstack-core` check.
- A red L4 core run blocks merge and release verification.
- Median and slowest measured durations remain below the 8-minute ceiling.

**Phase 3 exit gate**

```bash
pnpm run test:unit
pnpm run test:nuxt
pnpm run test:fullstack
```

Q1–Q6 and A1–A5 must have named owning tests. The L4 core run must remain below
8 minutes on the standard CI runner.

---

## 9. Phase 4 — Remaining vertical contracts

### P4.1 Implement P1: pagination

Create `playground/pages/__test__/pagination.vue` and
`test/fullstack/core/pagination.spec.ts`.

Test:

- first page exists in raw SSR HTML;
- hydration contains no duplicate item;
- `loadMore` uses the real cursor and produces no gap/duplicate;
- a relevant realtime insertion preserves the documented order;
- refresh rebuilds cursor chaining correctly.

Keep exhaustive insertion/refresh permutations in L2/L3. L4 owns one vertical
representative path.

**Verification criteria**

- Raw SSR HTML contains the first page.
- Loaded IDs are unique across initial and continuation pages.
- Realtime insertion preserves documented order.
- Breaking cursor chaining makes L2/L3 fail and the representative L4 path red.

### P4.2 Implement W1 and W2: real writes and optimistic rollback

Create `writes.vue` and `writes.spec.ts`.

W1:

- mutation changes a subscribed query;
- action returns its real backend result;
- mutation/action error reaches the documented error state once.

W2:

- capture the exact pre-mutation query data;
- trigger an optimistic update against `testing.alwaysFailsMutation` or a dedicated
  existing failure function;
- assert immediate optimistic state;
- assert exact rollback to the captured data;
- assert one surfaced error and no repeated request/update loop.

**Verification criteria**

- Real mutation and action results are asserted, not only button state.
- Optimistic data appears before backend rejection settles.
- Rollback deep-equals the captured pre-mutation value.
- Disabling rollback or firing the error callback twice makes the test fail.

### P4.3 Implement U1: real upload lifecycle

Create `upload.vue` and `upload.spec.ts` or simplify the existing lab page for
stable test selectors.

Use a small deterministic binary fixture created in test memory. Test:

1. authenticate;
2. request the real upload URL;
3. upload bytes;
4. save ownership metadata;
5. resolve the storage URL through `useConvexStorageUrl`;
6. fetch the URL and compare exact bytes/content type;
7. delete the file;
8. verify the old URL no longer returns the asset.

Assert `useConvexStorageUrl` returns immediately in pending state and later
settles. Cancellation and concurrent-upload races stay in L1/L3.

**Verification criteria**

- Downloaded bytes and content type equal the uploaded fixture.
- The storage URL composable exposes pending before success.
- Deleted storage is no longer fetchable.
- Backend reset leaves `_storage` empty after the test.

### P4.4 Implement N1: packed external consumer

Create `scripts/pack-consumer-fixture.mjs` so local and CI use one implementation.
It must:

- run `pnpm pack` into `test/.runtime/pack`;
- create or clean an isolated fixture install directory;
- install fixture dependencies with a lockfile;
- install the produced tarball;
- verify root and server subpath imports;
- prepare, typecheck, build, and start the consumer;
- request one SSR page using the public module API.

Do not resolve the module through the workspace or `dist` path during the packed
proof.

Create `test/fixtures/nuxt-floor` by copying only the minimal source/config needed
from `consumer-smoke`, not its generated output.

**Verification criteria**

- The fixture installs the tarball path printed by `pnpm pack`.
- Removing a required exported file makes import/build verification fail.
- Prepare, typecheck, build, start, and SSR request all pass outside workspace
  resolution.
- The isolated fixture directory is generated under `test/.runtime`.

### P4.5 Implement N2 and N3

N2 in `routing.spec.ts`:

- open route stays open;
- protected route redirects signed-out users;
- return target is preserved;
- protected content never mounts during pending auth;
- authenticated user reaches the route.

N3 in `module-and-server.spec.ts`:

- packed server exports resolve;
- query/mutation/action helpers round-trip through the real backend;
- auth proxy catch-all forwards method, query, allowed cookies, body, status, and
  `Set-Cookie` without forwarding private application cookies.

Use a guarded playground Convex HTTP probe route for the catch-all contract rather
than launching a second fake upstream server.

**Verification criteria**

- N2 proves both signed-out rejection and authenticated admission.
- Protected component mount count remains zero during pending redirect.
- N3 proves root/server imports and real helper round trips.
- The proxy probe receives allowed auth cookies but not a seeded private app
  cookie.
- The probe route returns 404 when `IS_TEST` is absent.

### P4.6 Build the demo against the current tarball

Add a CI step that copies `demo/` to an ignored runtime directory, replaces only
the copied manifest's `better-convex-nuxt` specifier with the packed tarball, then
installs, typechecks, and builds.

Do not rewrite and commit `demo/package.json` during CI. Separately decide whether
the checked-in demo should track the latest published stable version; that is a
release policy, not evidence for current source.

**Verification criteria**

- CI logs show the copied demo installed the current tarball.
- Demo typecheck and build pass.
- The tracked `demo/package.json` and lockfile remain unchanged after the check.
- Breaking a current public import makes the demo-against-tarball check fail.

### P4.7 Remove the Vitest browser project

Move the four auth component slot-visibility tests to L3 using Nuxt/Vue component
mounting. After they pass:

- delete `test/browser/`;
- delete the `browser` project from `vitest.config.ts`;
- remove its aliases/plugins/imports;
- remove browser-only dependencies listed in P2.1 when unused;
- remove `test:browser` and old `test:full` scripts.

**Verification criteria**

- All four auth component contracts pass in L3.
- `test/browser` and the Vitest `browser` project are absent.
- `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm test:fullstack` pass.
- No removed browser dependency remains in the lockfile because of this project.

**Phase 4 exit gate**

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
pnpm run test:fullstack
pnpm run prepack
pnpm run check:consumer-smoke
```

All public integration surfaces have one real vertical proof. `vitest.config.ts`
contains only `unit`, `convex`, and `nuxt` projects.

---

## 10. Phase 5 — Resilience and compatibility

### P5.1 Implement R1 and R2: auth races

Create `test/fullstack/resilience/auth-races.spec.ts`.

Use deterministic control:

- L1/L3 owns exact deferred-promise ordering for token responses;
- L4 uses Playwright routing only for browser-visible requests;
- do not claim browser routing delays server-to-server token exchange;
- if real server-token delay cannot be controlled at an existing boundary, rely
  on the exact L1/L3 proof plus a real L4 sign-out smoke instead of adding a
  production hook.

R2 must prove a late auth result cannot restore private data after sign-out.

**Verification criteria**

- Deferred-promise L1/L3 tests control the exact resolution order.
- L4 confirms the real sign-out path remains signed out after delayed work settles.
- No fixed delay or production-only failure toggle is introduced.
- Removing the generation guard makes the deterministic race test fail.

### P5.2 Implement R3: WebSocket loss and recovery

Create `websocket-recovery.spec.ts` using Cornerstone C8.

Test:

- initial connection reaches connected state;
- closing the intercepted real WebSocket changes connection state;
- existing query data remains visible;
- recovery reconnects;
- one later mutation produces one visible update;
- no duplicate visible delivery occurs.

Do not assert Convex's private frame schema. Inspect frame counts and connection
lifecycle only for diagnostics.

**Verification criteria**

- The test intercepts and connects to the real socket before closing it.
- Connection state visibly leaves and later returns to connected.
- Existing data remains visible during disconnection.
- One post-recovery mutation creates one visible update.

### P5.3 Implement R4: navigation soak

Create `navigation-soak.spec.ts`:

- perform 20 mount -> mutate -> observe -> unmount cycles;
- use a unique monotonic value per cycle;
- assert each value appears exactly once;
- assert no page errors, failed requests, or stuck connection state;
- attach final WebSocket/request diagnostics.

Do not expose internal listener counts from production runtime for this test. L3
already owns the exact refcount.

**Verification criteria**

- All 20 cycles complete within the resilience budget.
- Each cycle's monotonic value renders exactly once.
- Diagnostics contain no growing failure/error sequence.
- Deliberately retaining the final subscription makes the owning L3 proof fail and
  causes duplicate soak delivery where observable.

### P5.4 Prove the declared Nuxt floor

Use `test/fixtures/nuxt-floor/package.json` with the lowest declared Nuxt version.
The lane must install the packed module and run:

- prepare;
- typecheck;
- build;
- one SSR request.

If the floor cannot pass without compatibility code, choose one of two explicit
outcomes:

1. fix the library with a tested, justified change; or
2. raise `peerDependencies.nuxt` to the actual supported floor.

Do not leave a knowingly false peer range.

**Verification criteria**

- The fixture manifest pins the exact declared floor.
- Packed install, prepare, typecheck, build, start, and SSR request pass.
- The lane fails with a deliberately incompatible fixture.
- `peerDependencies.nuxt` matches the lowest version the lane proves.

### P5.5 Reconfigure the existing Renovate bot

Modify `renovate.json`; do not introduce Dependabot.

Required attribution rules:

- `convex` gets its own PR and is never grouped with `@convex-dev/*`;
- `better-auth` and `@convex-dev/better-auth` are grouped only if the supported
  compatibility policy requires paired updates;
- Nuxt runtime packages may remain a Nuxt ecosystem group;
- production dependency PRs receive a label used by CI to require L4 core;
- patch automerge is disabled for the high-risk runtime dependencies until L4
  core has been required and stable;
- remove stale `better-auth <1.5.0` policy if it contradicts the installed
  manifest; every allowed-version rule must match a current documented reason.

Renovate already supplies individual attribution by default. Prefer fewer groups
for high-risk dependencies.

**Verification criteria**

- Renovate configuration validation passes.
- A Convex update is not grouped with unrelated dependencies.
- High-risk production updates cannot automerge without L4 core.
- No allowed-version rule contradicts the current manifest.
- No Dependabot configuration is added.

### P5.6 Add latest-supported verification

Add a weekly non-blocking workflow that:

1. checks out the repository;
2. installs locked dependencies;
3. updates within declared semver ranges only;
4. prints the before/after version diff;
5. runs `check`, `test`, and L4 core;
6. uploads logs and reports on failure.

It must not test unsupported majors and must not rewrite the main branch.

**Verification criteria**

- Manual workflow dispatch prints a version diff and runs all three commands.
- The workflow produces no commit or push.
- A failing update uploads reports and identifies the changed dependency versions.
- Manifest constraints prevent unsupported majors from entering the lane.

**Phase 5 exit gate**

```bash
pnpm run test:resilience
pnpm run test:fullstack
pnpm run check
```

Resilience remains below 12 minutes. A deliberate WebSocket close recovers. A
deliberately incompatible Nuxt fixture or Convex wire fixture fails the owning
lane.

---

## 11. Phase 6 — Release adoption and cleanup

### P6.1 Create one release verifier

Create `scripts/verify-release.mjs`. It runs, in order:

1. `pnpm run check`;
2. `pnpm run test`;
3. `pnpm run test:fullstack`;
4. `pnpm run test:resilience`;
5. `pnpm run prepack`;
6. packed consumer verification;
7. demo-against-tarball verification.

Stop on the first failure and preserve its output. Do not reproduce the commands
inside `scripts/release.mjs`; call `pnpm run verify:release` once.

Add a release dry-run option that stops before version bump, commit, tag, publish,
or push. The dry-run must execute the complete verifier.

**Verification criteria**

- `pnpm run verify:release` runs the seven ordered steps exactly once.
- The release script contains one verifier invocation, not copied steps.
- Dry-run changes no version, changelog, commit, tag, registry, or remote branch.
- A forced failure stops before every release mutation.

### P6.2 Final CI structure

Required PR/main jobs:

- `static-and-contracts`;
- `vitest`;
- `packed-consumer`;
- `fullstack-core`.

Nightly additionally runs:

- `fullstack-resilience`;
- `nuxt-floor`;
- `latest-supported`.

Use job-level timeouts and upload Playwright reports only on failure. Chromium is
the only browser installed.

**Verification criteria**

- PR/main workflow exposes the four required check names.
- Nightly workflow exposes all three extended lanes.
- Only Chromium is installed.
- Successful jobs do not upload bulky Playwright traces/reports.
- Required jobs use frozen installs and explicit timeouts.

### P6.3 Delete migration residue

Delete or remove:

- migration map from `test/TESTING.md`;
- obsolete E2E/bootstrap documentation;
- empty test directories;
- stale lab pages whose only purpose was replaced by `__test__` pages;
- duplicate package scripts;
- unused browser dependencies;
- unused local-backend helpers;
- old CI jobs that repeat packed consumer work differently;
- manually maintained status/streak logs.

Run repository searches for each deleted concept.

**Verification criteria**

- Searches for old E2E scripts, helpers, project names, and env flags return no
  active references.
- `pnpm install --frozen-lockfile` proves the lockfile is clean after dependency
  removal.
- No empty migration-only directory remains.
- All final commands in section 9 of the RFC exist and pass.

### P6.4 Rewrite the operating guide

Rewrite `test/TESTING.md` to contain only:

- layer ownership table;
- command table;
- “where should this regression test live?” decision guide;
- full-stack local prerequisites, which should be only Node, pnpm, internet on
  first Convex binary download, and Chromium;
- failure artifact locations;
- flake/quarantine policy;
- timing budgets;
- release verification command.

Keep the RFC and this implementation plan as historical design documents. The
operating guide is the daily source of truth.

**Verification criteria**

- A new contributor can select the owning test layer from the decision guide.
- Every documented command exists in `package.json` and exits as described.
- No removed command, helper, or path appears in the guide.
- Artifact and quarantine instructions point to real paths/workflows.

### P6.5 Final acceptance run

From a clean clone with no Convex config or environment variables:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm run verify:release
git status --short
```

**Final verification criteria**

- `verify:release` exits 0 within 30 minutes.
- `git status --short` is empty after generated ignored files are excluded.
- L4 starts without user Convex credentials.
- No required test is skipped or retried.
- No fixed sleeps exist in the test harness.
- `vitest.config.ts` has exactly three projects: unit, convex, nuxt.
- Playwright owns every real browser/full-stack test.
- One stack owner and one reset mutation exist.
- Consumer and demo checks install the current tarball.
- Nuxt peer floor is truthful.
- Release invokes one verifier.

---

## 12. Cornerstones

These snippets pin the implementation shapes most likely to be subtly wrong.
Adapt paths only when the corresponding task changes the final file layout.

### C1 — Forbidden-pattern wrapper must preserve ripgrep exit semantics

```js
#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const [pattern, ...paths] = process.argv.slice(2)

if (!pattern || paths.length === 0) {
  console.error('Usage: check-forbidden-pattern <pattern> <path...>')
  process.exit(2)
}

const command = process.env.RG_BINARY || 'rg'
const result = spawnSync(command, ['-n', '--color=never', pattern, ...paths], {
  encoding: 'utf8',
})

if (result.error) {
  console.error(`Forbidden-pattern check could not execute ${command}: ${result.error.message}`)
  process.exit(2)
}

if (result.status === 1) {
  process.exit(0)
}

if (result.status === 0) {
  process.stderr.write(result.stdout)
  console.error(`Forbidden pattern found: ${pattern}`)
  process.exit(1)
}

process.stderr.write(result.stderr)
console.error(`Forbidden-pattern harness failed: ${command} exited ${String(result.status)}`)
process.exit(2)
```

The critical detail is that only status 1 means “search ran and found nothing”.

### C2 — Playwright has one configuration and zero retries

```ts
import { defineConfig } from '@playwright/test'

const appUrl = 'http://127.0.0.1:4300'

export default defineConfig({
  testDir: './test/fullstack',
  outputDir: './test/.runtime/test-results',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'test/.runtime/playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'test/.runtime/playwright-report', open: 'never' }]],
  use: {
    baseURL: appUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'core',
      testMatch: /core\/.*\.spec\.ts/,
    },
    {
      name: 'resilience',
      testMatch: /resilience\/.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: 'node scripts/start-test-stack.mjs',
    url: `${appUrl}/api/__test__/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
```

### C3 — Stack owner uses an isolated env file and kills process groups

```js
#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const root = process.cwd()
const playground = path.join(root, 'playground')
const runtimeDir = path.join(root, 'test', '.runtime')
const convexEnvFile = path.join(runtimeDir, 'convex.env')
const stackFile = path.join(runtimeDir, 'stack.json')
const appUrl = 'http://127.0.0.1:4300'
const resetToken = randomBytes(32).toString('hex')
const authSecret = randomBytes(32).toString('base64url')
const children = new Set()
let shuttingDown = false

mkdirSync(runtimeDir, { recursive: true })
rmSync(convexEnvFile, { force: true })
rmSync(stackFile, { force: true })
writeFileSync(convexEnvFile, '', 'utf8')

function parseEnvFile(file) {
  const values = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1)
  }
  return values
}

function spawnOwned(command, args, options) {
  const { name, ...spawnOptions } = options
  const child = spawn(command, args, {
    ...spawnOptions,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.stdout.on('data', (chunk) => process.stdout.write(`[${name}] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[${name}] ${chunk}`))
  child.once('exit', () => children.delete(child))
  return child
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) reject(new Error(`Port ${port} did not open`))
        else setTimeout(attempt, 100)
      })
    }
    attempt()
  })
}

async function waitForConvexEnv(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const values = parseEnvFile(convexEnvFile)
    if (values.CONVEX_URL && values.CONVEX_SITE_URL) return values
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Convex did not write deployment URLs to ${convexEnvFile}`)
}

function setConvexEnv(name, value) {
  execFileSync('pnpm', ['exec', 'convex', 'env', 'set', name, value, '--env-file', convexEnvFile], {
    cwd: playground,
    stdio: 'inherit',
  })
}

async function stop() {
  if (shuttingDown) return
  shuttingDown = true
  const exits = []
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue
    exits.push(new Promise((resolve) => child.once('exit', resolve)))
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  }
  await Promise.race([Promise.all(exits), new Promise((resolve) => setTimeout(resolve, 3_000))])
  for (const child of children) {
    if (child.exitCode !== null || child.pid === undefined) continue
    if (process.platform === 'win32') child.kill('SIGKILL')
    else process.kill(-child.pid, 'SIGKILL')
  }
}

process.once('SIGINT', () => void stop().finally(() => process.exit(130)))
process.once('SIGTERM', () => void stop().finally(() => process.exit(143)))
process.once('exit', () => {
  for (const child of children) {
    if (child.exitCode === null && child.pid !== undefined) child.kill('SIGKILL')
  }
})

const convex = spawnOwned(
  'pnpm',
  ['exec', 'convex', 'dev', '--env-file', convexEnvFile, '--tail-logs', 'disable'],
  {
    cwd: playground,
    env: { ...process.env, CI: '1', CONVEX_LOCAL_BACKEND_PORT: '3214' },
    name: 'convex',
  },
)

convex.once('exit', (code) => {
  if (!shuttingDown) void stop().finally(() => process.exit(code ?? 1))
})

await waitForPort(3214, 45_000)
await waitForConvexEnv(45_000)
setConvexEnv('SITE_URL', appUrl)
setConvexEnv('BETTER_AUTH_SECRET', authSecret)
setConvexEnv('IS_TEST', 'true')
setConvexEnv('BCN_TEST_RESET_TOKEN', resetToken)

const convexEnv = parseEnvFile(convexEnvFile)
const convexUrl = convexEnv.CONVEX_URL || 'http://127.0.0.1:3214'
const convexSiteUrl = convexEnv.CONVEX_SITE_URL || 'http://127.0.0.1:3215'

writeFileSync(
  stackFile,
  `${JSON.stringify({ appUrl, convexUrl, convexSiteUrl, resetToken }, null, 2)}\n`,
  'utf8',
)

const nuxt = spawnOwned(
  'pnpm',
  ['exec', 'nuxi', 'dev', '--cwd', 'playground', '--dotenv', convexEnvFile, '--port', '4300'],
  {
    cwd: root,
    env: {
      ...process.env,
      ...convexEnv,
      BCN_TEST_MODE: 'true',
      NUXT_PUBLIC_CONVEX_URL: convexUrl,
      NUXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl,
    },
    name: 'nuxt',
  },
)

nuxt.once('exit', (code) => {
  if (!shuttingDown) void stop().finally(() => process.exit(code ?? 1))
})

await new Promise((resolve) => {
  nuxt.once('exit', resolve)
  convex.once('exit', resolve)
})
await stop()
```

During implementation, verify the pinned Convex CLI writes `CONVEX_URL` and
`CONVEX_SITE_URL` to the custom env file. If its key names differ, update the
parser and acceptance test together; do not fall back to the developer's
`.env.local`.

### C4 — Health means Nuxt, Convex, and Better Auth are all ready

```ts
import { api } from '#convex/api'
import { serverConvexQuery } from '#convex/server'
import { useRuntimeConfig } from '#imports'
import { createError, defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  if (process.env.BCN_TEST_MODE !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  try {
    await serverConvexQuery(event, api.testing.healthCheck, {}, { auth: 'none' })

    const config = useRuntimeConfig(event)
    const siteUrl = config.public.convex.siteUrl
    const response = await fetch(`${siteUrl}/api/auth/get-session`, {
      headers: {
        origin: 'http://127.0.0.1:4300',
        'x-forwarded-host': '127.0.0.1:4300',
        'x-forwarded-proto': 'http',
      },
    })

    if (response.status >= 500 || response.status === 404) {
      throw new Error(`auth readiness status ${response.status}`)
    }

    return { nuxt: true, convex: true, auth: true }
  } catch (error) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Test stack is not ready',
      data: {
        component: error instanceof Error && error.message.includes('auth') ? 'auth' : 'convex',
      },
    })
  }
})
```

Do not return the upstream error body from a health endpoint.

### C5 — Reset has two guards and clears every mutable backend surface

```ts
export const clearAllData = mutation({
  args: {
    resetToken: v.string(),
  },
  handler: async (ctx, args) => {
    if (process.env.IS_TEST !== 'true') {
      throw new Error('Test reset is disabled for this deployment')
    }

    const expectedToken = process.env.BCN_TEST_RESET_TOKEN
    if (!expectedToken || args.resetToken !== expectedToken) {
      throw new Error('Invalid test reset token')
    }

    const deleted: Record<string, number> = {}
    for (const table of ALL_TABLES) {
      const documents = await ctx.db.query(table).collect()
      for (const document of documents) await ctx.db.delete(document._id)
      deleted[table] = documents.length
    }

    for (const table of BETTER_AUTH_TABLES) {
      let tableDeleted = 0
      let cursor: string | null = null
      let done = false
      while (!done) {
        const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          input: { model: table, where: [] },
          paginationOpts: { numItems: 100, cursor },
        } as never)
        tableDeleted += result.count
        cursor = result.continueCursor
        done = result.isDone
      }
      deleted[`auth:${table}`] = tableDeleted
    }

    const scheduled = await ctx.db.system.query('_scheduled_functions').collect()
    for (const job of scheduled) {
      if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id)
    }

    const files = await ctx.db.system.query('_storage').collect()
    for (const file of files) await ctx.storage.delete(file._id)

    return {
      deleted,
      cancelledScheduledFunctions: scheduled.filter((job) => job.state.kind === 'pending').length,
      deletedStoredFiles: files.length,
    }
  },
})
```

Use the actual generated Better Auth adapter result fields from the installed
version. Keep the loop cursor; repeatedly passing `null` can loop forever or skip
remaining rows.

### C6 — Fixtures reset automatically and fail on unexpected browser errors

```ts
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { test as base, type BrowserContext, type ConsoleMessage } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'

import { api } from '../../playground/convex/_generated/api'

type StackRuntime = {
  appUrl: string
  convexUrl: string
  convexSiteUrl: string
  resetToken: string
}

type Diagnostics = {
  allowConsole: (pattern: RegExp) => void
  allowPageError: (pattern: RegExp) => void
  allowRequestFailure: (pattern: RegExp) => void
}

type WorkerFixtures = {
  stack: StackRuntime
}

type TestFixtures = {
  testId: string
  diagnostics: Diagnostics
  newSession: () => Promise<BrowserContext>
  resetBackend: void
}

function readStack(): StackRuntime {
  const value = JSON.parse(readFileSync('test/.runtime/stack.json', 'utf8')) as Record<
    string,
    unknown
  >
  for (const key of ['appUrl', 'convexUrl', 'convexSiteUrl', 'resetToken']) {
    if (typeof value[key] !== 'string' || value[key].length === 0) {
      throw new Error(`Invalid test stack field: ${key}`)
    }
  }
  return value as StackRuntime
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  stack: [async ({}, use) => use(readStack()), { scope: 'worker' }],

  testId: async ({}, use, testInfo) => {
    const digest = createHash('sha256').update(testInfo.testId).digest('hex').slice(0, 12)
    await use(`pw-${digest}`)
  },

  resetBackend: [
    async ({ stack }, use) => {
      const client = new ConvexHttpClient(stack.convexUrl)
      await client.mutation(api.testing.clearAllData, { resetToken: stack.resetToken })
      await use(undefined)
    },
    { auto: true },
  ],

  diagnostics: [
    async ({ page }, use, testInfo) => {
      const allowedConsole: RegExp[] = []
      const allowedPageErrors: RegExp[] = []
      const allowedRequestFailures: RegExp[] = []
      const messages: string[] = []
      const pageErrors: string[] = []
      const requestFailures: string[] = []

      const onConsole = (message: ConsoleMessage) => {
        if (message.type() === 'error' || message.type() === 'warning') {
          messages.push(`[${message.type()}] ${message.text()}`)
        }
      }
      page.on('console', onConsole)
      page.on('pageerror', (error) => pageErrors.push(error.stack || error.message))
      page.on('requestfailed', (request) => {
        requestFailures.push(
          `${request.method()} ${request.url()}: ${request.failure()?.errorText}`,
        )
      })

      await use({
        allowConsole: (pattern) => allowedConsole.push(pattern),
        allowPageError: (pattern) => allowedPageErrors.push(pattern),
        allowRequestFailure: (pattern) => allowedRequestFailures.push(pattern),
      })

      const unexpectedConsole = messages.filter(
        (message) => !allowedConsole.some((pattern) => pattern.test(message)),
      )
      const unexpectedPageErrors = pageErrors.filter(
        (message) => !allowedPageErrors.some((pattern) => pattern.test(message)),
      )
      const unexpectedRequestFailures = requestFailures.filter(
        (message) => !allowedRequestFailures.some((pattern) => pattern.test(message)),
      )
      const report = { unexpectedConsole, unexpectedPageErrors, unexpectedRequestFailures }
      if (
        unexpectedConsole.length ||
        unexpectedPageErrors.length ||
        unexpectedRequestFailures.length
      ) {
        await testInfo.attach('browser-diagnostics.json', {
          body: Buffer.from(JSON.stringify(report, null, 2)),
          contentType: 'application/json',
        })
      }
      if (testInfo.status === testInfo.expectedStatus && unexpectedConsole.length) {
        throw new Error(`Unexpected browser console output:\n${unexpectedConsole.join('\n')}`)
      }
      if (testInfo.status === testInfo.expectedStatus && unexpectedPageErrors.length) {
        throw new Error(`Uncaught page error:\n${unexpectedPageErrors.join('\n')}`)
      }
      if (testInfo.status === testInfo.expectedStatus && unexpectedRequestFailures.length) {
        throw new Error(`Failed browser request:\n${unexpectedRequestFailures.join('\n')}`)
      }
    },
    { auto: true },
  ],

  newSession: async ({ browser, stack }, use) => {
    const contexts: BrowserContext[] = []
    await use(async () => {
      const context = await browser.newContext({ baseURL: stack.appUrl })
      contexts.push(context)
      return context
    })
    await Promise.all(contexts.map((context) => context.close()))
  },
})

export { expect } from '@playwright/test'
```

The critical behavior is automatic reset, narrow allowances, diagnostics
attachment, and preserving the original failure when the test is already red.

### C7 — Auth helper uses web-first assertions and deterministic identities

```ts
import { expect, type Page } from '@playwright/test'

type SignUpInput = {
  email: string
  name: string
  password: string
}

export async function signUp(page: Page, input: SignUpInput): Promise<void> {
  await page.goto('/auth/signup')
  await page.getByLabel('Name').fill(input.name)
  await page.getByLabel('Email').fill(input.email)
  await page.getByLabel('Password').fill(input.password)
  await page.getByRole('button', { name: /sign up/i }).click()
  await expect(page).toHaveURL(/\/$/)

  const cookies = await page.context().cookies()
  expect(
    cookies.some(
      (cookie) =>
        cookie.name === 'better-auth.session_token' ||
        cookie.name === '__Secure-better-auth.session_token',
    ),
  ).toBe(true)
}

export function testUser(testId: string, suffix: string): SignUpInput {
  return {
    name: `Playwright ${suffix}`,
    email: `${testId}-${suffix}@example.com`,
    password: 'Fullstack-Test-Password-42!',
  }
}
```

Do not race a URL wait against an error selector and swallow the result. If signup
fails, the locator or URL assertion should report the actual failure.

### C8 — WebSocket disruption connects to the real server before closing

```ts
import type { Page, WebSocketRoute } from '@playwright/test'

export async function interceptConvexSocket(page: Page): Promise<{
  closeServerSide: () => Promise<void>
}> {
  let serverRoute: WebSocketRoute | null = null

  await page.routeWebSocket(/127\.0\.0\.1:3214/, (clientRoute) => {
    serverRoute = clientRoute.connectToServer()
  })

  return {
    closeServerSide: async () => {
      if (!serverRoute) throw new Error('Convex WebSocket was not opened')
      await serverRoute.close({ code: 1012, reason: 'fullstack recovery test' })
    },
  }
}
```

If `connectToServer()` is omitted, the route mocks the socket instead of
disrupting the real connection. Install the route before navigation.

### C9 — The client double is a boundary recorder, not a fake backend

```ts
import type { ConvexClient } from 'convex/browser'

import { MockConvexClient } from '../helpers/mock-convex-client'

type RuntimeConvexClient = Pick<
  ConvexClient,
  'action' | 'connectionState' | 'mutation' | 'onUpdate' | 'query' | 'subscribeToConnectionState'
>

const structuralContract: RuntimeConvexClient = new MockConvexClient()
void structuralContract
```

When applying this cornerstone, retain the complete existing method bodies. The
contract should make Convex client API drift a type error without adding a runtime
adapter or automatic simulated database behavior.

### C10 — Release script calls one verifier

```js
const verificationSteps = [
  ['pnpm', ['run', 'check']],
  ['pnpm', ['run', 'test']],
  ['pnpm', ['run', 'test:fullstack']],
  ['pnpm', ['run', 'test:resilience']],
  ['pnpm', ['run', 'prepack']],
  ['node', ['scripts/pack-consumer-fixture.mjs']],
]

for (const [command, args] of verificationSteps) {
  run(command, args)
}
```

`scripts/release.mjs` should invoke `pnpm run verify:release`; it should not copy
this list. This list belongs only in `scripts/verify-release.mjs`.

---

## 13. Review checklist for every phase

Before merging a phase, answer every item:

- [ ] Did the new test live at the lowest tier capable of proving the invariant?
- [ ] Did the phase create a second process owner, reset path, test runner, or
      source of truth?
- [ ] Was the replaced path deleted once the replacement passed?
- [ ] Can a failure explain the violated contract without reading harness source?
- [ ] Are async waits tied to observable state rather than time?
- [ ] Does the failure retain useful diagnostics without a retry?
- [ ] Does a deliberate regression make the new test red?
- [ ] Does the clean implementation make it green?
- [ ] Did formatting, lint, types, owning tests, and `git diff --check` pass?
- [ ] Did the phase stay inside its runtime budget?
- [ ] Is `test/TESTING.md` accurate for the commands that now exist?
- [ ] Is this the simplest system the team can maintain for ten years?
