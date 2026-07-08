# refactor-progress.md — Audit Remediation Log

Branch: `audit-remediation` (note: plan said `refactor/audit-remediation`; a pre-existing `refactor` branch blocks that namespace).
Coordinator/reviewer: Fable. Workers: Opus (heavy), Sonnet (straightforward).

## Baseline (Phase 0)

- Base commit: `e9969f90` (main + audit report + plan).
- `pnpm test`: **510/510 passed** (unit+convex+nuxt+browser).
- `pnpm test:types`: pass. `pnpm check:contracts`: pass (verified during audit, same tree).

## Task log

| Task               | Status | Commit   | Evidence                                                                                  |
| ------------------ | ------ | -------- | ----------------------------------------------------------------------------------------- |
| P0.1 baseline      | DONE   | —        | 510/510 green on branch                                                                   |
| P0.2 format (F-41) | DONE   | 7f684af7 | `pnpm format:check` clean (662 files); tests+types green after                            |
| P1.1 gate (F-1)    | DONE   | a18c9e82 | new `useConvexQuery.auth-gate` test green; query suites+types green                       |
| P1.2 clear (F-2)   | DONE   | b5dfec76 | new `useConvexQuery.signout-public` test green; client-auth-engine+paginated+types green  |
| P1.3 purge (F-3)   | DONE   | (this)   | new `useConvexQuery.signout-purge` test (Part A + Part B) green; full unit+nuxt 418 green |

## Review log (coordinator)

- Phase 0: trivial, self-executed. No review needed.

## Deviations

- Branch name `audit-remediation` instead of `refactor/audit-remediation` (ref conflict with existing `refactor` branch).
- **P1.1 cornerstone Edit B (throw invariant) is placed inside `acquireSharedSubscriptionBridge` after the `convex` null check, exactly as written.** The two watchers are kept (not deduplicated) per the cornerstone's explicit warning.
- **P1.1 sign-in assertion (F-1 test):** used `convex.activeListenerCount(query,{}) === 1` (net live subscription under the real args key) rather than raw cumulative `onUpdate` count. On the signed-out→signed-in transition the asyncData key-change re-fetch races the `pendingReason` watcher, so the same key is released and re-acquired (net one subscription, one active listener). This churn is pre-existing and independent of the fix; the cornerstone forbids touching the watchers to remove it. The signed-out assertion still uses cumulative `onUpdate === 0` (meaningful: nothing subscribes at all).
- **P1.2 sanctioned test change NOT needed:** `test/unit/client-auth-engine.test.ts` "clears shared query subscriptions before signOut" registers its subscription with the default `authMode: 'auto'`, so `clearAuthSubscriptions` still tears it down — the test passes unchanged. No "everything cleared → public survives" rewrite was required there; public-survival is covered by the new nuxt-tier F-2 test.
- **P1.3 `clearNuxtData` import + unit shim:** the cornerstone assumed `client-engine.ts` already imports Nuxt composables; it did not (only `vue` + relative), which kept it unit-testable. Added `import { clearNuxtData } from '#app'` (client-only signOut path). To keep the node/unit tier resolving, added `test/unit/shims/app.ts` (no-op `clearNuxtData`) + a `#app` alias in the unit vitest project (mirrors the existing browser-tier `#imports` shim). Real payload-purge behavior is covered in the nuxt tier.
- **P1.3 folded-in F-1 test corrections:** `test/nuxt/usePermissions.nuxt.test.ts` ("derives auth context…") and `test/nuxt/defineSharedConvexQuery.nuxt.test.ts` ("returns one shared query state…") both PINNED the F-1 bug — with module auth enabled and no token, their `auth:'auto'` queries used to subscribe while signed-out. Post-fix they correctly stay idle. Corrected each test's setup to sign in (`convex:pending=false`, `convex:token` set) — the only state where a private query legitimately subscribes. Assertions unchanged. These corrections landed in the P1.3 commit (P1.1 was already committed under P1.2, so amend was not clean); they are F-1 consequences, not P1.3 logic.
