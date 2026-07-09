# RFC: Testing Harness — Closing the Fidelity Gap

> **Status:** Draft for adoption. **Owner:** maintainers. **Created:** 2026-07-09.
>
> **This file is an executable spec**: every judgment call has a ruling (§4),
> every task has an ID with acceptance criteria (§5), and progress is
> recorded append-only in the Status Log (§9). Companion spec:
> `ginko-content/testing-harness-rfc.md` shares the tier philosophy, the
> both-directions discipline, and the harness-runner/agentic conventions —
> this RFC does not restate them, it applies them to this repo's specific
> risk profile.

---

## 0. Mission and thesis

This library's product **is the integration seam**: SSR HTTP fetch →
hydration → WebSocket upgrade, cookie → JWT exchange, subscription
refcounting, sign-out purging. Today that seam is tested exclusively through
stand-ins: `MockConvexClient` (our own fake), `convex-test` (an in-memory
simulated runtime), and happy-dom. The real-backend e2e tier exists
(`test/e2e/` + `test/helpers/local-convex.ts`) and is good — but it is
manual-only, excluded from CI, **and excluded from the release gate**
(`scripts/release.mjs` runs format/lint/types/contracts/test/prepack — never
`test:e2e`). A release can ship with the core value proposition never once
exercised against a real Convex process.

**Mission:** every release is proven against a real local Convex backend —
real JWTs, real WebSockets, real wire format — without reintroducing the
flakiness that made the project retreat from browser E2E in the first place
(`test/TESTING.md` "Why this layout").

**The strategy, three pillars:** don't write more tests against mocks, and
don't duplicate mock-tier tests into e2e — instead (a) put the existing
real-backend tier into CI on a non-PR lane with a graduation path,
(b) make the mocks *provably faithful* to the real client with a shared
conformance suite so the fast tiers stay trustworthy, and (c) make the
invisible failure modes **countable**: a test-mode operation ledger
(Phase I) plus a generated behavior-mode matrix (Phase B) asserting, for
every supported combination of server/client × blocking/lazy × auth mode ×
navigation type, not just the final state but the exact operations
performed — fetch counts, subscription balance, token exchanges, purge
events, hydration payload reuse. The hard regressions in this library are
wrong *operation sequences* with correct-looking final states; only
counting catches them. And because operation counts are externally
observable behavior (not internals), those tests survive rewrites of the
implementation — which is what makes the harness hold up for years, not
months.

---

## 1. Current state (verified 2026-07-09)

### 1.1 What exists and is genuinely good — do not rebuild

| Layer | What | Where |
|---|---|---|
| Deterministic tiers | 5 vitest projects: `unit` (~55 files, pure logic), `convex` (convex-test on edge-runtime against `playground/convex`), `nuxt` (composables in Nuxt runtime + `MockConvexClient`), `browser` (Chromium component rendering), `e2e` (real backend, serial) | `vitest.config.ts`, `test/TESTING.md` |
| Real-backend plumbing | Spawns `npx convex dev --local` with port-wait, `.env.local` parsing, retain/release refcounting, Better-Auth readiness preflight | `test/helpers/local-convex.ts` |
| E2E scenarios | Cross-tab realtime sync, auth loop, auth-proxy routes, connection state, route protection, SSR smoke, server-utils, misconfig overlay | `test/e2e/*.test.ts` (8 files) |
| Contract battery | api-surface generation check, package-exports check, workspace-dep alignment, consumer-smoke (pack → install → resolve → build → typecheck), missing-convex-api fixture, ~9 `check:no-legacy-*` rg greps | `scripts/*.mjs`, `package.json` `lint`/`check:contracts` |
| CI | lint, mocked-tier tests (incl. browser project), prepack + vue-tsc + `pkg-pr-new` preview release, consumer-smoke — on every PR/push | `.github/workflows/ci.yml` |
| Release script | Branch/tree/tag hygiene, format/lint/types/contracts/test/prepack, changelogen, publish | `scripts/release.mjs` |
| Hardening breadcrumbs | `F-##` audit-remediation comments in runtime code, each marking a decision a test guards | `src/runtime/**` |
| Test-design rules | No fixed sleeps, reactive-state assertions over body-text scraping, backend logic belongs in convex-test | `test/TESTING.md` |

### 1.2 The gaps (ranked by regression-escape likelihood)

1. **The release gate never touches a real backend.** `release.mjs` line
   ~110–115: format, lint, types, contracts, `npm run test`, prepack.
   `test:e2e` is absent. The SSR→WS handoff, token lifecycle, and sign-out
   purge ship on mock evidence alone.
2. **Real-backend e2e is invisible in CI.** Not on any schedule, any lane.
   Worse, the suites **skip silently** when `CONVEX_URL` is unset — a lane
   that "passed" may have run zero tests (see C-8).
3. **Mock fidelity is unproven.** `test/helpers/mock-convex-client.ts`
   re-implements `onUpdate`/`query`/`mutation`/connection-state by hand.
   Nothing checks it behaves like the real `ConvexClient`. If the mock
   drifts (or was subtly wrong from day one), the entire `nuxt` tier is
   green paint over the actual behavior.
4. **`convex` is a hard dependency (`^1.32.0`) with deep coupling** — the
   module uses `Symbol.for('functionName')` (a Convex client internal), the
   `/api/query` HTTP contract, JWT response shapes, and
   `subscribeToConnectionState`. A minor Convex release can break all of it;
   nothing tests against convex@latest before Renovate lands it. Same class
   of risk: `better-auth` + `@convex-dev/better-auth` (the
   `/api/auth/convex/token` contract), `h3` pinned exact at 1.15.5.
5. **The `! rg` contract checks pass vacuously on error.** Verified:
   `sh -c '! rg … <bad-path>'` exits 0 when rg errors (exit 2) or is missing
   (exit 127) — inversion can't distinguish "no matches" (exit 1, the only
   legitimate pass) from "rg never ran". ~9 lint guards share this hole, and
   none has a positive control proving it still catches its pattern.
6. **Security invariants are asserted only in unit tests.** The
   `Cache-Control: private, no-store` guard (F-10 — prevents one user's JWT
   being CDN-cached for another), single-token-exchange-per-request (F-13),
   and cross-user sign-out purge isolation deserve real-server, two-session
   proof.
7. **`demo/` pins `better-convex-nuxt@0.4.0`** (plus older better-auth) while
   the repo is at 0.5.0 — the public showcase silently diverges from the
   module it advertises.
8. **CI matrix:** Node 20 / ubuntu only; nuxt peer is `^4.0.0` but every
   test runs against 4.3.x — the declared floor is never exercised.
9. **Nothing observes operation sequences.** All current assertions are on
   final state (data rendered, status value, header present). The seam's
   worst regressions — a second fetch after hydration, a subscription
   surviving unmount, a second token exchange per request, a sign-out purge
   that silently no-ops — leave the final state *correct*. No current tier
   can fail on them.

### 1.3 Researched facts that shape the plan (2026-07-09)

- **Non-interactive CI bootstrap is officially supported.** In
  non-interactive shells, `npx convex` never prompts for login: with no
  configured deployment and no `CONVEX_DEPLOY_KEY`, the CLI auto-provisions
  an **anonymous local deployment**. So Phase L is CLI-first; the
  self-hosted Docker images/compose from `get-convex/convex-backend` remain
  the fallback (both are the same open-source backend). Sources:
  [Testing: local backend](https://docs.convex.dev/testing/convex-backend),
  [Local deployments](https://docs.convex.dev/cli/local-deployments),
  [Agent mode](https://docs.convex.dev/cli/agent-mode),
  [Anonymous development](https://stack.convex.dev/anonymous-development),
  [Self-hosted README](https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md).
- **The Convex team's own local-OSS testing pattern**: one persistent
  backend per run, serial execution, and an `IS_TEST`-guarded
  `testingMutation` **`clearAll`** that wipes all schema tables, cancels
  scheduled jobs, and deletes stored files between tests — adopted here as
  R-13/L-6 (upgrades our isolation from convention to enforcement). Source:
  [Testing with the local OSS backend](https://stack.convex.dev/testing-with-local-oss-backend).
- **Local OSS backend limitations**: no built-in time mocking and no
  randomness control — so backend logic depending on either stays in
  `convex-test` (R-14). Same source.

---

## 2. Target tiers

Same tier discipline as the ginko RFC: every check lives in exactly one
tier, each tier has a budget, growth in a tier must fit its budget.

| Tier | Trigger | Budget | Contents | Question it answers |
|---|---|---|---|---|
| **T-fast** | local iteration | ≤ 2 min | `unit` + `convex` + `nuxt` projects | "Is the logic right, per the mocks?" |
| **T-pr** | every PR (current CI) | ≤ 15 min | T-fast + `browser` + lint/contract battery + prepack/types + consumer-smoke + preview release | "Does it build, type, pack, and render?" |
| **T-live** | nightly cron + push to main + **mandatory before release** | ≤ 25 min | real local Convex backend: existing `test/e2e/` + operation-ledger invariants + behavior-mode matrix + mock-conformance real driver + security/timing invariants (Phases L/I/B/M/S) | "Does the real integration seam work — and do the operation counts prove it?" |
| **T-canary** | weekly cron, non-blocking | ≤ 30 min/leg | T-pr + T-live against dep attribution matrix (convex, better-auth, @convex-dev/better-auth, nuxt alone-at-latest; all-latest; min-peers nuxt@4.0.0) | "Which upstream release will break us, and is our peer floor honest?" |

**Non-goals** (rejected as poor confidence-per-hour; admission ticket = a
concrete escaped regression):
- Convex **cloud** deployments in CI (secrets, cost, network flake — the
  local open-source backend is the same core; cloud stays exclusive to the
  `demo/` deploy workflow).
- Multi-browser matrix (Chromium only; this module's risk is the wire and
  lifecycle, not CSS).
- Visual regression, load testing, coverage-percentage gates.
- Porting the `nuxt`-tier test suite wholesale into e2e (see R-3 — the
  conformance suite is the anti-duplication mechanism).
- Re-testing backend business logic in e2e (`convex-test` owns it — R-4).

---

## 3. Principles

1. **Fidelity over duplication.** When mock and reality can disagree, the
   fix is a conformance suite that runs the *same scenarios* against both —
   not two hand-maintained test suites drifting independently.
2. **A skipped suite must be loud.** Any lane whose tests can
   conditionally skip asserts, in CI, that it actually ran N > 0 tests.
3. **Graduation, not big-bang.** This project already retreated from flaky
   e2e once. New live checks earn PR-blocking status only via a recorded
   stability streak (R-1); until then they block releases, not PRs.
4. **Both-directions proof** for every new check (break it → red, fix it →
   green), recorded in §9.
5. **Every negative grep needs a positive control** and a sound pass
   condition (only "ran and found nothing" passes — see gap #5).

---

## 4. Rulings (pre-made decisions — do not re-litigate)

- **R-1 — Lane placement and graduation.** T-live runs nightly + on push to
  main + inside the release script. It does **not** block PRs. After **14
  consecutive green scheduled runs** (recorded in §9), the stable subset
  (smoke-ssr, auth-loop, realtime-subscription) may be promoted to PRs;
  any test that flakes twice in the streak restarts its own counter.
- **R-2 — Local backend only in CI.** `npx convex dev --local`
  (open-source local backend) is the only backend CI touches. If
  non-interactive bootstrap proves impossible on runners, the fallback is
  the self-hosted `convex-backend` Docker image — never a cloud deployment,
  never a shared long-lived instance.
- **R-3 — Conformance beats duplication.** The mock-conformance suite (Phase
  M) is a small set of scenario specs (~10–15) written once and executed by
  two drivers: `MockConvexClient` (in the `nuxt` project, every PR) and the
  real `ConvexClient` against the local backend (T-live). `nuxt`-tier tests
  are NOT copied into e2e; e2e asserts only what mocks cannot: wire, auth,
  process lifecycle.
- **R-4 — Backend logic stays in `convex-test`.** T-live never asserts
  business behavior of `playground/convex` functions; it asserts the seam.
- **R-5 — No fixed sleeps, no retries in blocking tiers.** Existing
  TESTING.md rule, now with teeth: a blocking-tier test that passes on
  retry gets an issue within 24h and is fixed or demoted within a week
  (flake ledger, Phase H). Event/state-based waits only.
- **R-6 — Canary attributes, never blocks.** One matrix leg per high-risk
  dep bumped alone (`convex`, `better-auth`, `@convex-dev/better-auth`,
  `nuxt`), one all-latest leg, one min-peers leg (`nuxt@4.0.0`). Failure →
  one issue per dep with version diff + failing step + release-notes link.
- **R-7 — Grep guards must distinguish "clean" from "didn't run".** Every
  `check:no-legacy-*` goes through one shared wrapper whose pass condition
  is exactly rg exit code 1; exit 0 (match found), 2 (error), 127 (missing)
  all fail with distinct messages. Each guard gets a positive-control
  fixture proving its pattern is still caught.
- **R-8 — `demo/` tracks the current module.** The demo consumes the
  `pkg-pr-new` preview (or a `file:` pack) in CI checks; a pinned old
  version in `demo/package.json` is a red `check:workspace-deps` finding,
  not a shrug.
- **R-9 — One release gate.** `scripts/release.mjs` grows exactly one new
  step: T-live. No parallel "full" script that drifts from the real one.
- **R-10 — Reuse the ginko agentic conventions.** Escalation ladder in
  repo agent docs, narrowest-rerun-command failure reports, scope reduction
  local-only, thin-orchestrator constraints — adopt as written in
  `ginko-content/testing-harness-rfc.md` (R-13/R-14/C-16/C-17 there); do
  not fork the philosophy.
- **R-11 — Assert operations, not just outcomes, at the seam.** For any
  change touching `useConvexQuery`, `convex-cache`, `client-engine`,
  `plugin.server`, or the token exchange, passing final-state tests is not
  sufficient evidence — the ledger invariants (fetch counts, subscription
  balance, exchange count, purge events) are the review-blocking tests.
  This is the codified answer to "double fetch / leaked subscription /
  silent purge no-op look green".
- **R-12 — Instrumentation never ships and never perturbs.** The ledger is
  enabled only via a test-only option in fixture configs, lives behind a
  build-time flag, records synchronously (append to an array — no awaits,
  no I/O on hot paths), and a packaging check proves `dist/` contains none
  of it. If instrumentation would change timing, it doesn't go in.
- **R-13 — Test isolation by `clearAll`, not convention.** Adopt the
  Convex-team pattern (§1.3): an `IS_TEST`-guarded `testingMutation`
  `clearAll` wipes tables, scheduled jobs, and stored files between e2e
  files; per-test namespacing remains for within-file isolation.
- **R-14 — Time/randomness-dependent backend logic stays in
  `convex-test`.** The local OSS backend cannot mock time or randomness
  (§1.3); a T-live test that depends on either is a flake by construction
  and gets rejected in review.
- **R-15 — The matrix is generated, cells are individual tests.** The
  behavior-mode matrix is data (`modes.ts`) driving dynamically registered
  tests — one named test per cell, never a loop inside one `it()`. Adding a
  composable option means adding a dimension or an exclusion rule in one
  place, with the diff showing exactly which cells appeared.

---

## 5. Phases and tasks

### Phase L — T-live: real backend into CI and the release gate

- **L-1** Prove non-interactive bootstrap on a fresh CI runner: script the
  `test/TESTING.md` bootstrap (`convex dev --local --once`, `convex env set
  SITE_URL/BETTER_AUTH_SECRET`) end-to-end with no TTY. If the Convex CLI
  insists on prompts on a cold machine, implement the R-2 Docker fallback
  instead. Deliverable: `scripts/e2e-bootstrap.mjs` that goes from clean
  checkout → ready local backend, idempotently. *Gate:* green run on a
  GitHub-hosted runner, wall time recorded in §9.
- **L-2** `.github/workflows/live.yml`: nightly `schedule` + push to main +
  `workflow_dispatch`; ubuntu, Node 20; steps: install → `dev:prepare` →
  L-1 bootstrap → `CONVEX_E2E_AUTO_START=true npm run test:e2e`. *Gate:*
  green dispatch run.
- **L-3** Anti-skip assertion (P-2, C-8): the lane fails if the e2e project
  reports 0 executed tests or any file skipped for missing `CONVEX_URL`
  (parse vitest's JSON reporter output — count only). *Gate:* both
  directions — unset the env in a branch, watch the lane fail loudly.
- **L-4** Wire T-live into `scripts/release.mjs` between `test` and
  `prepack` (R-9): run L-1 bootstrap + `test:e2e`; abort release on red.
  *Gate:* dry-run of the release script (stop before publish) shows the
  step executing.
- **L-5** Start the R-1 graduation ledger in §9 (date, run URL, green/red,
  flaked test if any). *Gate:* first 3 nightly entries recorded.
- **L-6** Isolation upgrade (R-13): add an `IS_TEST`-guarded `clearAll`
  testing mutation to `playground/convex` (wipe schema tables, cancel
  scheduled jobs, delete stored files — extend the existing `testing.ts`
  pattern) and call it between e2e files. *Gate:* a test that seeds data,
  clears, and asserts emptiness — plus proof `clearAll` throws when
  `IS_TEST` is unset (never callable in a real deployment).

### Phase I — Operation ledger (the instrument that sees silent regressions)

The seam's worst regressions are wrong operation sequences with
correct-looking final states (gap #9). This phase builds the counter.

- **I-1** Test-mode instrumentation: when the fixture sets a test-only
  module option (playground/e2e configs only, R-12), install wrappers that
  append every operation to a ledger. Server side: `/api/query` executions
  (function name, args hash, auth dimension), token exchanges, auth
  snapshot cache hits/misses, payload keys serialized. Client side: WS
  `subscribe`/`unsubscribe` (with query key), client-side HTTP queries,
  `setAuth` calls, purge events, hydration payload hits vs refetches.
  Server ledger exposed per-request via a test-only endpoint; client ledger
  on `window.__convexLedger`. *Gate:* recorder unit tests against scripted
  operation sequences (a recorder that drops records produces false-green
  invariants — it needs its own tests), plus a `check:contracts` step
  proving `dist/` contains no instrumentation code.
- **I-2** Invariant helpers:
  `expectLedger(page, { ssrQueries: 1, clientRefetches: 0, tokenExchanges: 1, subscribeBalance: 0, purges: [...] })`
  with failure messages that print the full recorded sequence (the ledger
  doubles as the debugging trace an agent needs). *Gate:* helper unit
  tests.
- **I-3** Retrofit the existing e2e smokes with the three highest-value
  invariants: exactly **one** token exchange per SSR request (F-13 becomes
  a count, not a comment), **zero** client refetches of SSR-delivered data
  (hydration honesty), and **zero** net subscriptions after navigating
  away (refcount balance). *Gate:* both directions for each — e.g.
  duplicate the exchange call locally, watch the count assertion go red.

### Phase B — Behavior-mode matrix (client × server × blocking × lazy × auth)

This is the direct answer to "it has to work client side and server side,
blocking and non-blocking". Hand-written tests sample this space; the
matrix enumerates it.

- **B-1** Read the option types of `useConvexQuery` and
  `useConvexPaginatedQuery` and encode the real dimensions as data in
  `test/e2e/matrix/modes.ts`: at minimum `server` on/off, blocking vs
  `lazy`, auth `auto`/`none`, session authed/anonymous, and entry mode
  (hard SSR load, client-side navigation, back/forward) — plus explicit
  exclusion rules for invalid combinations. *Gate:* dimension list reviewed
  against the actual option types, not the docs.
- **B-2** One matrix page per composable in the playground, driven by query
  params (`/matrix/query?server=1&lazy=0&auth=auto`), so a single page
  component serves every cell. Per-cell invariants asserted via the ledger
  and the DOM: expected SSR query count; blocking cells render data in the
  SSR HTML, lazy cells render a stable placeholder (and hydrate without
  mismatch); zero client refetch when a payload exists; exactly one live
  subscription after mount and zero after unmount; legal status
  transitions (`idle→pending→success`, no `success→pending` flash on
  hydration, `keepPreviousData` honored on args change); anonymous cells
  carry no token material in HTML. One dynamically registered, named test
  per cell (R-15). *Gate:* both-directions proofs for three representative
  regressions — a forced double fetch, a leaked subscription, a hydration
  mismatch — each failing with the cell name in the test title.
- **B-3** Run the full matrix in T-live (target < 5 min for ~24–48 cells —
  cells share the page and the backend; the cost is navigation, not
  build). Promotion to T-pr follows R-1 like everything else. *Gate:*
  wall time recorded in §9.
- **B-4** Soak cell for leak detection: 50 client-side navigations across
  matrix pages; the ledger must balance (subscribes == unsubscribes, no
  monotonically growing counter). Refcount leaks (C-2) only manifest under
  repetition — no single-mount test can see them. *Gate:* both directions
  via a deliberately skipped `releaseSubscription`.

### Phase M — Mock conformance (makes the fast tiers trustworthy)

- **M-1** `test/conformance/scenarios.ts`: driver-agnostic scenario specs,
  each `{ name, steps, expectations }` over an abstract client interface —
  covering at minimum: subscribe → server-side change → update delivered;
  unsubscribe stops delivery; two subscribers to the same query share one
  subscription and both update; args change swaps subscription without a
  gap or a leak; `setAuth` → authed query result changes; sign-out →
  authed subscriptions terminate, public ones survive; connection drop →
  state transitions → resubscribe on reconnect; mutation → dependent query
  updates; error result surfaces as error, and a success payload containing
  a `code` field does NOT (F-33).
- **M-2** Mock driver: run scenarios against `MockConvexClient` in the
  `nuxt` project (T-pr). Real driver: run the same scenarios against
  `ConvexClient` + local backend in T-live, using small dedicated
  `playground/convex` functions where needed (a `conformance.ts` module —
  data plumbing only, R-4). *Gate:* both drivers green; **every future
  `MockConvexClient` change requires a green real-driver run** (note in the
  mock's header comment).
- **M-3** Divergence protocol: when the real driver fails a scenario the
  mock passes, the fix is to make the mock match reality and keep the
  scenario — never to fork the scenario per driver. Record each divergence
  found in §9 (these are the harness's proof of value). *Gate:* protocol
  documented in `test/TESTING.md`.

### Phase S — Security and lifecycle invariants on the real stack

- **S-1** Cache-safety (F-10): in T-live, fetch an SSR page as an
  authenticated user; assert `Cache-Control: private, no-store` on every
  response whose HTML embeds a token, and that an unauthenticated fetch of
  the same route carries no token material. *Gate:* both directions —
  disable the header guard locally, watch it fail.
- **S-2** Cross-session isolation: two independent browser contexts, users
  A and B; assert B's page/payloads never contain A's user document, JWT,
  or private query data — before sign-in, after sign-in, and **after A
  signs out** (purge proof: A's authed data gone from A's client state,
  public data retained — pins `clearAuthSubscriptions` +
  `getPublicOnlyPayloadKeys`). *Gate:* both directions via a deliberate
  purge-skip patch.
- **S-3** Token lifecycle races (real JWTs, mock clock where possible):
  expiry inside the safety buffer triggers refresh before a request goes
  out stale; a slow `fetchToken` resolving after sign-out is dropped
  (generation counter); one page load performs exactly **one**
  cookie→JWT exchange (F-13 — count requests to
  `/api/auth/convex/token`). *Gate:* each pinned by a test that fails when
  its guard (buffer, generation check, snapshot cache) is disabled.
- **S-4** SSR/hydration honesty: `smoke-ssr` extended to assert the
  server-rendered HTML contains real query data (not a loading shell), the
  client upgrades to WS without refetch-flicker (no intermediate `pending`
  after hydration), and zero console errors / hydration warnings on the
  visited pages. *Gate:* both directions via a forced hydration mismatch.
- **S-5** Deterministic timing injection (not fuzzing — three targeted
  scenarios via Playwright route interception): (a) delay
  `/api/auth/convex/token` by several seconds → UI stays in auth-loading
  with no unauthenticated flash, and the ledger still shows exactly one
  exchange; (b) delay the post-hydration WS upgrade → SSR data remains
  rendered with no flicker, upgrade completes, no duplicate fetch; (c)
  sever the WS mid-session (offline emulation / route abort) → connection
  state transitions correctly, resubscription on recovery adds no
  duplicate subscription (ledger balance). These are the races users hit
  on slow networks; on localhost without injected latency they never
  occur, so CI would never see them. *Gate:* both directions each.
- **S-6** Optimistic rollback against real rejection: a mutation with an
  optimistic update targeting the intentional-failure function
  (`playground/convex/testing.ts`) → assert query data rolls back to the
  exact pre-mutation state and the error surfaces; ledger confirms no
  orphaned subscription or refetch storm. *Gate:* both directions via
  disabling the rollback path locally.

### Phase D — Dependency attribution canary

- **D-1** `.github/workflows/deps-canary.yml`: weekly; matrix legs per R-6.
  Each leg: bump per mode → install → `npm run test` + `check:contracts` +
  T-live (bootstrap + `test:e2e`). Reuses the ginko bump-script design
  (`scripts/deps-canary-bump.mjs`, manifest-edit only, C-18 there).
  *Gate:* green dispatch; a known-bad pin in a branch files the per-dep
  issue with all elements.
- **D-2** Convex-internal tripwires as fast tests (cheaper than waiting for
  canary): unit tests that fail if `Symbol.for('functionName')` no longer
  yields function names from the generated api object, or if
  `parseConvexResponse` no longer matches the `/api/query` response shape
  fixtures (captured from a real local backend in T-live and committed as
  fixtures — refreshed by a `--update` flag, reviewed like goldens).
  *Gate:* fixture capture script exists; tripwires fail on a mutated fixture.
- **D-3** Demo drift (R-8): extend `check:workspace-deps` to fail when
  `demo/package.json` pins a `better-convex-nuxt` version older than the
  repo's; add a canary leg (or a step in D-1's all-latest leg) that builds
  `demo/` against the current pack. *Gate:* check red today (0.4.0 vs
  0.5.0), green after the demo bump.

### Phase H — Harness hygiene (small, do early, mostly one sitting)

- **H-1** Fix the `! rg` vacuous pass (gap #5, R-7): replace every inline
  `sh -c '! rg …'` with `node scripts/check-forbidden-pattern.mjs
  <pattern> <paths…>` that treats rg exit 1 as pass, 0 as "found
  violations" (printing them), anything else as harness failure. *Gate:*
  three-way proof — clean tree passes; seeded violation fails; renamed rg
  binary fails with "rg missing", not a pass.
- **H-2** Positive controls: one fixture file per `check:no-legacy-*`
  pattern under `test/fixtures/lint-controls/`, plus a meta-check that each
  guard flags its control when pointed at it. *Gate:* meta-check green.
- **H-3** Flake ledger `meta/flake-log.md` + the R-5 policy paragraph in
  `test/TESTING.md`. *Gate:* referenced from TESTING.md.
- **H-4** Escalation ladder for agents (R-10) in the repo's agent docs:
  change in `src/runtime/composables/**` → `test:nuxt` first;
  `playground/convex/**` → `vitest --project=convex`; auth/server utils →
  `unit` + the matching e2e file name for later; `scripts/**` or exports →
  `check:contracts`. Full `npm run test` once before PR; T-live is never
  run per-iteration locally unless the change touches the seam. *Gate:*
  every row's command verified runnable.
- **H-5** Budget baselines: record current wall times (T-fast, T-pr jobs,
  first T-live run) in §8. *Gate:* table filled.
- **H-6** F-## traceability check: `scripts/check-audit-traceability.mjs`
  scans `src/runtime/**` for `F-##` audit markers and fails if any marker
  has no test file referencing the same `F-##`. The audit remediation
  encoded years of judgment in those comments; this makes every one of
  them enforceable instead of archaeological, and any future `F-##` added
  during a fix automatically demands its regression test. *Gate:* runs in
  `check:contracts`; currently-orphaned markers either get tests or an
  explicit allowlist entry with a reason.

### Phase Z — Explicitly deferred (do NOT do now)

Cloud-backed CI e2e, multi-browser matrix, visual regression, load/perf
testing, Windows CI legs (revisit if a Windows consumer bug ever arrives),
mutation testing, coverage gates, full network fuzzing (S-5's three
deterministic scenarios are the sweet spot; randomized chaos buys flake,
not confidence, at this scale). Admission ticket: a concrete escaped
regression the deferred item would have caught; record it in §9.

**Recommended order:** H (hours, closes a live hole) → L (the thesis) →
I (the instrument) → B (the matrix) → M → S → D. L before everything
live-backed because they all need the L-1 bootstrap; I before B because
the matrix asserts through the ledger.

---

## 6. Gates

| Gate | Command | When |
|---|---|---|
| G-fast | `npm run test` | after every task |
| G-lint | `npm run lint && npm run check:contracts` | before every commit |
| G-live | L-1 bootstrap + `npm run test:e2e` | after any change to `src/runtime/**`, `test/e2e/**`, `test/helpers/**`, `playground/convex/**` |
| G-budget | compare vs §8 | end of every phase |

Both-directions proof mandatory for every new check; one task = one commit
(`test|ci|chore(scope): summary [TH-<task-id>]`).

---

## 7. Cornerstones — code that is easy to get wrong

- **C-1 — `src/runtime/composables/useConvexQuery.ts` (the seam itself).**
  ~800 lines orchestrating SSR fetch → `useAsyncData` hydration → WS
  upgrade, the auth execution gate (`auto`/`none`), `keepPreviousData`,
  sign-out purge hooks, nested watchers for args/auth changes. The failure
  modes are all *silent*: a leaked subscription (works, but N grows), a
  double-fetch after hydration (works, but flickers and bills twice), stale
  data across a sign-out (works, but leaks). Every refactor here needs the
  conformance suite (Phase M) and S-4 green — unit tests alone cannot see
  these.
- **C-2 — `src/runtime/utils/convex-cache.ts` refcounting.**
  `acquireQuerySubscription`/`releaseSubscription` + per-NuxtApp `WeakMap`
  + `withAuthDimension` keying. Off-by-one in release → dead subscriptions
  accumulate per navigation (memory + billing, invisible to tests that
  mount once). Wrong auth-dimension key → an `auth: 'none'` subscriber is
  handed authed data. The purge split (`clearAuthSubscriptions` vs
  `getPublicOnlyPayloadKeys`) has both failure directions: too much purged
  (public data flashes away on sign-out) and too little (private data
  survives) — S-2 pins both.
- **C-3 — `src/runtime/auth/client-engine.ts` token races.** Positive and
  negative token caches (`TOKEN_CACHE_MS`, `NULL_TOKEN_CACHE_MS`), the
  JWT-expiry safety buffer, and generation counters that drop stale async
  results. The generation check is the classic deletion target ("this
  counter seems unused") — removing it reintroduces the
  sign-out-then-stale-token-arrives bug. S-3 exists to make that deletion
  red.
- **C-4 — `src/runtime/plugin.server.ts` Cache-Control guard (F-10).** When
  a per-user JWT is embedded in SSR state, the response must carry
  `private, no-store`. This is a one-line `setHeader` a refactor can drop
  with zero test failures today; the blast radius is one user's session
  cached by a CDN and served to another. S-1 is its regression test —
  security-critical, never weaken.
- **C-5 — `src/runtime/server/utils/token-exchange.ts` (F-13).** Must be
  the *single* cookie→JWT exchange per request, and must never throw
  (returns `thrown`/`status`). A second call site "for convenience"
  doubles auth latency and can produce split-brain sessions; a raised
  exception turns every SSR page into a 500 when Better Auth hiccups.
- **C-6 — `src/runtime/utils/convex-shared.ts` triple hazard.** (a)
  `hashArgs`/`getQueryKey` via `ohash` — an ohash major bump silently
  changes every cache key (payload mismatch on hydrate = full refetch, or
  worse, cross-key collision); pin and test key stability with committed
  expected hashes. (b) `parseConvexResponse` F-33 — a success payload whose
  *value* contains `code` must not be classified as an error. (c)
  `Symbol.for('functionName')` — a Convex client internal, no semver
  contract; D-2's tripwire is the early warning.
- **C-7 — `test/helpers/mock-convex-client.ts` is load-bearing paint.**
  Every `nuxt`-tier green depends on this fake matching reality. Its header
  must say: changes here require a green conformance real-driver run (M-2).
  Never add mock behavior that no conformance scenario exercises — that's
  fiction with test coverage.
- **C-8 — `test/helpers/local-convex.ts` silent-skip gate.** Without
  `CONVEX_URL`/`CONVEX_E2E_AUTO_START`, e2e suites skip immediately — by
  design locally, catastrophic in CI (a green lane that ran nothing).
  L-3's executed-count assertion is the guard; keep it when touching the
  helper. Also: retain/release refcounting mirrors C-2 — a leaked handle
  keeps `convex dev` alive and hangs the CI job until timeout.
- **C-9 — `sh -c '! rg …'` inversion (verified live).** Only rg exit 1 may
  pass. Exit 2 (bad pattern after an edit!) and 127 (no rg) currently pass
  vacuously — a syntax typo in one of these ~9 patterns disables that guard
  forever with no signal. H-1's wrapper is the fix; never add a new bare
  `! rg` script.
- **C-10 — Packaging triple agreement.** `package.json` `exports` +
  `typesVersions` + what `nuxt-module-build` actually emits to `dist/` must
  agree; `check:package-exports` checks the map, but only consumer-smoke
  proves resolution from outside (its `node -e "import(...)"` step is the
  real test — workspace `node_modules` hides missing-file bugs). New
  subpath ⇒ all three updated + consumer-smoke green in the same PR.
- **C-11 — `edge-runtime` VM for the `convex` project.** `convex-test`
  runs backend code in an edge VM to approximate the Convex runtime.
  Node-only APIs added to `playground/convex` code pass in dev tooling and
  explode only in this project (or worse, only in production Convex).
  Don't "fix" such a failure by moving the test to the node environment —
  the environment mismatch IS the finding.
- **C-12 — Serial e2e + shared local backend.** The e2e project is serial
  and all files share one `convex dev` instance with mutable data. Until
  L-6 lands, isolation is by convention (per-test data namespacing) — a
  test that writes without namespacing flakes *other* files
  non-deterministically. After L-6, `clearAll` runs between files, but two
  hazards remain: `clearAll` itself must be impossible outside `IS_TEST`
  (it deletes every table), and within-file tests still rely on
  namespacing. Any new e2e file copies the pattern of
  `realtime-subscription`.
- **C-13 — The ledger must not perturb what it measures.** Two failure
  directions: observer effect (an `await`, a network call, or heavy
  serialization on the hot path changes the very timing the S-5 tests
  probe — record synchronously into arrays, serialize only when a test
  reads the ledger) and shipping (instrumentation in `dist/` is dead
  weight and an information leak — the I-1 packaging grep is mandatory,
  release-blocking). Third, subtler: a recorder bug that silently drops
  records turns every invariant false-green, which is why the recorder has
  its own unit tests against scripted sequences.
- **C-14 — Matrix cells must be individually attributable.** A runner that
  loops cells inside one `it()` turns "cell `server=1 lazy=0 auth=auto
  nav=client` broke" into "the matrix broke", invites a blanket skip, and
  hides partial regressions. One dynamically registered test per cell
  (R-15), named by its dimensions; skipped cells are counted with an
  L-3-style anti-skip cap so exclusion rules can't quietly eat the matrix.
- **C-15 — Ledger invariant numbers encode design decisions.** `ssrQueries:
  1` and `tokenExchanges: 1` are not arbitrary expectations — they ARE the
  contract (F-13 etc.). When such an assertion fails after a refactor, the
  fix is never to bump the expected count to make it pass; that's the
  moment the harness is paying for itself. Changing a count requires the
  same rigor as changing a public API: a ruling, a changelog note, and a
  §9 entry.

---

## 8. Wall-time budgets (fill in H-5)

| Lane | Baseline | Ceiling | Action on breach |
|---|---|---|---|
| T-fast (unit+convex+nuxt) | _record_ | 2 min | split/trim slowest files |
| T-pr `test` job | _record_ | 15 min | move newest check to T-live |
| T-live (bootstrap + e2e + matrix) | _record_ | 25 min | trim matrix cells before scenarios, never add retries |
| T-canary per leg | _record_ | 30 min | reduce leg contents, keep matrix |

---

## 9. Status Log (append-only)

> Format: `- YYYY-MM-DD — [TH-task] summary; gates: …; proofs: …; deviations: …`

- 2026-07-09 — RFC drafted from verified repo state. Confirmed live:
  release script omits `test:e2e`; `! rg` inversion passes on rg exit
  2/127; demo pins better-convex-nuxt@0.4.0 against repo 0.5.0. No tasks
  executed yet.
- 2026-07-09 — Major revision after research + operation-sequence
  analysis: added third pillar (operation ledger, Phase I) and
  behavior-mode matrix (Phase B) — the direct answer to
  client/server × blocking/lazy coverage; added timing-injection S-5,
  optimistic-rollback S-6, `clearAll` isolation L-6, F-## traceability
  H-6; rulings R-11–R-15; cornerstones C-13–C-15; gap #9 recorded.
  Research confirmed (§1.3): non-interactive `npx convex` auto-provisions
  an anonymous local deployment (CLI-first bootstrap is viable in CI;
  Docker fallback stands), Convex-team clearAll isolation pattern adopted,
  local OSS backend cannot mock time/randomness (R-14).

## 10. Definition of Done

- [ ] H: rg wrapper with three-way proof; positive controls + meta-check; flake ledger; escalation ladder; F-## traceability check in check:contracts; budgets baselined
- [ ] L: non-interactive bootstrap green on a hosted runner; nightly+main lane live; anti-skip assertion proven both directions; release script runs T-live; `clearAll` isolation with IS_TEST guard proof; graduation ledger started
- [ ] I: operation ledger recording server+client operations; recorder unit-tested; dist-exclusion check in check:contracts; the three retrofit invariants (one exchange, zero refetch, zero net subscriptions) proven both directions
- [ ] B: mode dimensions encoded from the real option types; one named test per cell; full matrix green in T-live within budget; soak cell catches a deliberately leaked subscription; three representative both-directions proofs recorded
- [ ] M: conformance scenarios green under BOTH drivers; divergence protocol documented; mock header rule in place
- [ ] S: cache-safety, cross-session isolation, token races, SSR-honesty, the three timing-injection scenarios, and optimistic rollback green with recorded both-directions proofs
- [ ] D: attribution canary dispatched green; per-dep issue path proven; convex-internal tripwires with committed wire fixtures; demo drift check red→green
- [ ] R-1 graduation decision recorded (promoted subset, or explicit stay-on-release-gate)
- [ ] §8 budgets hold on the final full run
