# Remediation Round 2 — Post-Review Consolidated Plan

Date: 2026-07-08 · Base: `audit-remediation` @ `050c7941`
Input: 4 independent final reviews (2× ship-with-fixes, 2× do-not-ship). All were
cross-verified against the code before inclusion here. **No hallucinations found
in the load-bearing set** — every claim checked against source was accurate. The
verdict split is framing, not substance: the same P1 cluster appears in all four.

---

## 1. Verification matrix

Legend: ✅ verified directly against HEAD in this session · 🔶 plausible
(single-review, precise, low verification cost — verify while fixing) ·
❌ refuted/downgraded.

### Cluster A — sign-out lifecycle (P1, merge-blocking)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| A1 | F-3 "Part A" drop is dead code: guard requires `prev.pendingReason === 'none'` but engine sets `pending=true` first, so real sign-out is `none → auth-pending → auth-signed-out` | ✅ | `useConvexQuery.ts:598`; `client-engine.ts:505`; `query-execution-gate.ts:39-46` |
| A2 | `keepPreviousData` resurrection: Part-B `clearNuxtData` re-runs the asyncData default factory, which returns `lastSettledRawData` (never cleared, per A1); exposed `data` computed has no signed-out gate → prior user's rows visible after sign-out | ✅ | `useConvexQuery.ts:426-429`, `685-688`; `client-engine.ts:537` |
| A3 | Paginated key-namespace mismatch: payload keys `convex-paginated:…` vs subscription keys `paginated:convex:…` → `liveKeys` never spares a paginated payload; public paginated data always purged on sign-out | ✅ | `useConvexPaginatedQuery.ts:339` vs `:350`; `client-engine.ts:536-537` |
| A4 | Purge sweep over-broad: `key.startsWith('convex') && !liveKeys.has(key)` also purges public `subscribe:false` plain queries (no sub entry) and any unrelated app asyncData key starting with `convex` | ✅ | `client-engine.ts:537` |
| A5 | Auth-mode-blind cache key: `getQueryKey` has no auth dimension; `acquireQuerySubscription` ignores `meta.authMode` for existing entries; `clearAuthSubscriptions` keys teardown on `entry.authMode` → mixed-mode aliasing (frozen public query / stale refcount / spared private payload) | ✅ | `convex-shared.ts:281-287`; `convex-cache.ts:201-219`, `351-358` |
| A6 | Generation-skip race (pre-existing, but F-3 inherits it): entire teardown incl. purge gated on `isActiveGeneration`; a concurrent `refreshAuth()` bumps the generation and short-circuits on `if (state.token.value) return` → prior user's JWT survives, purge skipped | ✅ | `client-engine.ts:520-538`, `:565`, `:583` |
| A7 | Failed sign-out: `clearAuthSubscriptions` runs *before* `authClient.signOut()` (line 509 vs 512); on upstream failure token/user retained but subscriptions torn down. Plain queries likely re-subscribe via the pending-pulse watcher — **unproven either way**; paginated path wipes pages | 🔶 | `client-engine.ts:508-518`, `543-554` — settle with a test |

### Cluster B — paginated refresh (P1/P2)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| B1 | `refresh()` vs `loadMore()` race drops a page: refresh snapshots `pages` at :838, commits stale array at :875; `loadMore` appends at :409 and never checks `isManualRefreshPending` (set at :833, checked nowhere). One review had a failing repro test | ✅ | `useConvexPaginatedQuery.ts:838`, `875`, `393-431`, `833` |
| B2 | `subscribe:true` (the default) undermines F-26b: committed pages spread `...page` keeps old per-page subscriptions bound to stale cursors; no re-bind after commit; JSDoc advertises "force-refresh with subscriptions"; the F-26b test only covers `subscribe:false` | ✅ | `useConvexPaginatedQuery.ts:863-869`; `config-defaults.ts:46`; test at `useConvexPaginatedQuery.nuxt.test.ts:448` |
| B3 | `refresh()` catch sets `globalError` unconditionally (not gated on `paginationId` like the success path) and skips `handleUnauthorizedAuthFailure` (which initial-load and `loadMore` both use) | ✅ | `useConvexPaginatedQuery.ts:879-880` vs `:440`, `:585` |
| B4 | Any `refreshAuth()` pending pulse collapses a paginated query to page 1 (watcher tears down all subscriptions, empties pages, refreshes only first page) | 🔶 | `useConvexPaginatedQuery.ts:786-819` — settle with a test |

### Cluster C — test integrity (P2)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| C1 | F-2 regression test calls `clearAuthSubscriptions(nuxtApp)` directly; **the full 488-test suite stays green with the engine reverted to the blanket `clearSubscriptionCache`** (independently reproduced by 3 reviews) | ✅ | `useConvexQuery.signout-public.nuxt.test.ts:55` |
| C2 | F-3 tests manufacture a transition production never produces (`convex:pending` frozen `false`, token poked directly → `none → auth-signed-out` jump) — green tests hide A1 | ✅ | `useConvexQuery.signout-purge.nuxt.test.ts:68-95` |
| C3 | F-1 primary gate unpinned: reverting only the `setupSubscription` gate stays green (redundant invariant throw catches it); test fails only when all 3 layers reverted (verified by 2 reviews via revert-tests) | ✅ (by reviews) | `useConvexQuery.ts:280-284`, `606` |
| C4 | `playground/convex/posts.ts` (7 endpoints with auth/ownership logic) and `checkPermission` have **zero** coverage after their test files (65 tests) were deleted; the log's "every deletion is a test of deleted code" claim is false. `files.test.ts`/`notes.test.ts` exist; no `posts.test.ts` | ✅ | `rg api.posts` in tests → nothing |
| C5 | F-5 consumer-smoke fixture hand-writes `args: Record<string, never>` — stricter than real codegen's `{}` — so the contract suite can't catch `{}`-world relaxations; log's "verified against real generated types" is inaccurate | 🔶 | `test/fixtures/consumer-smoke/convex/_generated/api.d.ts` |

### Cluster D — security surfaces (P2/P3, bounded)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| D1 | `/api/auth/convex/token` (and `/get-session`) proxied responses carry no forced `Cache-Control: private, no-store` — only upstream headers are forwarded; the SSR-HTML no-store (`plugin.server.ts:172`) doesn't cover this JWT-bearing endpoint | ✅ | `[...].ts:203-218` (header forwarding, no cache directive) |
| D2 | F-28 sign-out cache-clear: exact-match `normalizedPath === '/sign-out'` (no trailing-slash normalization; `revoke-session` etc. not detected); clear runs *after* the upstream round-trip → repopulation window ≤ authCache TTL | ✅ | `[...].ts:75`, `:181-188` |
| D3 | F-27 cross-origin canonical redirect strips only `cookie`, not `authorization`; foreign `Set-Cookie` forwarded unfiltered | 🔶 (2 reviews concur) | `redirect-utils.ts:52-59`; `headers.ts:5-15` |
| D4 | F-10 doc recommends `skipAuthRoutes` as cache safe-harbor, but it's client-only; `plugin.server` hydrates the JWT regardless | 🔶 | `authentication.md:57`; `plugin.client.ts:141` |

### Cluster E — docs & consistency (P2/P3)

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| E1 | Permissions doc `findMany` snippet omits **required** `paginationOpts` (→ runtime `ArgumentValidationError`) and iterates a `PaginationResult` as an array | ✅ | `2.permissions.md:316-320` |
| E2 | `can()` returns `ComputedRef<boolean>`; docs *explicitly claim* "Vue automatically unwraps it in templates" (false for call-expression results) and use bare `v-if="can(...)"` throughout, plus the module's own JSDoc → every documented gate is always-true | ✅ | `2.permissions.md:109`; `usePermissions.ts:83`, `:150`; bare usages across 2+ doc pages |
| E3 | Documented backend/frontend pair mistypes `PermissionContext.role` (`Role` vs returned `string`) → TS2322 | 🔶 (review ran tsc probe) | `2.permissions.md` snippets |
| E4 | `authentication.md` still teaches app-owned authoritative roles: table row "`users.role`, `users.organizationId` → Authoritative permissions/business data" + "store authoritative roles/org membership in Convex tables" — contradicts the F-6/F-29 rewrite; the `check:no-app-owned-org-docs` guard (two-literal grep) misses it | ✅ | `1.authentication.md:1030-1041`; `package.json:85` |
| E5 | `demo/convex/schema.ts` still defines `roleValidator` + `users.role` — the F-29 anti-pattern, not in the declared deferral bucket | ✅ | `demo/convex/schema.ts:4,18` |
| E6 | F-17 drift batch: `normalizeAuthRoute` hardcodes `'/api/auth'` (✅ `convex-config.ts:90-93`); `useConvexUser` hardcodes `subscribe: true`; `server/utils/convex.ts` hardcodes `'auto'`; `waitTimeoutMs` comment wrong + undocumented; F-16 doc sentence stale; F-36 optional `enabled` footgun (`authCache:{ttl:30}` silently disabled) | ✅/🔶 | batch-verify while fixing |

### Refuted / downgraded

| Claim | Verdict |
|-------|---------|
| "saveFile needs an upload-intent nonce" (review 4, HYPOTHESIS) | ❌ By-design capability model; two reviews verified the guard OCC-safe. Action: document the model explicitly, no code change. |
| "authentication.md verified clean" (review 2's docs agent) | ❌ Wrong — E4 exists. Reminder that agent sign-off ≠ verification. |
| "Deleted-test audit came up clean" (review 2) | ❌ Too narrow — it checked deleted files covered deleted code, not whether surviving code lost coverage (C4). |
| "Failed sign-out freezes auth queries" as P1 (review 4) | ⬇️ Downgraded to A7/🔶 — teardown-before-network is real, but plain queries plausibly re-subscribe via the pending-pulse watcher. Needs a test, not a presumed P1. |

---

## 2. Strategy

Principles, learned from how these bugs slipped through the first remediation:

1. **Tests must drive real entry points.** Every lifecycle regression test in this
   round drives `engine.signOut()` / `refreshAuth()` / `refresh()` end-to-end —
   never a helper in isolation, never hand-poked state (`token.value = null`).
2. **Restore-and-retest is mandatory per fix.** A fix is not done until reverting
   it (alone) makes at least one test fail. C1/C2/C3 exist because this wasn't
   enforced per-layer.
3. **Unify, don't patch.** A3/A4/A5 are three symptoms of one design flaw: the
   subscription cache and the asyncData payload store use different key spaces
   and the key lacks the auth dimension. Fix the model once (Phase 1 design),
   not three call sites.
4. **Greenfield = fix the API, not the docs around it.** E2's `can()` returning a
   `ComputedRef` that every consumer must `.value` in templates is a footgun; we
   change the API rather than sprinkle `.value` through four doc pages.
5. **The progress log must be true.** Fix the false claims in
   `refactor-progress.md` (C4, "verified clean") as part of this round.

### Design decisions (recommendations — flag disagreement before Phase 1 lands)

| Decision | Recommendation | Rationale |
|----------|----------------|-----------|
| Cache-key auth dimension (A5) | Append `:${authMode}` to the subscription cache key | Cheapest correct fix; cross-mode consumers get separate entries; teardown by `authMode` becomes structurally sound. Payload keys stay unchanged (payload is auth-agnostic content, keyed per-consumer already). |
| Live-key bookkeeping (A3/A4) | Each subscription entry stores its **payload asyncData key(s)** (`payloadKeys: Set<string>`); purge = clear keys whose owning entries are auth-carrying, plus orphaned `convex*` keys **matching our own prefixes only** (`convex:`/`convex-paginated:`) | Kills the namespace mismatch and the over-broad sweep in one move; no more fragile prefix reasoning at the purge site. |
| Sign-out teardown vs generation (A6) | Identity clearing (`token=null`, `user=null`, `setAuth(null)`, purge) runs **unconditionally** once upstream sign-out succeeds; only UI-state writes (`pending`, `authError`) stay generation-gated. `refreshAuth` drops the `if (state.token.value) return` short-circuit in favor of forcing a fresh exchange after a sign-out marker | The upstream session *is* revoked — local state must follow regardless of racing operations. |
| Failed sign-out (A7) | Move `clearAuthSubscriptions` to *after* upstream success (keep the `nextTick` before purge) | Simpler than rebuild-on-failure; pre-clearing bought nothing except the failure window. Test both outcomes. |
| `loadMore` during `refresh` (B1) | `loadMore` no-ops while `isManualRefreshPending` (documented); refresh re-reads `pages.value` at commit and aborts+retries once if it changed | Belt and suspenders; the no-op alone closes the loss, the commit check catches future callers. |
| `refresh()` under `subscribe:true` (B2) | Re-bind each page's subscription to its fresh cursor inside the atomic commit (unsubscribe old, start new per changed cursor) | Keeps the advertised semantics; a no-op would silently diverge from the paginated JSDoc and from user expectations after gap events. Fallback if re-bind proves hairy: no-op + JSDoc/doc correction, explicitly logged. |
| `can()` API (E2) | Change `can()` to return **plain `boolean`**, computed at call time from reactive state (render-tracked, so templates stay reactive). Keep a `canRef()` escape hatch if a stored ref is wanted | Greenfield; makes every existing doc snippet *correct as written*; removes the always-truthy footgun class entirely. |
| `authCache.enabled` optional (F-36/E6) | Keep optional, add a build-time warning when `authCache` is configured with `enabled` unset | Preserves ergonomics, kills the silent-disable footgun. |

---

## 3. Execution plan

Each phase = fix → regression tests that **fail on lone revert** → gate
(`pnpm lint && pnpm format:check && pnpm test:types && pnpm test && pnpm check:contracts`).
`prepack` + `check-package-exports --dist` at Phases 1, 2, and 6. Never run
`check:contracts` and `prepack` concurrently (they race over `dist/`).

### Phase 1 — Sign-out lifecycle (A1–A7) · blocks everything

1. `useConvexQuery.ts:598` — guard becomes
   `next.pendingReason === 'auth-signed-out' && prev.pendingReason !== 'auth-signed-out'`.
2. Default factory (`:426`) refuses `lastSettledRawData` when the gate is
   `auth-signed-out` (second layer for A2).
3. Subscription cache redesign per decisions: `authMode` in key; entries carry
   `payloadKeys`; purge rewritten to use them; scope sweep to module prefixes.
4. Engine: unconditional identity clear on successful sign-out; move
   `clearAuthSubscriptions` after upstream success; `refreshAuth` forced-exchange
   after sign-out marker.
5. **Tests (nuxt-tier, driving `engine.signOut()` end-to-end):**
   - public plain query survives + keeps streaming (kills C1 — must fail when
     engine reverts to blanket clear);
   - public paginated query payload survives (pins A3);
   - private plain query purged; private `keepPreviousData` query **blanks**
     (pins A1+A2 — must fail with the old `prev === 'none'` guard);
   - public `subscribe:false` plain query payload survives (pins A4);
   - mixed-mode same-fn+args: public consumer unaffected by sign-out (pins A5);
   - sign-out raced with `refreshAuth`: token/user cleared regardless (pins A6);
   - failed upstream sign-out: state coherent, queries still live (settles A7).
6. Rewrite `signout-purge` / `signout-public` tests to real entry points; delete
   the manufactured-transition variants.

### Phase 2 — Paginated refresh (B1–B4)

1. Reentrancy guard on `refresh()` (generation token); `catch` gated on the same
   `paginationId` as the success path; route errors through
   `handleUnauthorizedAuthFailure`.
2. `loadMore` no-op during `isManualRefreshPending` + commit-time `pages` check.
3. Subscription re-bind on cursor change inside the atomic commit (B2).
4. Investigate B4 (auth-refresh page collapse) with a test; fix by preserving/
   re-chaining loaded pages across an `auth-pending → none` flap if confirmed.
5. **Tests:** F-26b under `subscribe:true` (default!); loadMore-during-refresh
   keeps the appended page; concurrent double-refresh single-commit; refresh 401
   triggers unauthorized recovery; refreshAuth preserves page depth.

### Phase 3 — Test integrity (C3–C5)

1. F-1: per-layer tests — one isolating the `setupSubscription` gate (invariant
   throw disabled via test seam or targeted assertion on the gate call), so a
   lone revert of the primary gate fails.
2. New `playground/convex/posts.test.ts` covering the rewritten ownership model:
   auth-denial, ownership isolation, `ConvexError({code})` shapes, plus
   `checkPermission` parsing (C4).
3. F-5 fixture: regenerate as codegen-faithful (`args: {}`), add the
   options-in-args-slot paginated contract; keep the required-side
   `@ts-expect-error` contracts (C5).

### Phase 4 — Security surfaces (D1–D4)

1. Proxy: force `Cache-Control: private, no-store` on `/convex/token` and
   `/get-session` responses; unit test the exact endpoint (D1).
2. F-28: run `normalizedPath` through trailing-slash normalization before the
   sign-out check; extend detection to `revoke-session`/`revoke-other-sessions`;
   document the residual concurrent-window (≤ TTL) honestly in
   `7.module-config.md` (D2).
3. F-27: strip `authorization` alongside `cookie` on cross-origin hops; drop
   foreign-origin `Set-Cookie` forwarding (D3).
4. F-10 doc: state that `skipAuthRoutes` is client-only and does not prevent
   SSR token hydration (D4).

### Phase 5 — API & docs (E1–E6)

1. `can()` → plain boolean per decision; update `usePermissions` JSDoc; delete
   the auto-unwrap callouts; docs snippets now correct as written (E2).
2. `2.permissions.md`: add `paginationOpts` + read `.page` (E1); align
   `PermissionContext.role` typing (E3) — compile every snippet pair via the
   existing docs-snippet check if present, else add one.
3. Rewrite the `authentication.md` layered-fields table/section to route
   authoritative roles/orgs through Better Auth Organization (E4); broaden
   `check:no-app-owned-org-docs` to catch `users.role`, `users.organizationId`,
   and "authoritative role/org" prose, and run it over `docs/`, `demo/`,
   `playground/` (E4/E5 guard).
4. `demo/convex/schema.ts`: migrate the role column to the Better Auth org
   model, or add it to the declared deferral bucket with rationale (E5).
5. F-17 batch: `normalizeAuthRoute` reads `CONVEX_MODULE_DEFAULTS.authRoute`;
   `useConvexUser`/`server/utils/convex.ts` read defaults; fix `waitTimeoutMs`
   comment + document in `7.module-config.md`; fix the F-16 stale sentence;
   authCache `enabled`-unset build warning (E6). Document the saveFile
   capability model (refuted-claim action).

### Phase 6 — Honesty & final gates

1. Correct `refactor-progress.md`: the deleted-test reconciliation (C4), the
   "verified clean" docs claim, and the F-26b/F-2 test-coverage claims.
2. Full gate + `prepack` + `check-package-exports --dist`.
3. **Restore-and-retest sweep:** for every fix in Phases 1–4, revert it alone
   and confirm ≥1 test fails; record the matrix in the progress log.
4. E2E (`pnpm test:e2e`) against a live deployment if credentials are available;
   at minimum, manually drive sign-in → keepPreviousData query → sign-out in the
   playground and record the observation.

---

## 4. Out of scope (explicitly deferred, with reasons)

- Starters org-model rebase (pre-existing deferral items 1–2, honestly labeled).
- Playground stale `_generated/api.d.ts` (deferral item 4).
- Nitro ISR/route-rule caching interactions (platform-level, documented in D4's
  doc note instead).
- Upload-intent binding for `saveFile` (by-design capability model — Phase 5
  documents it).
