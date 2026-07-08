# Remediation Round 2 — Autonomous Implementation Plan

> **Audience:** an AI coding agent executing this plan without human supervision.
> **Companion doc:** `remediation-round-2.md` (verification matrix + rationale). This
> file is the _how_; that file is the _why_. When in doubt about intent, read it.
> **Base:** branch `audit-remediation` @ `050c7941`. Work on a new branch
> `remediation-round-2` created from it.

---

## 0. Ground rules (read before touching anything)

1. **One TODO at a time, in order.** Phases are ordered by risk; TODOs within a
   phase are ordered by dependency. Do not parallelize edits to the same file.
2. **A fix is DONE only when its restore-and-retest passes** (§0.3). "Tests are
   green" is necessary, not sufficient.
3. **Never weaken a test to make a gate pass.** If a gate fails after your
   change, the change is wrong or incomplete. If you believe the _test_ is wrong,
   record it in `remediation-round-2-blockers.md` (create it) and stop that TODO.
4. **Tests drive real entry points.** Every new lifecycle test in this plan calls
   `engine.signOut()`, `refreshAuth()`, `refresh()`, `loadMore()` — never a
   private helper in isolation, never hand-poked state like `token.value = null`
   as a stand-in for sign-out. Existing tests that do this get rewritten, not
   imitated.
5. **Locked decisions (§2) are not up for re-litigation.** If a locked decision
   proves unimplementable after 2 honest attempts, write up why in the blockers
   file, mark the TODO `BLOCKED`, and continue with the next independent TODO.
6. **Commit per TODO** with message `fix(R2-<id>): <summary>` /
   `test(R2-<id>): …` / `docs(R2-<id>): …`. End every commit message with:
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
7. **Match project idioms.** New tests copy the structure of
   `test/nuxt/useConvexQuery.signout-public.nuxt.test.ts` (harness:
   `captureInNuxt` from `test/helpers/nuxt-runtime-harness.ts`, mock client:
   `MockConvexClient`/`mockFnRef` from `test/helpers/mock-convex-client.ts`).
   Convex backend tests copy `playground/convex/files.test.ts`.
8. **Track progress in this file**: change each TODO's checkbox to `[x]` when
   done, `[B]` when blocked. Append a one-line result under it (test names added,
   gate result).

### 0.1 Quality gates

Run after **every phase** (and the cheap subset — lint, affected tests — after
every TODO):

```bash
pnpm lint                 # guard scripts + eslint; expect exit 0
pnpm format:check         # oxfmt; expect clean
pnpm test:types           # vue-tsc --noEmit; expect exit 0
pnpm test                 # vitest unit+convex+nuxt+browser; expect 0 failures
pnpm check:contracts      # api-surface, package-exports, consumer-smoke, …
```

At the end of Phases 1, 2, and 6 additionally:

```bash
pnpm prepack
node scripts/check-package-exports.mjs --dist
```

**Hard constraint:** `pnpm check:contracts` and `pnpm prepack` both rebuild
`dist/` — NEVER run them concurrently. Run everything in this plan serially.

Baseline (before your first change) — record the numbers you get:
`pnpm test` currently passes 488 tests / 68 files. If your baseline differs,
stop and record it in the blockers file before proceeding.

`pnpm test:e2e` requires a live Convex deployment + `playground/.env.local`. If
those are absent, skip it and note the skip; do not try to fabricate an env.

### 0.2 Running a single test file

```bash
pnpm vitest run --project=nuxt test/nuxt/<file>.nuxt.test.ts
pnpm vitest run --project=unit test/unit/<file>.test.ts
pnpm vitest run --project=convex playground/convex/<file>.test.ts
```

### 0.3 Restore-and-retest protocol (per fix)

For every code fix in Phases 1–4:

1. Finish the fix and its tests; confirm the full relevant test project passes.
2. `git stash` nothing — instead revert **only that fix's hunks** (by hand-edit
   or `git diff | git apply -R` of the relevant hunks), keeping the new tests.
3. Run the new tests. **At least one must fail.** Record the failing test name
   next to the TODO.
4. Restore the fix (`git checkout -- <file>` won't work if you have other
   staged work — keep the working tree clean per TODO so `git checkout -- .`
   restores safely, or re-apply the hunks).
5. `git status` must be clean-except-intended before the commit.

If step 3 shows all-green: the test does not pin the fix. Fix the test, not the
code. This exact failure mode shipped bugs F-2/F-3 in round 1 — it is the
number-one thing this round exists to prevent.

---

## 1. Context: the codebase in 10 lines

- Nuxt module wrapping Convex + Better Auth. Source in `src/runtime/`.
- Plain queries: `src/runtime/composables/useConvexQuery.ts`
  (`createConvexQueryState` is the testable factory). Paginated:
  `useConvexPaginatedQuery.ts`. Auth engine:
  `src/runtime/auth/client-engine.ts` (`createConvexAuthEngine`).
- Gate logic: `src/runtime/utils/query-execution-gate.ts` — pure function
  mapping auth state → `pendingReason: 'none' | 'explicit-skip' |
'auth-pending' | 'auth-signed-out'`. **Sign-out always passes through
  `auth-pending`** because the engine sets `state.pending = true` first.
- Subscription dedup cache: `src/runtime/utils/convex-cache.ts` —
  `Map<string, SubscriptionEntry>` per NuxtApp, refcounted,
  `entry.authMode: 'auto' | 'none'`.
- Query payloads live in Nuxt `useAsyncData` state. Plain payload key =
  `getQueryKey(query, args)` = `convex:<fn>:<argsHash>`. Paginated payload key
  = `convex-paginated:<getQueryKey(...)>`; paginated _subscription_ keys =
  `paginated:<getQueryKey(...)>` (note: different namespace — this mismatch is
  bug A3).
- Auth proxy (server): `src/runtime/server/api/auth/[...].ts` + helpers
  `redirect-utils.ts`, `headers.ts`.
- Docs: `docs/content/docs/**`. Playground (test app): `playground/`. Demo:
  `demo/`.

---

## 2. Locked decisions

| ID    | Decision                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LD-1  | Subscription cache keys gain an auth dimension via helper `withAuthDimension(key, authMode)` → `` `${key}::auth-${authMode}` ``. Payload (asyncData) keys are **unchanged**.                                                                                                                                                                                       |
| LD-2  | A new per-NuxtApp **payload-key registry** maps each _active_ query's payload key → per-authMode refcounts. The sign-out purge consults it instead of prefix-guessing. Purge rule: clear a `convex:`/`convex-paginated:`-prefixed key iff (registered with any `auto` consumer) OR (not registered at all). Keys registered only by `none` consumers survive.      |
| LD-3  | `signOut()` and `refreshAuth()` are **serialized**: each awaits the other's in-flight promise before starting. After upstream sign-out succeeds, identity clearing (token, user, `setAuth(null)`, subscription clear, payload purge) runs **unconditionally** (no `isActiveGeneration` gate). Only cosmetic state (`pending`, `authError`) stays generation-gated. |
| LD-4  | `clearAuthSubscriptions` moves to **after** upstream sign-out success (no more pre-clearing before the network call).                                                                                                                                                                                                                                              |
| LD-5  | `loadMore()` no-ops while `isManualRefreshPending` is true. `refresh()` additionally verifies at commit time that `pages.value.length` still equals its snapshot length; on mismatch it aborts the commit (logs in dev).                                                                                                                                           |
| LD-6  | `refresh()` under `subscribe: true` re-binds page subscriptions: after the atomic commit, call `startPageSubscription(i)` for every page index ≥ 1 whose cursor changed (`startPageSubscription` already unsubscribes the old one first). Page 0 keeps its stable first-page subscription (cursor is always `null`).                                               |
| LD-7  | `can()` returns **plain `boolean`** (evaluated per call against reactive state — Vue render tracking keeps templates reactive). The `ComputedRef` return is removed, not aliased. Docs then become correct as written.                                                                                                                                             |
| LD-8  | The F-5 consumer-smoke fixture becomes codegen-faithful (`args: {}` instead of `Record<string, never>` for arg-less functions). Contracts that only held in the stricter fake world are deleted with a comment naming the inherited convex-react typing hole.                                                                                                      |
| LD-9  | `saveFile`'s "first registration wins" capability model is by design. Document it; no code change.                                                                                                                                                                                                                                                                 |
| LD-10 | `authCache.enabled` stays optional; the module setup logs a warning when `authCache` is configured but `enabled` is unset.                                                                                                                                                                                                                                         |

---

## Phase 1 — Sign-out lifecycle (cross-account data exposure)

Everything else waits for this phase. Files:
`src/runtime/composables/useConvexQuery.ts`,
`src/runtime/composables/useConvexPaginatedQuery.ts`,
`src/runtime/utils/convex-cache.ts`,
`src/runtime/auth/client-engine.ts`, plus tests.

### TODO 1.1 — Fix the dead Part-A guard `[x]`

**File:** `src/runtime/composables/useConvexQuery.ts` (~line 598)

The watcher currently reads:

```ts
// Entering signed-out: drop this component's now-unauthorized data.
if (next.pendingReason === 'auth-signed-out' && prev.pendingReason === 'none') {
```

Real sign-out transitions `none → auth-pending → auth-signed-out` (the engine
sets `pending=true` before clearing the token — see
`client-engine.ts:505` and `query-execution-gate.ts:39-46`), so
`prev.pendingReason` is `'auth-pending'` and this branch **never fires**.

**Change to:**

```ts
// Entering signed-out from any prior state: drop this component's
// now-unauthorized data. Real sign-out arrives via 'auth-pending', so do NOT
// require prev === 'none' (that transition never occurs in production).
if (
  next.pendingReason === 'auth-signed-out' &&
  prev.pendingReason !== 'auth-signed-out'
) {
```

Result: fixed in `useConvexQuery.ts`; added a real pending-pulse
`keepPreviousData` regression. Restore-and-retest passed: reverting only this
guard fails `drops keepPreviousData component data through the real sign-out
pending pulse (Part A)`.

### TODO 1.2 — Gate the `keepPreviousData` default factory `[x]`

**File:** `src/runtime/composables/useConvexQuery.ts` (~line 426)

The asyncData `default` factory resurrects `lastSettledRawData` even when the
gate is signed-out — after the engine's `clearNuxtData` purge, Nuxt re-runs this
factory and writes the prior user's data straight back:

```ts
default: () => {
  if (keepPreviousData && lastSettledData.value !== null) {
    return lastSettledRawData.value
  }
  ...
```

**Change to:**

```ts
default: () => {
  if (
    keepPreviousData &&
    lastSettledData.value !== null &&
    // Never resurrect data across a signed-out boundary (F-3): the purge
    // re-runs this factory, and returning the last settled payload here
    // would hand the previous user's data to the signed-out view.
    executionGate.value.pendingReason !== 'auth-signed-out'
  ) {
    return lastSettledRawData.value
  }
  ...
```

(1.1 clears `lastSettledRawData` on the transition; 1.2 is the second layer for
any ordering where the factory runs before the watcher.)

Result: fixed in `useConvexQuery.ts`; added an HTTP-mode default-factory
regression. Restore-and-retest passed: reverting only this guard fails `does not
resurrect keepPreviousData when sign-out purge re-runs the default factory`.

### TODO 1.3 — Auth dimension in subscription keys + payload-key registry `[x]`

**File:** `src/runtime/utils/convex-cache.ts`

(a) Add and export:

```ts
/**
 * Subscription-cache keys carry the auth transport mode so the same
 * query+args used as auth:'auto' and auth:'none' never alias one refcounted
 * entry (mixed-mode aliasing froze public queries / spared private payloads).
 * Payload (asyncData) keys deliberately do NOT carry this dimension.
 */
export function withAuthDimension(key: string, authMode: 'auto' | 'none'): string {
  return `${key}::auth-${authMode}`
}
```

(b) Add the payload-key registry (same WeakMap-per-NuxtApp pattern as
`subscriptionRegistry`):

```ts
export interface PayloadKeyCounts {
  auto: number
  none: number
}

const payloadKeyRegistry = new WeakMap<object, Map<string, PayloadKeyCounts>>()

export function getPayloadKeyRegistry(owner: object): Map<string, PayloadKeyCounts> {
  let map = payloadKeyRegistry.get(owner)
  if (!map) {
    map = new Map()
    payloadKeyRegistry.set(owner, map)
  }
  return map
}

/** Register an active query's payload key. Returns an unregister function. */
export function registerPayloadKey(
  owner: object,
  key: string,
  authMode: 'auto' | 'none',
): () => void {
  const map = getPayloadKeyRegistry(owner)
  const counts = map.get(key) ?? { auto: 0, none: 0 }
  counts[authMode] += 1
  map.set(key, counts)
  let released = false
  return () => {
    if (released) return
    released = true
    const current = map.get(key)
    if (!current) return
    current[authMode] = Math.max(0, current[authMode] - 1)
    if (current.auto === 0 && current.none === 0) map.delete(key)
  }
}

/**
 * Payload keys that must SURVIVE the sign-out purge: registered, and consumed
 * exclusively by auth:'none' queries. Any 'auto' consumer means the cached
 * payload may contain private data -> purge it.
 */
export function getPublicOnlyPayloadKeys(owner: object): Set<string> {
  const keep = new Set<string>()
  for (const [key, counts] of getPayloadKeyRegistry(owner)) {
    if (counts.none > 0 && counts.auto === 0) keep.add(key)
  }
  return keep
}
```

(c) In `acquireQuerySubscription`, when an entry already exists, assert the mode
matches in dev (it will by construction once keys carry the dimension):

```ts
if (existing) {
  if (import.meta.dev && existing.authMode !== meta.authMode) {
    console.warn(`[better-convex-nuxt] subscription ${cacheKey} acquired with mismatched authMode`)
  }
  ...
```

**File:** `src/runtime/composables/useConvexQuery.ts`

- In `setupSubscription` (~line 287-346): the key passed to
  `acquireQuerySubscription` / stored in `registeredCacheKey` / released in
  `releaseRegisteredSubscription` becomes
  `withAuthDimension(currentCacheKey, authMode)`. The **payload/asyncData key
  stays the raw `currentCacheKey`**. Read the surrounding code first — there is
  a `registeredCacheKey === currentCacheKey` re-use check at ~287 that must
  compare like-for-like (compare the dimensioned keys).
- On the client, register the payload key whenever the query becomes active
  (regardless of `subscribe` mode — this is what saves public `subscribe:false`
  payloads from the purge, bug A4), and unregister on scope dispose / when the
  key changes. Wire it where the component already tracks its active key (the
  same watcher that manages subscriptions is a natural place; keep exactly one
  live registration per component instance).

**File:** `src/runtime/composables/useConvexPaginatedQuery.ts`

- `getStablePaginatedSubscriptionKey` and the first-page subscription key: wrap
  the returned key with `withAuthDimension(..., authMode)` (the `authMode`
  variable already exists in scope — see `acquirePaginatedQuerySubscription`
  call sites at ~642 and ~698).
- Register `cacheKey.value` (the `convex-paginated:…` payload key) in the
  payload-key registry with the query's `authMode`, same lifecycle rules as
  above. This is what fixes bug A3 (paginated payloads always purged).

**Update existing tests** that assert raw keys in the subscription cache
(e.g. `useConvexQuery.signout-public.nuxt.test.ts` uses
`getSubscriptionCache(nuxtApp).has(publicKey)`) to use `withAuthDimension`.
Do not delete assertions — translate them.

Implemented in this slice:

- Subscription cache keys now use `withAuthDimension(key, authMode)` while Nuxt
  asyncData payload keys remain unchanged.
- Plain and paginated query composables register active payload keys for both
  live and `subscribe:false` consumers, then unregister on key changes, idle
  transitions, and scope disposal.
- Sign-out purge now uses `getPublicOnlyPayloadKeys()` instead of live
  subscription keys, so public payload survival is based on raw payload keys
  rather than the subscription namespace.
- Added registry invariants and mixed-auth regression coverage for plain and
  paginated subscriptions.
- Also fixed `test/e2e/server-utils-smoke.e2e.test.ts` by wrapping `$fetch` in
  a local `unknown` fetch function, avoiding Nuxt typed-route recursion in
  `vue-tsc` without changing runtime behavior.

### TODO 1.4 — Rewrite the engine sign-out sequence `[x]`

**File:** `src/runtime/auth/client-engine.ts` (~lines 495-560), plus
`refreshAuth` (~line 560+).

Current problems: (1) `clearAuthSubscriptions` runs _before_ the upstream call,
so a failed sign-out leaves subscriptions torn down while the user stays
signed in; (2) all identity clearing is gated on `isActiveGeneration`, so a
concurrent `refreshAuth()` (documented post-sign-in step) skips the entire
teardown and the prior user's JWT survives; (3) the purge uses
`startsWith('convex')` + a `liveKeys` set in the wrong namespace.

**Target shape** (adapt names to the file, keep the existing
`signOutPromise` memoization):

```ts
const operationGeneration = nextGeneration()
state.pending.value = true
state.authError.value = null

signOutPromise = (async () => {
  // Serialize with refreshAuth (LD-3): never interleave the two.
  const inflightRefresh = nuxtApp._convexRefreshAuthPromise
  if (inflightRefresh) await inflightRefresh.catch(() => {})

  const result = await authClient.signOut()
  const maybeError = result && typeof result === 'object' && 'error' in result ? result.error : null
  if (maybeError) {
    throw new Error(getErrorMessage(maybeError, 'Sign out failed'))
  }

  // Upstream session IS revoked at this point. Identity teardown is therefore
  // unconditional — a racing operation must not be able to preserve the
  // revoked identity (F-3/A6). Only cosmetic state below stays gated.
  state.token.value = null
  state.user.value = null
  lastTokenValidation = 0
  lastNullTokenCheck = Date.now()
  settleAuthReady(false)
  attachedClient?.setAuth(
    async () => null,
    () => {},
  )

  clearAuthSubscriptions(nuxtApp) // moved AFTER upstream success (LD-4)
  await nextTick()

  // Purge cached payloads via the payload-key registry (LD-2): survive only
  // keys consumed exclusively by live auth:'none' queries. Everything else
  // under our namespaces goes — including orphaned keys with no live consumer.
  const keep = getPublicOnlyPayloadKeys(nuxtApp)
  clearNuxtData(
    (key) => (key.startsWith('convex:') || key.startsWith('convex-paginated:')) && !keep.has(key),
  )

  if (isActiveGeneration(operationGeneration)) {
    state.authError.value = null
  }
  return result
})()
```

Keep the existing `try/catch/finally` wrapper: on error, `authError` set (gated),
token/user untouched (session may still be live); `pending` reset in `finally`
(gated), and `signOutPromise` cleared however the file already does it.

In `refreshAuth`, mirror the serialization at the top of the memoized body:

```ts
const inflightSignOut = signOutPromise
if (inflightSignOut) await inflightSignOut.catch(() => {})
```

Leave the `if (state.token.value) return` success-check as is — with
serialization plus unconditional clearing, a token present after the hook is by
construction a _fresh_ token, not the revoked one.

**Purge-prefix note:** the old predicate `key.startsWith('convex')` also nuked
unrelated app keys like `convexSomething`. The new predicate matches only the
module's own namespaces (`convex:` / `convex-paginated:`). Grep
`rg -n "startsWith\('convex'\)" src/` afterwards — zero hits expected.

Implemented in this slice:

- `signOut()` now waits for an in-flight `refreshAuth()` before calling Better
  Auth, and `refreshAuth()` waits for an in-flight `signOut()` before starting
  its own generation.
- Subscription teardown, Convex `setAuth(null)`, identity clearing, and Nuxt
  payload purge now run only after upstream sign-out succeeds.
- Identity teardown is no longer guarded by `isActiveGeneration`; only cosmetic
  state remains generation-gated.
- Restore-and-retest:
  - Reintroducing pre-upstream `clearAuthSubscriptions()` fails `clears shared
query subscriptions only after Better Auth signOut succeeds` and `keeps
identity and subscriptions when Better Auth signOut fails`.
  - Reintroducing the old combined race (no refresh/sign-out serialization plus
    generation-gated teardown) fails `clears identity even when refreshAuth
starts during signOut`.
  - `rg -n "startsWith\('convex'\)" src/` returns no matches.

### TODO 1.5 — End-to-end `engine.signOut()` test suite `[x]`

**New file:** `test/nuxt/client-engine.signout-lifecycle.nuxt.test.ts`

Use `captureInNuxt` + `MockConvexClient`. The engine must be constructed the
way the runtime does it — study how existing nuxt-tier tests obtain/construct
the engine (`test/unit/client-auth-engine.test.ts` shows `createConvexAuthEngine`
options incl. a mockable `authClient` with `signOut: vi.fn()`); if the nuxt
harness doesn't currently expose an engine, build it inside the capture callback
with a stub `authClient` whose `signOut` resolves `{}` (success) or rejects
(failure case). **Do not** simulate sign-out by poking `token.value`.

Required cases — each maps to a bug and MUST fail if that fix is lone-reverted:

| Case                                                                                                                                                                              | Pins                 | Assert                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| Public plain query (`auth:'none'`, subscribe) survives `engine.signOut()` and still receives a post-sign-out emission                                                             | C1/F-2 engine wiring | subscription entry present; new `emitQueryResult` reaches `data`                                      |
| Private plain query (`auth:'auto'`) purged                                                                                                                                        | F-3 Part B           | payload cleared, status idle, subscription gone                                                       |
| Private query with `keepPreviousData: true` **blanks** after `engine.signOut()`                                                                                                   | A1+A2                | `data.value === null` after sign-out settles                                                          |
| Public **paginated** query payload survives sign-out                                                                                                                              | A3                   | `results` still populated after sign-out                                                              |
| Public plain `subscribe:false` query payload survives                                                                                                                             | A4                   | payload still present                                                                                 |
| Same fn+args mounted as both `auth:'none'` and `auth:'auto'`: sign-out kills only the auto entry; public keeps streaming; no double-release refcount corruption                   | A5                   | dimensioned keys: none-entry present, auto-entry gone; post-sign-out emission reaches public consumer |
| `refreshAuth()` fired while `signOut()` upstream call is in flight (make the stub `authClient.signOut` await a controllable deferred): after both settle, `token`/`user` are null | A6/LD-3              | serialization + unconditional clear                                                                   |
| Upstream sign-out **fails** (stub rejects): token/user retained, `authError` set, both public and private subscriptions still live and streaming                                  | A7/LD-4              | no teardown happened                                                                                  |

Implemented in `test/nuxt/client-engine.signout-lifecycle.nuxt.test.ts`:

- Success path mounts real query composables plus a real client auth engine,
  then calls `engine.signOut()` and verifies private plain data blanks, public
  plain keeps streaming, public `subscribe:false` payload survives, public
  paginated results survive, and mixed auth-mode subscriptions retain only the
  public dimension.
- Failure path stubs upstream sign-out rejection and verifies token/user,
  authError, public subscription, private subscription, and post-failure
  streaming remain intact.
- Race path starts `refreshAuth()` while upstream sign-out is pending and
  verifies the old token/user are not preserved.

### TODO 1.6 — Rewrite the manufactured-transition tests `[x]`

- `test/nuxt/useConvexQuery.signout-purge.nuxt.test.ts`: the "Part A" case
  currently freezes `convex:pending` at `false` and pokes `token.value = null`
  (a `none → auth-signed-out` jump production never produces). Rewrite it to
  pulse pending exactly like the engine (`pending=true` → flush → `token=null`
  → flush → `pending=false` → flush) **or** drop it in favor of the 1.5
  `keepPreviousData` case if redundant. The inline-cleared "Part B" case:
  keep only if it still adds value over 1.5; otherwise delete with a comment
  pointing at the lifecycle suite.
- `test/nuxt/useConvexQuery.signout-public.nuxt.test.ts`: keep as a
  helper-level unit for `clearAuthSubscriptions`, but add a comment stating the
  engine path is pinned by `client-engine.signout-lifecycle` (otherwise a
  future reader repeats round 1's mistake of thinking this test covers F-2).

Implemented in this slice:

- `useConvexQuery.signout-purge.nuxt.test.ts` was already using the real
  pending pulse from TODO 1.1. Its file-level comment now explicitly scopes it
  to helper-level purge/data-clearing regressions and points at the lifecycle
  suite for real engine coverage.
- `useConvexQuery.signout-public.nuxt.test.ts` now explicitly scopes itself to
  `clearAuthSubscriptions`; engine coverage lives in
  `client-engine.signout-lifecycle.nuxt.test.ts`.

### Phase 1 exit gate

- Full §0.1 gate + `prepack` + `check-package-exports --dist`.
- Restore-and-retest: lone-revert each of 1.1, 1.2, 1.3 (key dimension), 1.3
  (registry), 1.4 (blanket-clear regression: swap `clearAuthSubscriptions` back
  to clearing every entry), 1.4 (re-add `isActiveGeneration` around identity
  clear). Each lone revert must fail ≥1 named test. Record names below:

```
1.1 revert -> FAILS: `drops keepPreviousData component data through the real sign-out pending pulse (Part A)`
1.2 revert -> FAILS: `does not resurrect keepPreviousData when sign-out purge re-runs the default factory`
1.3 keys revert -> FAILS: `does not alias the same query mounted as auth:auto and auth:none`; `does not alias paginated first-page subscriptions mounted as auth:auto and auth:none`
1.3 registry revert -> FAILS: `keeps only keys consumed exclusively by auth:none queries`; `drops stale private payload keys and keeps mounted public query data`; `keeps public subscribe:false payloads during sign-out purge`
1.4 blanket-clear revert -> FAILS: `clears shared query subscriptions only after Better Auth signOut succeeds`; `keeps identity and subscriptions when Better Auth signOut fails`
1.4 generation-gate+no-serialization revert -> FAILS: `clears identity even when refreshAuth starts during signOut`
```

Phase 1 exit gate run after TODO 1.6:

- `pnpm lint` PASS.
- `pnpm format:check` PASS.
- `pnpm test:types` PASS.
- `pnpm test` PASS: 500 tests.
- `pnpm check:contracts` PASS.
- `pnpm prepack` PASS.
- `node scripts/check-package-exports.mjs --dist` PASS: 278 files checked.
- Dist spot-check after `prepack`: no `dist/runtime/devtools/.output`, no
  `dist/runtime/server/tsconfig.json`, no `dist/runtime/devtools/ui/app.vue`,
  and `dist/runtime/devtools/ui/dist/index.html` exists.

---

## Phase 2 — Paginated refresh correctness

File: `src/runtime/composables/useConvexPaginatedQuery.ts` (+tests).
Key regions: `loadMore` (~393-445), `refresh` (~828-884),
`startPageSubscription` (~665), pendingReason watcher (~786-825),
`cleanupAllSubscriptions` (~758).

### TODO 2.1 — Guard `loadMore` during refresh; reentrancy-guard `refresh` `[x]`

In `loadMore`, immediately after the idle check:

```ts
const loadMore = (numItems: number) => {
  if (executionGate.value.resolveAsIdle) return
  // A refresh() is rebuilding the page chain from fresh cursors; appending a
  // page off a stale cursor now would either be dropped by the refresh commit
  // or re-open the F-26b gap. Callers can retry once refresh settles.
  if (isManualRefreshPending.value) return
  ...
```

In `refresh`, make it reentrant-safe and gate the catch like the success path:

```ts
async function refresh(): Promise<void> {
  if (executionGate.value.resolveAsIdle) return
  if (isManualRefreshPending.value) return   // no concurrent double-refresh

  isManualRefreshPending.value = true
  ...
  const refreshPaginationId = currentPaginationId.value
  const loadedPages = [...pages.value]
  try {
    ...
    if (
      currentPaginationId.value === refreshPaginationId &&
      !executionGate.value.resolveAsIdle &&
      // pages must not have changed shape since the snapshot (belt for LD-5;
      // loadMore is already guarded above)
      pages.value.length === loadedPages.length
    ) {
      ...commit...
    } else if (import.meta.dev && pages.value.length !== loadedPages.length) {
      console.warn('[useConvexPaginatedQuery] refresh commit skipped: pages changed mid-refresh')
    }
  } catch (e) {
    void handleUnauthorizedAuthFailure({ error: e, source: 'query', functionName: fnName })
    // A stale chain (args changed / pagination reset mid-flight) must not
    // pollute the fresh view's error state.
    if (currentPaginationId.value === refreshPaginationId) {
      globalError.value = e instanceof Error ? e : new Error(String(e))
    }
  } finally {
    isManualRefreshPending.value = false
  }
}
```

Implemented in this slice:

- `loadMore()` now no-ops while `refresh()` is rebuilding the page chain.
- `refresh()` now returns immediately when another manual refresh is already
  pending.
- Refresh commits are gated on unchanged pagination id, non-idle state, and the
  same loaded-page count captured at refresh start.
- Refresh failures now route through `handleUnauthorizedAuthFailure`, and stale
  refresh failures only set `globalError` when the original pagination id is
  still current.
- Restore-and-retest:
  - Removing the `loadMore()` pending-refresh guard fails `loadMore() is
ignored while refresh() is rebuilding the page chain`.
  - Removing the `refresh()` reentrancy guard fails `deduplicates concurrent
refresh() calls`.
  - Restoring the old unconditional catch fails `does not let stale refresh
errors pollute a newer args view` and `routes refresh() failures through
unauthorized recovery`.

### TODO 2.2 — Re-bind page subscriptions after refresh commit (LD-6) `[x]`

Inside the successful-commit branch, after `pages.value = refreshedPages`:

```ts
// F-26b under subscribe:true (the default): the committed pages carry fresh
// cursors, but their live subscriptions are still bound to the OLD cursors —
// the next WS tick would overwrite the refreshed window with the stale range.
// Re-bind every page whose cursor changed. startPageSubscription() already
// unsubscribes the previous subscription for that page. Page 0 keeps the
// stable first-page subscription (cursor is always null).
if (import.meta.client && executionGate.value.setupLiveSubscription) {
  for (let i = 0; i < refreshedPages.length; i++) {
    const before = loadedPages[i]
    const after = refreshedPages[i]
    if (before && after && before.paginationOpts.cursor !== after.paginationOpts.cursor) {
      startPageSubscription(i)
    }
  }
}
```

Also fix the `refresh()` JSDoc (~line 190): it currently advertises
"force-refresh with subscriptions" — after this TODO that claim is true; make
sure the wording matches the implemented behavior (re-chained cursors +
re-bound subscriptions). Cross-check the plain-query doc that claims
`refresh()` is a no-op under subscriptions for `useConvexQuery` — that doc
statement concerns the _plain_ composable and stays.

Implemented in this slice:

- Successful refresh commits now re-bind every loaded page subscription whose
  cursor changed, starting at `pages[0]` because `pages[]` stores only
  additional pages after the first page.
- `refresh()` JSDoc now states the concrete re-chain/re-bind behavior.
- Added a live-mode regression proving a refreshed cursor replaces the stale
  page subscription, stale-cursor emissions no longer clobber the refreshed
  range, and fresh-cursor emissions continue updating the page.
- Restore-and-retest: removing the re-bind loop fails `refresh() re-binds live
page subscriptions to fresh chained cursors`.

### TODO 2.3 — Investigate & fix auth-refresh page collapse (B4) `[x]`

Claim (single-review, plausible): any `refreshAuth()` pending pulse trips the
pendingReason watcher (~786-825), which runs `cleanupAllSubscriptions()`, drops
`firstPageRealtimeData`, empties `pages`, and on settle refreshes only page 1 —
so a user 5 pages deep collapses to page 1 on every auth refresh.

1. Write the test first (nuxt-tier): mount paginated query, `loadMore` twice,
   then drive a real `refreshAuth()` (token stays the same user). Assert loaded
   page depth is preserved after settle.
2. If it fails (claim confirmed): preserve pages across an
   `auth-pending → none` round-trip where the **token value is unchanged** —
   e.g. snapshot pages before teardown and re-chain via the existing
   refresh-style sequential fetch, or skip teardown entirely when
   `pendingReason` returns to `'none'` with the same args hash and same token.
   Pick the smallest change that passes both this test and the Phase-1 suite.
3. If it passes on HEAD: record `B4 REFUTED on HEAD` here, keep the test as a
   pin, no code change.

Implemented in this slice:

- B4 is confirmed on HEAD: a same-token `auth-pending -> none` pulse collapsed
  a two-page live paginated query and left only the first page.
- The pending watcher now observes the auth token and skips teardown only for
  unchanged args plus unchanged non-null token transitions between `none` and
  `auth-pending`.
- Token loss, token replacement, skip changes, args changes, and signed-out
  transitions still use the existing teardown path.
- Restore-and-retest: removing the same-token auth-refresh guard fails
  `preserves loaded pages across a same-token auth refresh pending pulse`.

### TODO 2.4 — Live-mode F-26b + race regression tests `[x]`

Extend `test/nuxt/useConvexPaginatedQuery.nuxt.test.ts` (mirror the existing
`subscribe:false` gapless test at ~448):

| Test                                                                                                                                                                                                      | Pins |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Gapless refresh with `subscribe: true` (default): insert into page-1 range, `refresh()`, then emit on the re-bound page-2 subscription → no gap/duplicate, and the stale-cursor emission does NOT clobber | 2.2  |
| `loadMore()` called while `refresh()` is awaiting → page count preserved after both settle (loadMore no-op'd; caller retry after settle works)                                                            | 2.1  |
| Two concurrent `refresh()` calls → second returns immediately; exactly one commit                                                                                                                         | 2.1  |
| `refresh()` rejection with an unauthorized-shaped error → `handleUnauthorizedAuthFailure` invoked (spy)                                                                                                   | 2.1  |
| `refresh()` racing an args change (bump args mid-refresh) → no `globalError` pollution of the new view                                                                                                    | 2.1  |

Implemented across Phase 2:

- Live-mode F-26b rebind coverage: `refresh() re-binds live page subscriptions
to fresh chained cursors`.
- Race coverage: `loadMore() is ignored while refresh() is rebuilding the page
chain` and `deduplicates concurrent refresh() calls`.
- Error coverage: `routes refresh() failures through unauthorized recovery` and
  `does not let stale refresh errors pollute a newer args view`.
- Auth-refresh depth coverage: `preserves loaded pages across a same-token auth
refresh pending pulse`.

### Phase 2 exit gate

Full §0.1 gate + `prepack`. Restore-and-retest 2.1 (both guards), 2.2, and 2.3
(if code changed). Record failing test names here:

```
2.1 loadMore-guard revert -> FAILS: loadMore() is ignored while refresh() is rebuilding the page chain
2.1 refresh-guard revert -> FAILS: deduplicates concurrent refresh() calls
2.1 catch-gate revert -> FAILS: does not let stale refresh errors pollute a newer args view; routes refresh() failures through unauthorized recovery
2.2 re-bind revert -> FAILS: refresh() re-binds live page subscriptions to fresh chained cursors
2.3 same-token auth-refresh guard revert -> FAILS: preserves loaded pages across a same-token auth refresh pending pulse
```

Phase 2 exit gate:

- `pnpm lint` PASS
- `pnpm format:check` PASS after running `pnpm format` for markdown/test
  wrapping
- `pnpm test:types` PASS
- `pnpm test` PASS: 70 files, 506 tests
- `pnpm check:contracts` PASS
- `pnpm prepack` PASS, including `check:package-exports -- --dist`
- `node scripts/check-package-exports.mjs --dist` PASS: 278 files

---

## Phase 3 — Test integrity

### TODO 3.1 — Pin the F-1 primary gate in isolation `[x]`

Context: F-1 has three redundant layers in `useConvexQuery.ts` — the
`setupLiveSubscription` gate in the watcher (~606), a gate inside
`setupSubscription`, and an invariant `throw` (~280-284). Round-1 reviews
proved the regression test stays green when only the primary gate is reverted
(the throw catches it) — the load-bearing layer is unpinned.

Add to `test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts` a case that asserts
the gate decision itself, not just the absence of a subscription: e.g. spy on
`acquireQuerySubscription` (via module mock or the subscription cache) and
assert it is **never called** while `pendingReason === 'auth-pending'` — and
separately assert no invariant error was thrown (so the test can't pass "via
the throw"). Restore-and-retest: revert ONLY the watcher gate at ~606; the new
test must fail while the old ones stay green.

Implemented in this slice:

- Added a primary-gate isolation test that partial-mocks
  `acquireQuerySubscription` and `getSharedLogger`.
- The test asserts auth-pending/signed-out transitions do not call subscription
  acquisition and do not log the idle-subscribe invariant error.
- Restore-and-retest: removing only the primary `setupLiveSubscription` guard
  inside `setupSubscription()` fails `does not enter subscription setup while
auth is still pending` on the invariant-error assertion.

### TODO 3.2 — Cover `posts.ts` and `checkPermission` `[x]`

`playground/convex/posts.ts` (7 endpoints: auth checks, `authorize()`
ownership, `ConvexError({ code })` shapes) and `checkPermission`
(`playground/convex/permissions.config.ts:68`) lost all coverage when 65 tests
were deleted in round 1 (the log claimed they only tested deleted code — false).

**New file:** `playground/convex/posts.test.ts` — mirror
`playground/convex/files.test.ts` idioms (convex-test project). Minimum matrix:

- each endpoint × unauthenticated call → rejects with the documented
  `ConvexError` code (assert the code, not prose)
- ownership isolation: user B cannot read/update/delete user A's post
- happy path per endpoint (create → list/get → update → delete)
- `checkPermission`: grants for role with permission, denies without, denies
  for null context, resource-scoped check both ways

Target ≥ 15 focused tests. Do not test Convex framework behavior — test the
authorization decisions.

Implemented in this slice:

- Added `playground/convex/posts.test.ts` with 15 focused Convex tests.
- Read-query unauthenticated behavior is pinned to the actual contract:
  `list`/`listPaginated` return empty results and `get` returns `null`.
- Protected mutations assert structured `UNAUTHENTICATED`, `FORBIDDEN`, and
  `NOT_FOUND` `ConvexError` codes.
- Ownership isolation covers list/get/paginated/update/publish/remove.
- `checkPermission` covers null context, signed-in permissions, owner/non-owner
  resource checks, missing resource, and malformed/unknown permissions.

### TODO 3.3 — Codegen-faithful F-5 fixture (LD-8) `[ ]`

`test/fixtures/consumer-smoke/convex/_generated/api.d.ts` hand-writes
`args: Record<string, never>` for arg-less functions; real convex codegen emits
`{}` — a strictly looser world, so the contract suite tests a stronger world
than production.

1. Change every `Record<string, never>` arg type in the fixture to `{}`.
2. Run `pnpm check:contracts`. Any `TS2578` (unused `@ts-expect-error`) in
   `usePublicApiSurfaceContracts.ts` / `query-options-types.test.ts` marks a
   contract that only held in the fake world: delete that line and add the
   comment
   `// NOTE: not enforceable — convex-react's {} args accept excess properties (inherited hole).`
3. Add a new negative contract for the round-1-found hole: the paginated
   composable must not accept the _options object in the args slot_ — if it
   compiles, document it as inherited; if a cheap type-level fix in
   `ConvexQueryRest`/paginated arg types closes it without breaking the 488
   suite or consumer-smoke, take it.
4. Confirm the required-args contracts still fire: temporarily revert the F-5
   conditional type (`ConvexQueryRest`) and expect TS2578 at the arity
   contracts; restore.

### Phase 3 exit gate

Full §0.1 gate. Record: new posts test count, contracts adjusted in 3.3.

---

## Phase 4 — Security surfaces

All bounded severity; all cheap. Files under `src/runtime/server/`.

### TODO 4.1 — Force `no-store` on token-bearing proxy responses `[ ]`

**File:** `src/runtime/server/api/auth/[...].ts`. The variable
`isCriticalAuthEndpoint` (`/convex/token` or `/get-session`, ~line 164) already
exists. After the response-header forwarding loop (~line 213-218), add:

```ts
// These endpoints return the session/JWT in the body. Never let an
// intermediary cache them, regardless of what upstream sent (F-10 follow-up).
if (isCriticalAuthEndpoint) {
  setHeaders(event, { 'cache-control': 'private, no-store' })
}
```

Place it AFTER the forwarding loop so an upstream `Cache-Control` can't win.
**Test** (new or existing proxy test file under `test/unit/` — follow whatever
harness existing `[...].ts` tests use; if none exists, test
via the smallest seam available and note it): response for `/convex/token`
carries `cache-control: private, no-store` even when the stubbed upstream
responds with `Cache-Control: public, max-age=60`.

### TODO 4.2 — Harden sign-out detection (F-28) `[ ]`

Same file, ~line 70-75. Current:

```ts
const isSignOutRequest = normalizedPath === '/sign-out' && event.method === 'POST'
```

`normalizedPath` feeds the proxy target URL — do NOT change it. Add a separate
detection path:

```ts
// Detection only — the proxy target keeps the caller's exact path.
const detectionPath = normalizedPath.replace(/\/+$/, '') || '/'
const SESSION_REVOKING_PATHS = new Set([
  '/sign-out',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/delete-user',
])
const isSignOutRequest = SESSION_REVOKING_PATHS.has(detectionPath) && event.method === 'POST'
```

Also update the doc note in `docs/content/docs/**/7.module-config.md` (find the
F-28 authCache paragraph): state honestly that a request already in-flight when
revocation lands can re-cache a JWT for up to `authCache.ttl` (≤60s default) —
"immediately clears" is only true absent concurrency.

### TODO 4.3 — Strip credentials on cross-origin redirect hops (F-27) `[ ]`

**File:** `src/runtime/server/api/auth/redirect-utils.ts` (~line 52). Rename
`withoutCookieHeader` → `withoutCredentialHeaders` and strip both:

```ts
function withoutCredentialHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    const k = key.toLowerCase()
    if (k === 'cookie' || k === 'authorization') continue
    result[key] = value
  }
  return result
}
```

Response side: `fetchWithCanonicalRedirects` should report whether any
cross-origin hop was followed (e.g. return
`{ response, followedCanonicalRedirect: canonicalRedirectsFollowed > 0 }` —
update the single caller in `[...].ts`), and the caller must skip forwarding
`Set-Cookie` from the final response when a hop was followed (a foreign origin
must not set cookies on our domain). Keep the existing behavior byte-identical
when no redirect was followed. Unit-test both directions in the existing
redirect-utils test file (find it via
`rg -l "fetchWithCanonicalRedirects" test/`).

### TODO 4.4 — Honest `skipAuthRoutes` doc (F-10) `[ ]`

`docs/content/docs/4.auth-security/1.authentication.md` (~line 57) recommends
`skipAuthRoutes` as a cache safe-harbor. It is client-only
(`src/runtime/plugin.client.ts:141`); `plugin.server.ts` hydrates the JWT into
SSR HTML regardless. Rewrite the paragraph: `skipAuthRoutes` skips _client_
auth bootstrapping; it does NOT prevent SSR token hydration, so it is not a
caching safe-harbor. Mention that SSR responses carrying a token already send
`Cache-Control: private, no-store`, and that platform-level ISR/route-rule
caching ignores handler headers and must not be enabled for authed routes.

### Phase 4 exit gate

Full §0.1 gate. Restore-and-retest 4.1–4.3:

```
4.1 revert -> FAILS: <test>
4.2 revert -> FAILS: <test>
4.3 revert -> FAILS: <test>
```

---

## Phase 5 — API & docs

### TODO 5.1 — `can()` returns plain boolean (LD-7) `[ ]`

**File:** `src/runtime/composables/usePermissions.ts`

Change (~line 172):

```ts
// BEFORE
function can(permission: TPermission, resource?: TResource): ComputedRef<boolean> {
  return computed(() => checkPermission(ctx.value, permission, resource))
}

// AFTER
/**
 * Evaluated per call against reactive auth state — calling it inside a
 * template or computed keeps it reactive (Vue tracks the ctx read).
 * Returns a plain boolean, so bare `v-if="can('post.create')"` is correct.
 */
function can(permission: TPermission, resource?: TResource): boolean {
  return checkPermission(ctx.value, permission, resource)
}
```

Then, mechanically:

1. Update the return-type member at ~line 83
   (`can: (…) => ComputedRef<boolean>` → `=> boolean`).
2. `rg -n "can\(.*\)\.value" src playground demo docs test` — remove every
   `.value` on a `can()` result (the playground currently uses `.value`
   correctly for the old API; those all change).
3. `rg -n "auto-unwrap|automatically unwraps" docs/content` — delete the false
   callouts (notably `2.permissions.md:109`); replace with one sentence: "can()
   returns a plain boolean and is reactive when called during render."
4. Update the module JSDoc example (~line 145-155) — it is now correct as
   written; just verify.
5. Update `test/nuxt/usePermissions.nuxt.test.ts` expectations (results are
   booleans now; reactivity asserted by re-invoking after a role change inside
   an `effect`/computed — follow the existing test's style).

### TODO 5.2 — Fix the three permissions-doc breakers `[ ]`

**File:** `docs/content/docs/4.auth-security/2.permissions.md`

(a) **D1** (~line 316): `components.betterAuth.adapter.findMany` requires
`paginationOpts` and returns a `PaginationResult`. Fix the snippet:

```ts
const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
  model: 'member',
  where: [{ field: 'organizationId', value: args.organizationId }],
  paginationOpts: { numItems: 200, cursor: null },
})
return result.page
```

Verify the exact required shape against
`node_modules/@convex-dev/better-auth/dist/component/adapter.d.ts` before
writing — do not trust this snippet blindly.

(b) **D3**: the backend/frontend pair instantiates
`createPermissions<…, PermissionContext, …>` with `PermissionContext.role: Role`
while the documented `getPermissionContext` returns `role: string`. Align them
(cast/narrow in the query: `role: member.role as Role`, or type the context
field as `string` — pick whichever the module's real types make compile).
**Verification:** extract both snippets into a scratch `.ts` file wired against
the real module types and run `npx tsc --noEmit` on it (use the scratchpad,
not the repo). Both must compile together.

(c) Sweep the other three permission-doc pages
(`0.permissions-setup.md`, `1.authentication.md`, `3.*` if present) for the
same three patterns.

### TODO 5.3 — Purge app-owned authoritative-role guidance (E4/E5) `[ ]`

(a) `docs/content/docs/4.auth-security/1.authentication.md` ~lines 1028-1042:
the layered-fields table row
`Your app's Convex tables | users.role, users.organizationId | Authoritative permissions/business data`
and the bullet "Need authoritative roles/org membership: store/query them in
Convex tables" contradict the F-6/F-29 model (Better Auth Organization owns
roles/membership). Rewrite: the third layer is for **app business data that is
not authorization** (profile fields, preferences, domain records keyed by user
id); authoritative roles/org membership live in Better Auth Organization and
are read via `getPermissionContext`/adapter queries.

(b) `demo/convex/schema.ts:4,18`: `roleValidator` + `users.role` is the exact
anti-pattern. Inspect how `demo/` uses `users.role`
(`rg -n "\.role|roleValidator" demo/ --glob '!node_modules'`): if it is
display-only, rename the concept to something honest (or read role from Better
Auth); if it drives authorization, migrate it to the Better Auth org model like
the playground did in round 1. If migration exceeds ~2 hours of work, move it
to the deferral bucket in `refactor-progress.md` **with a dated rationale** —
un-deferred silence is what round 1 got burned for.

(c) Broaden the tripwire in `package.json` (`check:no-app-owned-org-docs`,
line ~85). Current: `! rg -n "organizations: defineTable|role: roleValidator" docs/content`.
New: also match `users\.role` and `organizationId` in **schema-ish/authoritative
contexts** across `docs/content` and `demo/convex` (playground was already
cleaned). Suggested:

```json
"check:no-app-owned-org-docs": "sh -c '! rg -n \"organizations: defineTable|role: roleValidator|authoritative (role|permission)\" docs/content demo/convex'"
```

**Calibrate it:** the guard MUST fail on the pre-5.3 tree and pass on the
post-5.3 tree. Check both states explicitly. If a legitimate doc line trips it,
reword the doc line rather than loosening the pattern.

### TODO 5.4 — F-17 consistency batch `[ ]`

Small, independent; verify each claim in code before editing (these are the
plan's least-verified items):

1. `src/runtime/utils/convex-config.ts:90-93` — `normalizeAuthRoute` hardcodes
   `'/api/auth'`; read the fallback from `CONVEX_MODULE_DEFAULTS.authRoute`.
2. `src/runtime/composables/useConvexUser.ts` (~line 89) — hardcoded
   `subscribe: true`; route through the defaults.
3. `src/runtime/server/utils/convex.ts` (~line 54) — hardcoded `'auto'`; route
   through the defaults.
4. `config-defaults.ts` — fix the `waitTimeoutMs` comment (actual behavior:
   only `0` disables; non-finite falls back to the 10 000 default). Document
   `waitTimeoutMs` in `7.module-config.md`.
5. Fix the stale F-16 `CONVEX_URL` sentence in the docs (describes pre-fix
   behavior in present tense — locate via `rg -n "CONVEX_URL" docs/content`).
6. LD-10: in `src/module.ts`, when `authCache` is configured but `enabled` is
   unset, log a setup warning ("authCache configured but not enabled — set
   `authCache.enabled: true`").
7. LD-9: add a short "storage IDs are unguessable capabilities; ownership binds
   at first registration (`saveFile`)" note to the file-storage doc page
   (locate via `rg -ln "saveFile" docs/content`).

### Phase 5 exit gate

Full §0.1 gate (lint includes the broadened guard). D3 snippet-pair compile
check recorded. `rg -n "\.value" docs/content | grep "can("` → zero hits.

---

## Phase 6 — Honesty & final verification

### TODO 6.1 — Correct the false claims in `refactor-progress.md` `[ ]`

Append a dated "Round 2 corrections" section (do not silently rewrite history):

- The round-1 claim "every deletion is a test of deleted code" was false:
  `posts.ts` (7 endpoints) and `checkPermission` survived with zero coverage
  until R2-3.2 restored it.
- The F-2 regression test did not pin the engine call site (whole suite stayed
  green with the engine reverted to the blanket clear); fixed by R2-1.5.
- The F-3 Part-A test drove a transition production never produces; fixed by
  R2-1.5/1.6.
- The Phase-5 "authentication.md verified clean" sign-off missed the app-owned
  authoritative-roles section; fixed by R2-5.3.
- The F-5 "verified against the fixture's real generated types" claim was
  inaccurate (fixture was stricter than codegen); fixed by R2-3.3.

### TODO 6.2 — Full final gate `[ ]`

Serially:

```bash
pnpm lint && pnpm format:check && pnpm test:types && pnpm test && pnpm check:contracts
pnpm prepack
node scripts/check-package-exports.mjs --dist
rg -n "as any|@ts-ignore" src/   # expect zero
git status                        # expect clean
```

Record final test count (baseline was 488; expect meaningfully more).

### TODO 6.3 — Restore-and-retest sweep record `[ ]`

Consolidate every `X revert -> FAILS: <test>` line from the phase gates into
one matrix here. Every Phase 1–4 code fix must have an entry. Any fix without
a failing-test entry is NOT done — go back.

### TODO 6.4 — Runtime smoke (best effort) `[ ]`

If `playground/.env.local` + a live Convex deployment are available:
`pnpm test:e2e`, plus a manual drive of the headline scenario (sign in →
mount a `keepPreviousData: true` private query → sign out → confirm the data
blanks; sign in as a different user → confirm no stale data). If no live
deployment: record "e2e skipped — no deployment" here. Do not fabricate.

---

## Appendix A — Bug ↔ TODO map

| Bug (see remediation-round-2.md)                     | TODO             |
| ---------------------------------------------------- | ---------------- |
| A1 dead Part-A guard                                 | 1.1              |
| A2 keepPreviousData resurrection                     | 1.1 + 1.2        |
| A3 paginated key-namespace mismatch                  | 1.3              |
| A4 over-broad purge (subscribe:false / prefix sweep) | 1.3 + 1.4        |
| A5 auth-mode-blind cache key                         | 1.3              |
| A6 generation-skip race                              | 1.4              |
| A7 failed sign-out teardown                          | 1.4 (LD-4) + 1.5 |
| B1 refresh/loadMore race                             | 2.1              |
| B2 stale-cursor subscriptions after refresh          | 2.2              |
| B3 refresh catch ungated / no 401 recovery           | 2.1              |
| B4 auth-refresh page collapse                        | 2.3              |
| C1 F-2 test gap                                      | 1.5 + 1.6        |
| C2 F-3 manufactured transition                       | 1.6              |
| C3 F-1 primary gate unpinned                         | 3.1              |
| C4 posts.ts coverage                                 | 3.2              |
| C5 F-5 fixture fidelity                              | 3.3              |
| D1 token endpoint no-store                           | 4.1              |
| D2 F-28 sign-out detection                           | 4.2              |
| D3 F-27 credential headers                           | 4.3              |
| D4 skipAuthRoutes doc                                | 4.4              |
| E1/E3 permissions doc breakers                       | 5.2              |
| E2 can() ComputedRef footgun                         | 5.1              |
| E4/E5 app-owned roles doc + demo schema              | 5.3              |
| E6 F-17 drift batch                                  | 5.4              |

## Appendix B — Things that look like bugs but are NOT (do not "fix")

- `saveFile` first-registration-wins without upload-intent binding — by design
  (LD-9), verified OCC-safe. Document only (5.4.7).
- `check:contracts` failing when run concurrently with `prepack` — self-
  inflicted `dist/` race, not a defect. Run serially.
- `dist/` occasionally holding a flattened `ConvexQueryRest` mid-review — stale
  artifact; a clean `nuxt-module-build build` emits the correct conditional.
- The plain-query doc saying `useConvexQuery`'s refresh is subscription-managed
  — correct for the plain composable; only the _paginated_ JSDoc needed 2.2.
- `code.includes('UNAUTH')` matching `UNAUTHORIZED` in the F-24 matcher —
  accepted as defensible in review; leave unless it causes a concrete failure.
