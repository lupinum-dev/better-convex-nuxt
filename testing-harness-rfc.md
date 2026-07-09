# RFC: Testing Architecture for Long-Term Confidence

> **Status:** Proposed
> **Owner:** Maintainers
> **Decision type:** Greenfield hard cutover
> **Last revised:** 2026-07-09

## 1. Decision

Adopt a five-layer testing architecture with one responsibility per layer:

1. static and package contracts;
2. pure unit tests;
3. Convex function tests with `convex-test`;
4. Nuxt runtime integration tests with a small test double at the Convex client boundary;
5. full-stack browser tests with Playwright Test, a real Nuxt server, and a real local Convex backend.

Vitest owns layers 1–4. Playwright Test owns layer 5. The current Vitest `e2e`
project and the Vitest browser project are removed after their useful scenarios
have moved to the new owners. The old and new full-stack paths do not remain in
parallel.

The live suite is not a duplicate of the runtime suite. Runtime tests prove
precise lifecycle decisions deterministically. Full-stack tests prove the
small set of boundaries that mocks cannot prove: SSR, hydration, real HTTP wire
format, real JWTs, real WebSockets, browser navigation, and process lifecycle.

This is the testing architecture for the project, not an optional additional
harness.

## 2. Goal

The library owns a high-risk integration seam:

```text
request cookie
  -> server auth snapshot / JWT exchange
  -> SSR Convex HTTP query
  -> Nuxt payload serialization
  -> browser hydration
  -> Convex WebSocket subscription
  -> navigation / args / auth transitions
  -> subscription teardown and private-data purge
```

The test system must let maintainers change this seam quickly while detecting:

- incorrect results;
- correct results produced by an incorrect operation sequence;
- private data surviving an auth boundary;
- duplicate HTTP work after hydration;
- duplicate or leaked subscriptions;
- stale asynchronous auth results winning a race;
- incompatibility with supported Nuxt, Convex, and Better Auth versions;
- package output that works in the repository but not for a consumer.

The target is high confidence with predictable feedback, not the highest test
count.

## 3. Evidence behind the decision

### 3.1 Repository facts

- `useConvexQuery` and `useConvexPaginatedQuery` are public async/blocking
  composables. `lazy` is not a public option and is not a test-matrix dimension.
- The meaningful public query dimensions are `server`, `subscribe`, `auth`,
  session state, entry/navigation mode, and args lifecycle.
- Exact subscription acquisition and release are already observable through the
  runtime client boundary. They do not require production runtime telemetry.
- The existing `test/e2e` directory mixes backend-independent Nuxt E2E with
  real-Convex scenarios. This makes its prerequisite and skip semantics unclear.
- `playground/convex/testing.ts` already exposes guarded data reset. It should be
  hardened and reused, not replaced by a second reset mechanism.
- CI currently installs `corepack@latest` and `nypm@latest`, despite the repository
  declaring an exact pnpm version. A regression gate must first be reproducible.

### 3.2 First-party guidance and capabilities

- Convex recommends `convex-test` for fast backend logic and a real local backend
  when real runtime limits, wire behavior, or client/backend integration matters.
  The local backend runs the same backend code as production when kept current,
  but it cannot control time, randomness, external fetches, or every dependency.
  Sources: [Convex testing overview](https://docs.convex.dev/testing/overview),
  [convex-test](https://docs.convex.dev/testing/convex-test),
  [testing the local backend](https://docs.convex.dev/testing/convex-backend).
- Convex supports anonymous local provisioning in non-interactive shells. The CLI
  can start a frontend alongside `convex dev`, and the local backend exits with
  the CLI process. Sources: [agent mode](https://docs.convex.dev/cli/agent-mode),
  [`convex dev` reference](https://docs.convex.dev/cli/reference/dev),
  [local deployments](https://docs.convex.dev/cli/local-deployments).
- Nuxt explicitly separates runtime tests from E2E tests and supports Playwright
  Test as a first-class E2E runner for modules. Source:
  [Nuxt testing guide](https://nuxt.com/docs/4.x/getting-started/testing).
- Playwright can own local web-server lifecycle, create isolated browser contexts,
  inspect WebSocket frames, intercept or close real WebSocket connections, and
  retain traces for failed tests. Sources:
  [web server](https://playwright.dev/docs/test-webserver),
  [network and WebSockets](https://playwright.dev/docs/network),
  [WebSocketRoute](https://playwright.dev/docs/api/class-websocketroute),
  [best practices](https://playwright.dev/docs/best-practices).
- Vitest projects and global setup are appropriate for separate deterministic
  environments and suite-owned setup/teardown. Source:
  [Vitest global setup](https://vitest.dev/config/globalsetup).

## 4. Design principles

### 4.1 One owner per behavior

Every invariant has one primary test tier. A broader tier may smoke-test the
same path, but it must not reproduce all lower-tier cases.

### 4.2 Observe at the narrowest stable boundary

Use the closest stable observation point:

| Invariant                                      | Primary observation                                            |
| ---------------------------------------------- | -------------------------------------------------------------- |
| HTTP request construction and response parsing | Unit test around `executeQueryHttp` / server helper            |
| Token exchange count and error policy          | Unit test around the token-exchange HTTP boundary              |
| Subscription refcount and auth-dimension keys  | Nuxt runtime test using the client double                      |
| Stale promise or generation races              | Unit/runtime test with controlled promises                     |
| SSR output and cache headers                   | Playwright/API response from the real Nuxt server              |
| Hydration reuse                                | SSR output + browser request log + status DOM + console errors |
| Real realtime delivery                         | Two pages/contexts and a real Convex mutation                  |
| Connection loss and recovery                   | Playwright `routeWebSocket` against the real connection        |
| Cross-session privacy                          | Two isolated browser contexts with distinct real sessions      |
| Package usability                              | Install the packed tarball in a consumer fixture               |

Do not add a generic test ledger, test-only runtime endpoint, or shipped event
bus. Those become a second implementation to trust and expose internal events as
contracts. Add a narrow test hook only when a critical invariant cannot be
observed at an existing boundary, and remove it if the underlying design later
makes the invariant directly observable.

### 4.3 Outcomes and sequences are both contracts

Where an operation count is the behavior—one shared subscription, no second
client HTTP query after hydration, one auth exchange per request—the test states
the count explicitly. Counts are asserted only where the boundary can measure
them reliably; they are not inferred from a generic internal trace.

### 4.4 Determinism before breadth

- Use the repository-pinned package manager and lockfile.
- Use local installed CLIs through `pnpm exec`; do not download `latest` tools in
  blocking CI.
- Use event- and state-based assertions; never fixed sleeps.
- Run the stateful live suite with one worker until measured runtime requires a
  more complex isolation model.
- Use zero automatic retries in blocking suites. A retry may collect diagnostics,
  but it may not turn red into green.
- A blocking test may not conditionally skip because infrastructure is absent.

### 4.5 Hard cutover

Once a new owner is green:

- delete the old test;
- delete the old helper or script when its last caller moves;
- delete duplicate package scripts;
- update `test/TESTING.md` in the same change.

No compatibility wrapper is required for test infrastructure.

## 5. Target test layers

### L0 — Static and package contracts

**Owner:** ESLint, TypeScript, small Node scripts, package consumer fixtures.

**Proves:** source constraints, public types, generated API/docs agreement,
exports, packaged resolution, buildability, and forbidden legacy patterns.

Rules:

- Replace shell `! rg` commands with one Node wrapper that treats only ripgrep
  exit code 1 as clean. Exit 0 is a violation; every other exit is a harness
  failure.
- One compact meta-test proves the wrapper's clean, violation, invalid-path, and
  missing-binary behavior. Do not maintain one positive-control file per grep.
- Consumer checks install the actual packed tarball; workspace resolution is not
  evidence.
- The demo is built against the current packed tarball in CI. It does not pin an
  older released version as evidence for the current source tree.

**Budget:** 5 minutes, parallel CI jobs allowed.

### L1 — Pure unit tests

**Owner:** Vitest `unit` project in Node.

**Proves:** pure state transitions, parsers, key construction, auth policy,
timeouts, error mapping, stale-result guards, upload state, pagination merge
logic, and option semantics.

Rules:

- Time and randomness are injected as function inputs where behavior depends on
  them.
- Async races use deferred promises and explicit resolution order.
- Tests assert public results and critical side effects, not private line-by-line
  implementation.
- Use table tests for true input/output domains. Do not turn unrelated scenarios
  into generated matrices.

**Budget:** 20 seconds locally.

### L2 — Convex function tests

**Owner:** Vitest `convex` project with `convex-test` and the schema.

**Proves:** schema validation, permissions, backend domain rules, function
composition, scheduled-function logic when invoked explicitly, and database
invariants.

Rules:

- Initialize a new `convexTest` instance per test.
- Test backend business logic here, not through a browser.
- Do not assert exact real-backend error text, generated IDs, search ranking, or
  production limits that `convex-test` does not model.
- A small live smoke may prove a backend feature unavailable in `convex-test`, but
  the browser suite does not become a second backend test suite.

**Budget:** 30 seconds locally.

### L3 — Nuxt runtime integration tests

**Owner:** Vitest `nuxt` project.

**Proves:** composable state and orchestration inside Nuxt: subscription acquire
and release, deduplication, args changes, skip, auth gating, sign-out purge,
transform isolation, pending/status semantics, and stale async results.

The test double represents only the Convex client methods consumed by the
runtime. It is not a simulated Convex backend.

Rules for the test double:

- Keep it in `test/helpers`; it never ships.
- Keep a compile-time structural contract for the consumed Convex client surface.
- It records calls, active listeners, and connection subscribers because those
  are the boundary outputs under test.
- Test code explicitly emits a result, error, or connection state. Do not add
  speculative automatic behavior.
- If a runtime test requires database semantics, move that proof to L2 or L4.
- Do not build a dual-driver conformance framework. Real-client assumptions are
  proven by focused L4 vertical tests.

The current Vitest browser project is removed. Pure component visibility belongs
in L3; real browser behavior belongs in L4.

**Budget:** 90 seconds locally.

### L4 — Full-stack browser contracts

**Owner:** Playwright Test against one real Nuxt server and one real local Convex
backend.

**Proves:** the integration seam that lower tiers cannot prove.

Two Playwright projects share the same runner and fixtures:

- `core`: critical product contracts, every PR and every release;
- `resilience`: disruption, repetition, and longer security scenarios, nightly
  and every release.

Both use Chromium. Browser diversity is not a primary risk for this library.

**Budgets:** core 8 minutes; resilience 12 minutes; full L4 20 minutes.

## 6. Full-stack harness architecture

### 6.1 One stack owner

Add `scripts/start-test-stack.mjs`. It is the only process orchestrator for L4.
It:

1. selects or creates the anonymous local deployment;
2. sets test-only Convex environment variables;
3. deploys the playground functions once;
4. starts `convex dev` and the Nuxt test application;
5. waits for explicit Convex, Better Auth, and Nuxt health checks;
6. forwards child logs with source prefixes;
7. terminates the whole process group on exit or signal.

Playwright `webServer` starts this command and waits on the Nuxt health endpoint.
Tests never start or retain Convex themselves. Delete per-file
`ensureLocalConvex` startup and reference counting after cutover.

In CI, an occupied port is a failure. Locally, reuse is disabled by default so a
developer does not accidentally test against an unrelated process.

### 6.2 Isolation

- L4 starts with a clean local deployment in CI.
- Playwright uses one worker initially.
- A worker-scoped fixture calls the existing guarded reset mutation before every
  test.
- Harden reset so it fails if any app table or Better Auth table cannot be
  cleared. Clear scheduled jobs and stored files when the fixture begins using
  them.
- The reset function requires both a test-only backend environment variable and
  an unguessable run token generated by the stack owner. The token is passed only
  through the test process environment.
- Test data also carries a per-test ID so failures remain diagnosable.

Parallel workers are admitted only when the core suite exceeds its budget. The
required design is one isolated backend per worker, not shared parallel mutation
of one database.

### 6.3 Playwright fixtures

Create a small fixture module with:

- `page`: fails the test on unapproved `pageerror`, hydration warnings, or console
  errors;
- `requestLog`: records browser-visible HTTP requests and responses;
- `webSocketLog`: records socket open/close and frames when a test requests it;
- `testId`: unique data namespace;
- `convex`: a narrow admin helper for reset/seed/mutate operations needed by
  scenarios;
- `newSession`: creates an isolated browser context and cleans it up.

Fixtures collect facts. Scenario assertions remain in the test that owns the
contract. Do not create a generic `expectEverythingIsHealthy` assertion that
hides which invariant failed.

### 6.4 Failure diagnostics

Playwright configuration:

- `retries: 0`;
- `workers: 1` for L4;
- `forbidOnly: true` in CI;
- `trace: 'retain-on-failure'`;
- screenshot on failure;
- no video by default;
- backend and Nuxt log tails attached on failure.

Blocking L4 directories prohibit committed `test.skip`, `test.fixme`, and
conditional environment skips. A temporarily quarantined test moves to an
explicit non-blocking quarantine project with a linked issue and expiry date; it
does not remain silently skipped in `core` or `resilience`.

## 7. Critical contract catalogue

These are scenarios, not a Cartesian product. Each exists because it crosses a
meaningful boundary or pins a high-impact lifecycle transition.

### Query, SSR, and hydration — `core`

**Q1 — SSR to realtime handoff**

- Public query with `server:true`, `subscribe:true`.
- Initial HTML contains the real data.
- Hydration produces no warning and no pending/loading flash.
- The browser performs no client HTTP query for the hydrated key.
- A mutation from a second page arrives through the real subscription.

**Q2 — Client-only query**

- `server:false`, `subscribe:true`.
- SSR contains the documented stable placeholder, never private or stale data.
- The client shows the documented pending state and then data.
- Exactly one live subscription remains after settlement.

**Q3 — HTTP-only query**

- `server:true`, `subscribe:false`.
- SSR data hydrates.
- A backend mutation does not update the page until explicit `refresh()`.
- Refresh performs one request and updates the data.

**Q4 — Args and skip lifecycle**

- Active args -> different active args -> `skip` -> active.
- No result from the previous args overwrites the current state.
- `skip` is idle and receives no updates.
- Reactivation produces one current subscription.

**Q5 — Shared ownership**

- Two consumers of one query share one underlying subscription in L3.
- Removing the first consumer preserves updates for the second.
- Removing the final consumer releases it.
- L4 proves the observable behavior across mount/unmount/navigation, not the
  internal refcount.

**Q6 — Client-navigation blocking contract**

- Navigate through `NuxtLink` to an uncached page that awaits `useConvexQuery`.
- The route follows the documented blocking behavior until the first result is
  available; it does not briefly render the destination with incomplete state.
- Cached navigation resolves without an unnecessary loading flash.
- Back/forward navigation does not create duplicate visible updates or retain
  the abandoned route's subscription.

### Authentication and privacy — `core`

**A1 — Anonymous private query**

- `auth:'auto'` while signed out remains idle.
- No private query result or token material appears in HTML.
- Public `auth:'none'` data still works.

**A2 — Authenticated SSR**

- A real signup/sign-in produces a real session and Convex JWT.
- Private SSR data is present for that user.
- The response is `Cache-Control: private, no-store`.
- Hydration keeps the same user and data without an unauthenticated flash.

**A3 — Sign-out boundary**

- An authenticated page contains both public and private query data.
- Sign-out removes private payload/state/subscriptions.
- Public data and its live updates remain.
- Protected navigation redirects with the intended return URL.

**A4 — Cross-session isolation**

- Two browser contexts sign in as distinct users.
- Each sees only its private data before and after realtime mutations.
- Signing out one context does not affect the other.

**A5 — Auth failure safety**

- Missing or failing token exchange follows the documented development and
  production policies.
- Production-visible HTML and errors contain no secret, cookie, raw token, or
  upstream implementation detail.

### Pagination and writes — `core`

**P1 — Paginated hydration and continuation**

- First page is SSR-rendered and hydrated without duplicate items.
- `loadMore` continues from the real cursor with no gap or duplicate.
- A relevant realtime change preserves ordering and cursor integrity.

**W1 — Real mutation and action**

- A mutation updates a subscribed query.
- An action round-trips through the real backend.
- Errors surface through the documented result/error contract.

**W2 — Optimistic rejection**

- An optimistic mutation updates immediately.
- Real backend rejection restores the exact previous query state.
- The error is surfaced once and does not start a refetch storm.

**U1 — File lifecycle**

- Generate upload URL -> upload bytes -> resolve storage URL -> fetch the same
  bytes.
- `useConvexStorageUrl` exercises its intentionally non-blocking state contract:
  it returns immediately, reports pending, and settles to the real URL.
- Cancellation and concurrent-call state remain L1/L3 concerns.

### Module and package integration — `core`

**N1 — Module installation and SSR smoke**

- Install the packed tarball into a minimal external Nuxt fixture.
- Prepare, typecheck, build, start, and render a page using the public API.

**N2 — Route protection**

- Open routes remain open.
- Protected routes do not mount protected content while auth is pending.
- Signed-out redirect preserves the return target.

**N3 — Server helpers**

- Packed public server exports resolve from an external fixture.
- Query, mutation, and action use the real `/api/*` wire contract.

### Disruption and repetition — `resilience`

**R1 — Delayed token exchange**

- Deterministically hold the token response.
- UI remains in auth-loading without an anonymous/private-data flash.
- Releasing the response settles once.

**R2 — Stale token after sign-out**

- The precise stale-promise ordering is proven in L1/L3.
- One L4 scenario confirms the real sign-out path does not restore a session when
  a delayed auth response completes.

**R3 — WebSocket loss and recovery**

- Intercept the real WebSocket with `routeWebSocket`.
- Close it mid-session.
- Existing data remains stable, connection state changes, and reconnect restores
  updates without duplicate visible deliveries.

**R4 — Navigation soak**

- Repeat a representative mount -> update -> unmount navigation 20 times.
- Each update is rendered once.
- Browser, page, and backend diagnostics show no growing listeners, errors, or
  stuck requests.
- Increase the iteration count only if the measured runtime remains inside the
  resilience budget.

## 8. Compatibility strategy

The lockfile answers “does the repository work with the selected versions?” It
does not prove the declared peer range or future dependency updates.

### Required compatibility lanes

1. **Locked:** every PR; exact lockfile; all L0–L3 and L4 core.
2. **Nuxt floor:** every PR or daily if runtime is excessive; install the lowest
   declared Nuxt 4 version in the consumer fixture; typecheck, build, and run N1.
3. **Dependency update PRs:** the repository's existing Renovate configuration
   opens attributable PRs. Keep `convex` separate. Group `better-auth` and
   `@convex-dev/better-auth` only if independent upgrades are not supported. Each
   production-dependency PR runs L4 core.
4. **Latest supported:** weekly, non-blocking; update within declared semver ranges
   and run L0–L4 core. This predicts the next lockfile update without testing
   unsupported majors.
5. **Upcoming majors:** manual or scheduled informational lane only when an actual
   prerelease exists and adoption is planned.

Do not maintain a custom six-leg manifest mutator and issue bot until dependency
PRs fail to provide adequate attribution.

Convex wire tripwires remain cheap unit/consumer tests:

- generated function references yield the function path expected by the module;
- committed real-backend success/error fixtures parse correctly;
- `/api/query`, mutation, and action request bodies match captured supported wire
  shapes.

Fixture refresh is an explicit reviewed command. CI never rewrites fixtures.

## 9. CI and developer commands

The final command surface is intentionally small:

```text
pnpm test                 # L1 + L2 + L3
pnpm test:unit            # L1
pnpm test:convex          # L2
pnpm test:nuxt            # L3
pnpm test:fullstack       # L4 core
pnpm test:resilience      # L4 resilience
pnpm check                # format + lint + types + contracts + package checks
pnpm verify:release       # check + test + fullstack + resilience + packed consumer
```

CI uses:

```text
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
```

No blocking job invokes `npx <tool>@latest`.

### Required checks

| Trigger         | Required                                                     |
| --------------- | ------------------------------------------------------------ |
| Local iteration | narrow owning project                                        |
| Pull request    | `check`, `test`, packed consumer, L4 `core`                  |
| Push to main    | same as PR                                                   |
| Nightly         | PR checks + L4 `resilience` + latest-supported compatibility |
| Release         | `verify:release` on the exact commit and locked dependencies |

The L4 core check may begin as advisory only while the new runner is being built.
It becomes required after 20 consecutive green CI executions with zero retry
passes. CI history is the evidence; no manual streak log is maintained.

## 10. Flake policy

A flaky blocking test is a product defect in the harness.

- No automatic retries in required checks.
- First failure retains trace, screenshot, console, request, WebSocket, Nuxt, and
  Convex diagnostics.
- A test that passes unchanged on rerun is recorded as flaky and fixed promptly.
- If it cannot be fixed immediately, move it to the explicit quarantine project
  with an issue, owner, reason, and expiry no longer than 14 days.
- Quarantine never satisfies a release criterion.
- Fixed sleeps are rejected. Poll an observable state with a bounded timeout.

## 11. Coverage policy

There is no global line-coverage percentage gate. It rewards low-value tests and
does not prove the integration seam.

Coverage is reviewed by risk:

- every exported runtime composable has success, error, and relevant cancellation
  or auth-boundary coverage in L1/L3;
- every critical catalogue scenario has one owning automated test;
- every escaped regression adds a test at the lowest tier that would have caught
  it, plus a broader smoke only when the escape crossed a real boundary;
- removal of a critical scenario requires an RFC change, not merely deleting a
  test.

Mutation testing, visual snapshots, load testing, multi-browser CI, cloud Convex
CI, and randomized chaos are deferred. They require an escaped defect or measured
risk that the existing architecture could not detect.

## 12. Implementation plan

### Phase 0 — Freeze behavior and measure

- Record current commands, pass counts, and wall times.
- Run the existing suite green before structural changes.
- Classify each existing browser/E2E test by its new owner.

**Exit:** migration map reviewed; no behavior is silently dropped.

### Phase 1 — Deterministic foundation

- Replace latest installer invocations with pinned pnpm and frozen lockfile.
- Fix forbidden-pattern exit handling with one wrapper and meta-test.
- Define the final package scripts from section 9.
- Add budgets and CI timeouts.

**Exit:** two clean CI runs install the same dependency graph; seeded forbidden
pattern and missing-ripgrep failures are red.

### Phase 2 — Playwright hard cutover

- Add Playwright config and fixtures.
- Add `start-test-stack.mjs` with health checks and process-group teardown.
- Harden the existing reset mutation and use it before each L4 test.
- Move backend-independent E2E scenarios and real-backend scenarios to Playwright.
- Enable failure traces and log attachments.
- Delete the Vitest `e2e` project, `ensureLocalConvex`, and duplicate E2E scripts.

**Exit:** all migrated scenarios pass under one Playwright command; missing Convex
or Nuxt readiness fails loudly; no old E2E path remains.

### Phase 3 — Critical seam contracts

- Implement Q1–Q6 and A1–A5.
- Add exact lower-tier sequence assertions at their owning boundaries.
- Prove red -> green for duplicate hydration fetch, leaked final subscription,
  stale private data after sign-out, and missing cache header.

**Exit:** L4 core is below 8 minutes and has 20 consecutive green advisory runs;
make it a required PR check.

### Phase 4 — Remaining vertical contracts

- Implement P1, W1, W2, U1, and N1–N3.
- Build the demo against the packed current module.
- Remove the Vitest browser project after its component contracts are owned by L3
  or L4.

**Exit:** every public integration surface has at least one real vertical proof;
no duplicate browser runner remains.

### Phase 5 — Resilience and compatibility

- Implement R1–R4.
- Add Nuxt-floor consumer verification.
- Configure attributable dependency update PRs.
- Add latest-supported weekly verification.

**Exit:** resilience stays below 12 minutes; a deliberately incompatible fixture
or dependency version fails the expected owning lane.

### Phase 6 — Release adoption and cleanup

- Make `verify:release` the only release verification entry point.
- Remove stale test labs, duplicate helpers, obsolete scripts, and obsolete RFC
  status machinery.
- Rewrite `test/TESTING.md` as the concise operating manual for the final system.

**Exit:** a release dry run executes the exact locked production gate; repository
search finds no old E2E startup, skip, or duplicate full-test path.

## 13. Definition of done

- [ ] Vitest owns only L1–L3; Playwright owns all full-stack browser tests.
- [ ] L4 has one process owner, one reset path, one fixture system, and no
      conditional infrastructure skips.
- [ ] Required CI uses pinned tooling and a frozen lockfile.
- [ ] Q1–Q6, A1–A5, P1, W1–W2, U1, N1–N3 are green in `core`.
- [ ] R1–R4 are green in `resilience`.
- [ ] The packed consumer and demo build against the current tarball.
- [ ] The declared Nuxt floor is proven.
- [ ] Production dependency updates run L4 core in attributable PRs.
- [ ] Core, resilience, and release budgets hold.
- [ ] Required tests have zero retries, no fixed sleeps, and no committed skips.
- [ ] Old E2E/browser projects, helpers, scripts, and duplicate tests are deleted.
- [ ] `test/TESTING.md` describes only the final architecture.
