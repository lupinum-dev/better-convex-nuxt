# refactor-progress.md — Audit Remediation Log

Branch: `audit-remediation` (note: plan said `refactor/audit-remediation`; a pre-existing `refactor` branch blocks that namespace).
Coordinator/reviewer: Fable. Workers: Opus (heavy), Sonnet (straightforward).

## Baseline (Phase 0)

- Base commit: `e9969f90` (main + audit report + plan).
- `pnpm test`: **510/510 passed** (unit+convex+nuxt+browser).
- `pnpm test:types`: pass. `pnpm check:contracts`: pass (verified during audit, same tree).

## Task log

| Task               | Status | Commit   | Evidence                                                                                       |
| ------------------ | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| P0.1 baseline      | DONE   | —        | 510/510 green on branch                                                                        |
| P0.2 format (F-41) | DONE   | 7f684af7 | `pnpm format:check` clean (662 files); tests+types green after                                 |
| P1.1 gate (F-1)    | DONE   | a18c9e82 | new `useConvexQuery.auth-gate` test green; query suites+types green                            |
| P1.2 clear (F-2)   | DONE   | b5dfec76 | new `useConvexQuery.signout-public` test green; client-auth-engine+paginated+types green       |
| P1.3 purge (F-3)   | DONE   | 16ddf05b | new `useConvexQuery.signout-purge` test (Part A + Part B) green; full unit+nuxt 418 green      |
| P1.4 scope (F-4)   | DONE   | 8706fe97 | new two-consumer unmount-lifecycle test green (verified it fails without the fix); types green |

## Phase 1 gate

- `pnpm test`: **515 passed / 515** (68 files). Baseline 510 + 5 new regression tests (F-1 ×1, F-2 ×1, F-3 ×2, F-4 ×1).
- `pnpm test:types`: pass. No `as any`/`: any`/`@ts-ignore` added in `src/`.
- `pnpm check:contracts`: all sub-checks pass EXCEPT `check:api-surface-docs`, which is **pre-existing and unrelated to Phase 1** (see Deviations). package-exports, workspace-deps, consumer-smoke, missing-convex-api, better-auth-local-component all green.

## Review log (coordinator)

- Phase 0: trivial, self-executed. No review needed.
- **Phase 1 review: APPROVED with one coordinator fix.** Read the full diff of all 4 commits. Source changes match the cornerstones exactly (the large useConvexQuery.ts hunk is indentation from the added `{ authMode }` argument). All 5 regression tests exercise the real bug conditions (module auth enabled + `auth:'auto'`; F-4 test models true multi-consumer unmount and was verified to fail on the reverted impl). The two existing-test corrections were legitimate — both had pinned the F-1 bug. The `#app` unit shim + vitest alias is accepted (mirrors the existing browser-tier `#imports` shim; real behavior covered in nuxt tier). Independently re-ran the gate: 515/515, types green.
  - Coordinator fix: `check:api-surface-docs` was red at baseline because P0.2's oxfmt reformatted the generator-owned doc. Resolution: the generator owns that file's bytes — added `docs/content/docs/6.advanced/8.api-surface.md` to `.oxfmtrc.json` ignorePatterns and regenerated. `generate-api-surface --check`, `format:check`, and full `check:contracts` all green now.
  - Noted (not blocking): F-3 Part B test replicates the sign-out clearing sequence inline rather than driving `engine.signOut` (which needs authClient mocking). Acceptable; if the engine sequence ever drifts from the test, the F-3 nuxt test won't catch it — the unit-tier client-auth-engine tests still pin the engine path.
  - Noted for later: sign-in transition does a release-then-reacquire churn on the same key (pre-existing, net one subscription). Harmless; revisit only if it causes flicker reports.

## Deviations

- Branch name `audit-remediation` instead of `refactor/audit-remediation` (ref conflict with existing `refactor` branch).
- **P1.1 cornerstone Edit B (throw invariant) is placed inside `acquireSharedSubscriptionBridge` after the `convex` null check, exactly as written.** The two watchers are kept (not deduplicated) per the cornerstone's explicit warning.
- **P1.1 sign-in assertion (F-1 test):** used `convex.activeListenerCount(query,{}) === 1` (net live subscription under the real args key) rather than raw cumulative `onUpdate` count. On the signed-out→signed-in transition the asyncData key-change re-fetch races the `pendingReason` watcher, so the same key is released and re-acquired (net one subscription, one active listener). This churn is pre-existing and independent of the fix; the cornerstone forbids touching the watchers to remove it. The signed-out assertion still uses cumulative `onUpdate === 0` (meaningful: nothing subscribes at all).
- **P1.2 sanctioned test change NOT needed:** `test/unit/client-auth-engine.test.ts` "clears shared query subscriptions before signOut" registers its subscription with the default `authMode: 'auto'`, so `clearAuthSubscriptions` still tears it down — the test passes unchanged. No "everything cleared → public survives" rewrite was required there; public-survival is covered by the new nuxt-tier F-2 test.
- **P1.3 `clearNuxtData` import + unit shim:** the cornerstone assumed `client-engine.ts` already imports Nuxt composables; it did not (only `vue` + relative), which kept it unit-testable. Added `import { clearNuxtData } from '#app'` (client-only signOut path). To keep the node/unit tier resolving, added `test/unit/shims/app.ts` (no-op `clearNuxtData`) + a `#app` alias in the unit vitest project (mirrors the existing browser-tier `#imports` shim). Real payload-purge behavior is covered in the nuxt tier.
- **P1.3 folded-in F-1 test corrections:** `test/nuxt/usePermissions.nuxt.test.ts` ("derives auth context…") and `test/nuxt/defineSharedConvexQuery.nuxt.test.ts` ("returns one shared query state…") both PINNED the F-1 bug — with module auth enabled and no token, their `auth:'auto'` queries used to subscribe while signed-out. Post-fix they correctly stay idle. Corrected each test's setup to sign in (`convex:pending=false`, `convex:token` set) — the only state where a private query legitimately subscribes. Assertions unchanged. These corrections landed in the P1.3 commit (P1.1 was already committed under P1.2, so amend was not clean); they are F-1 consequences, not P1.3 logic.
- **P1.4 test harness:** the two-consumer lifecycle test needs two independent component scopes sharing one nuxt app (single-setup `captureInNuxt` cannot model independent unmount). Wired the mock client + signed-in state via one `captureInNuxt` call (it owns the swappable `$convex` proxy target; the nuxt env reuses one app across mounts), then a second `mountSuspended` renders parent → ChildA (first consumer) + ChildB. Unmounting ChildA and asserting ChildB still receives emissions. Verified the test fails on a reverted (component-scope) implementation.
- **PRE-EXISTING, NOT PHASE 1 — `check:api-surface-docs` is red.** `docs/content/docs/6.advanced/8.api-surface.md` fails `node scripts/generate-api-surface.mjs --check`. This is a **baseline** condition: the committed doc also fails `--check` at `fdc081c4` (verified by stash+checkout). Cause: P0.2's oxfmt reformatted the doc (collapsed table padding, removed blank lines) while the generator emits table-aligned Markdown, so they no longer byte-match. The diff is **pure formatting — zero content/surface change** (symbol names/purposes identical). Phase 1 added no public API (`clearAuthSubscriptions` is an internal `convex-cache` util export, not in `module-api-surface.ts`). Left untouched: Phase 5 (F-8) regenerates this doc and the coordinator should decide whether the generator should emit oxfmt-formatted output. Regenerating now would revert the P0.2 formatting and risk `format:check`.
