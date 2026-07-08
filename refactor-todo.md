# refactor-todo.md — Audit Remediation Plan

**Source of truth for WHAT to fix:** `AUDIT_REPORT.md` (2026-07-08, v0.4.0 audit). Finding IDs (F-1…F-42) below refer to that report.
**This file is the source of truth for HOW and IN WHAT ORDER.**
**Written for:** an autonomous implementation agent. A senior reviewer will review every phase after the fact — your job is correctness and evidence, not speed.

---

## 0. Kickoff Prompt (paste this to start the agent)

```txt
You are the implementation agent for the better-convex-nuxt audit remediation.

Read these two files completely before touching anything:
1. /refactor-todo.md   (the plan — your instructions, task list, and pre-written cornerstone code)
2. /AUDIT_REPORT.md    (the audit — evidence and acceptance criteria for every finding)

Then execute the plan phase by phase, task by task, in order. Rules:

- Work on a new git branch: `refactor/audit-remediation`. Never commit to main.
- One commit per task, message format: `fix(F-1): <short description>` (or `refactor(P4.2): ...` for tasks without a finding ID).
- Every task has acceptance criteria and verification commands. A task is DONE only when its
  verification commands pass AND the full gate for its phase passes. Do not mark tasks done on
  "looks right" — run the commands.
- The plan contains CORNERSTONE code blocks written by the senior reviewer for the hardest sections.
  Use them as the reference implementation. They were written against the exact code at commit
  eef25d41 — if the file has drifted, adapt names/lines but preserve the stated invariants.
  Do NOT "improve" or restructure cornerstone logic. If a cornerstone appears wrong against the
  actual code, STOP that task, record it in refactor-progress.md under BLOCKED, and move on.
- Maintain /refactor-progress.md as you go: one line per task (DONE/BLOCKED/SKIPPED + commit hash +
  test evidence). This file is how the reviewer audits your work.
- If a task fails verification 3 times, mark it BLOCKED with your best diagnosis and move to the
  next task. Never delete or weaken an existing test to make a task pass. Never change a task's
  acceptance criteria.
- Scope discipline: fix ONLY what the task says. No drive-by refactors, no new public APIs, no new
  dependencies, no new abstractions "while you're in there". Prefer delete > simplify > replace > add.
- Destructive operations (file/directory deletion) are pre-authorized ONLY where a task explicitly
  lists the paths. Anything else: BLOCKED + note.
- After the last phase, run the Final Gate (Section 3) and write the summary section of
  refactor-progress.md.

Start with Phase 0 now.
```

---

## 1. Working Agreement

### 1.1 Verification loop (run constantly)

Per-task (fast, always):

```bash
pnpm vitest run --project=unit --project=nuxt   # or the targeted files named in the task
pnpm test:types
```

Per-phase gate (before starting the next phase):

```bash
pnpm test            # 510+ tests, all green — count must never go DOWN
pnpm test:types
pnpm check:contracts
```

Final gate (Section 3): everything above plus `pnpm lint`, `pnpm format:check`, `pnpm prepack`.

### 1.2 Environment notes

- Package manager is **pnpm**. If bin shims resolve into a foreign path, run `pnpm install --frozen-lockfile` once.
- `pnpm lint` includes `check:no-starter-generated-artifacts`, which fails if starters contain local `.nuxt`/`node_modules`. If present locally, clean them with the command the script prints (they are untracked).
- E2E (`pnpm test:e2e`) needs a live Convex deployment — **do not run it**; it is out of scope.
- Never run `pnpm release`.

### 1.3 Codebase invariants you must preserve

1. **One query core.** `createConvexQueryState` in `src/runtime/composables/useConvexQuery.ts` is the only query state machine. `usePermissions`, `useConvexUser`, `defineSharedConvexQuery` reuse it. Never fork it.
2. **The execution gate decides.** `src/runtime/utils/query-execution-gate.ts` is the single decision point for whether a query runs/subscribes. After this refactor, NO code path may acquire a subscription without checking `setupLiveSubscription`.
3. **Better Auth owns identity; Convex owns product data.** No new tables, no org/member/role state anywhere in `src/`, docs snippets, or playground.
4. **Auto-import surface is registry-driven.** Any public-surface change goes through `src/module-api-surface.ts` and then `node scripts/generate-api-surface.mjs` (commit the regenerated doc).
5. **No `as any`, `: any`, or `@ts-ignore` in `src/`.** The codebase currently has zero; keep it that way.
6. **Tests are contracts.** Add the regression test named in each task's acceptance criteria. Never delete a test unless the task explicitly says to replace it.

---

## 2. Phases

Order matters: Phase 0 (baseline) → 1 (P1 runtime) → 2 (P1/P2 types) → 3 (security/docs hardening) → 4 (consolidation) → 5 (architecture cut) → 6 (P3 batch) → Final Gate. Phases 3 and 5 touch mostly docs/starters and can't conflict with 1–2; do them in order anyway.

---

### Phase 0 — Baseline and format normalization

**P0.1 — Branch + baseline evidence**

- `git checkout -b refactor/audit-remediation`
- Run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm test:types`, `pnpm check:contracts`. All must pass BEFORE you change anything. Record the test count (currently 510) in `refactor-progress.md` as the baseline.

**P0.2 — Format normalization (F-41)**

- Run `pnpm format` (oxfmt). Commit the result as a single standalone commit `chore(F-41): normalize formatting` with NO other changes mixed in.
- Verify: `pnpm format:check` passes; `pnpm test` still green.
- Why first: every later diff stays clean and reviewable.

---

### Phase 1 — P1 runtime lifecycle (the hardest phase — cornerstones provided)

Read `src/runtime/composables/useConvexQuery.ts`, `src/runtime/utils/convex-cache.ts`, `src/runtime/utils/query-execution-gate.ts`, `src/runtime/auth/client-engine.ts` (sign-out region ~line 489-549), and `src/runtime/composables/defineSharedConvexQuery.ts` fully before starting.

#### P1.1 — F-1: Gate all subscription acquisition (CONFIRMED bug)

**The bug:** `setupSubscription()` (`useConvexQuery.ts:521`) checks only `waitForAuth`; when auth settles **signed-out**, the `waitForAuth` watcher (`useConvexQuery.ts:598-615`) still calls it, and `getCacheKey()` returns the shared `convex:idle:${fnName}` key, so an unauthenticated WS subscription is registered under a key shared by all instances of that function regardless of args.

**CORNERSTONE 1 — the fix (3 edits in `useConvexQuery.ts`):**

Edit A — `setupSubscription` must consult the gate, not just `waitForAuth`:

```ts
const setupSubscription = () => {
  // The execution gate is the single decision point. It is false when skipped,
  // auth-pending, signed-out-private, or subscribe:false — never acquire in those states.
  if (!executionGate.value.setupLiveSubscription) {
    return
  }

  const currentArgs = getArgs()
  if (currentArgs == null || currentArgs === 'skip') {
    return
  }
  // ... rest unchanged
```

Edit B — defensive invariant in `acquireSharedSubscriptionBridge` (directly after the `convex` null check):

```ts
if (executionGate.value.resolveAsIdle) {
  throw new Error(
    '[useConvexQuery] Internal invariant violated: attempted to subscribe while query is idle',
  )
}
```

Edit C — the `waitForAuth` watcher: when auth settles, only refresh when the gate says the query is live (signed-in) — a signed-out settle must leave the query idle:

```ts
watch(
  () => executionGate.value.waitForAuth,
  async (waitForAuth, previousWaitForAuth) => {
    if (waitForAuth) {
      if (registeredCacheKey) {
        releaseRegisteredSubscription()
      }
      return
    }

    if (!previousWaitForAuth || isSkipped.value) {
      return
    }

    // Auth settled. Signed-in → resubscribe + refetch. Signed-out → stay idle
    // (setupSubscription self-guards, and refreshing would just write null).
    if (executionGate.value.setupLiveSubscription) {
      setupSubscription()
      await asyncData.refresh()
    }
  },
)
```

**Invariants (do not lose while adapting):** (1) both watchers may fire on the same transition (`pendingReason` also changes when `waitForAuth` flips) — that is fine because `acquireSharedSubscriptionBridge` is idempotent for an unchanged key; (2) the initial `setupSubscription()` call at line ~562 stays, now self-guarded; (3) the sign-in path (pending → token present) must still resubscribe — that flows through Edit C's `setupLiveSubscription === true` branch AND the pendingReason watcher.

**Regression test (add to `test/nuxt/useConvexQuery.nuxt.test.ts` or a new `test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts`):** the audit's repro — module with auth enabled, query with `auth: 'auto'`, mock client `onUpdate` spy; drive `useState('convex:pending')` true→false with `useState('convex:token')` null. Assert `onUpdate` was called **0** times and the subscription cache has no `convex:idle:*` key (import `getSubscriptionCache` and inspect keys). Then set a token, flip pending, assert exactly one subscription is created under the real args key. NOTE: the existing test harness defaults everything to `auth:'none'` — your test must configure `auth: 'auto'` with the module's auth enabled; look at how `test/nuxt/useConvexAuth.nuxt.test.ts` wires auth state for the pattern.

Acceptance: new test green; all existing nuxt tests green; `rg "convex:idle" src/` shows the key is still used for asyncData keying but grep of subscription acquisition confirms it can no longer reach `acquireQuerySubscription` (the throw in Edit B guarantees it).

#### P1.2 — F-2: Sign-out must not kill public subscriptions (CONFIRMED bug)

**The bug:** `client-engine.ts:507,529` calls `clearSubscriptionCache(nuxtApp)` which unsubscribes **every** entry; `auth:'none'` queries never resubscribe (no watcher input changes for them) and silently freeze.

**CORNERSTONE 2 — tag entries with their auth mode and clear selectively.**

In `src/runtime/utils/convex-cache.ts`:

```ts
export interface SubscriptionEntry {
  unsubscribe: () => void
  refCount: number
  queryBridge?: QuerySubscriptionBridge
  /** Auth transport mode of the query that created this entry. 'none' = public. */
  authMode: 'auto' | 'none'
}

export function acquireQuerySubscription(
  nuxtApp: SubscriptionCacheOwner,
  cacheKey: string,
  start: (bridge: QuerySubscriptionBridge) => () => void,
  meta: { authMode: 'auto' | 'none' } = { authMode: 'auto' },
): AcquiredQuerySubscription {
  // ... existing body; on the create path:
  const entry: SubscriptionEntry = {
    unsubscribe,
    refCount: 1,
    queryBridge: bridge,
    authMode: meta.authMode,
  }
  // ...
}

/**
 * Tear down only auth-carrying subscriptions after sign-out.
 * Public (auth: 'none') queries are auth-independent and must keep streaming.
 */
export function clearAuthSubscriptions(nuxtApp: SubscriptionCacheOwner): void {
  const cache = getSubscriptionCache(nuxtApp)
  for (const [key, entry] of cache.entries()) {
    if (entry.authMode === 'none') continue
    entry.unsubscribe()
    cache.delete(key)
  }
}
```

In `useConvexQuery.ts`, the `acquireQuerySubscription(nuxtApp, currentCacheKey, (bridge) => ...)` call gains a 4th argument: `{ authMode }` (the already-resolved `authMode` const from options).

In `src/runtime/auth/client-engine.ts` `signOut` (~lines 507 and 529): replace **both** `clearSubscriptionCache(nuxtApp)` calls with `clearAuthSubscriptions(nuxtApp)` and update the import. Then run `rg -n "clearSubscriptionCache" src test` — if other production call sites exist (e.g. refreshAuth), replace them the same way; leave test usages of the old function intact only if the test is specifically about full teardown, otherwise update the test to the new function. Keep `clearSubscriptionCache` exported (it is still the correct "nuke everything" tool for teardown paths), but its only production callers should be non-auth teardown, if any.

**Mirror in paginated queries:** `src/runtime/composables/useConvexPaginatedQuery.ts` acquires subscriptions per page. Find its `acquireQuerySubscription` call(s) and pass `{ authMode }` there too (it resolves an `authMode`/`auth` option the same way — verify the variable name in that file).

**Regression test (unit or nuxt tier):** mount one `auth:'none'` query and one `auth:'auto'` query against the mock client; call `clearAuthSubscriptions(nuxtApp)`; assert the public query's subscription entry survives and still delivers a subsequent `commitQueryBridgeData` emission to the component, while the auth query's entry is gone.

Acceptance: new test green; `test/unit/client-auth-engine.test.ts` still green (update its expectations if it asserted full cache clearing — the _intent_ of those assertions changes from "everything cleared" to "auth entries cleared, public entries survive"; that is the one sanctioned test-behavior change, note it in progress log).

#### P1.3 — F-3: Sign-out clears cached query payload; signed-out components drop private data

Two parts:

**Part A — component-side (in `useConvexQuery.ts`):** when the gate transitions INTO `'auth-signed-out'` from an active state, the component must drop its private data. Add to the existing `{hash, skipped, pendingReason}` watcher body, after the release block:

```ts
// Entering signed-out: drop this component's now-unauthorized data.
if (next.pendingReason === 'auth-signed-out' && prev.pendingReason === 'none') {
  lastSettledData.value = null
  lastSettledRawData.value = null
  lastSettledArgsHash.value = null
  asyncData.clear()
}
```

(`asyncData.clear()` is Nuxt's own reset — data back to default, status idle. `pendingReason` is in the watcher source object, so this fires exactly once per transition.) Note: this only applies to `authMode !== 'none'` by construction — public queries never produce `'auth-signed-out'`.

**Part B — app-side sweep for everything not currently mounted+public (in `client-engine.ts` signOut, inside the `isActiveGeneration(operationGeneration)` block, AFTER `clearAuthSubscriptions`):**

**CORNERSTONE 3:**

```ts
// Purge cached Convex query payload so a subsequent session can never read or
// hydrate the previous user's data. Keys still present in the subscription
// cache belong to live public (auth:'none') queries and keep their data.
const liveKeys = new Set(getSubscriptionCache(nuxtApp).keys())
clearNuxtData((key) => key.startsWith('convex') && !liveKeys.has(key))
```

Imports: `clearNuxtData` from `#imports` (verify it resolves in this file's context — client-engine already imports Nuxt composables; if `#imports` is unavailable here, `#app` exports it). `getSubscriptionCache` from `../utils/convex-cache`. Verify the actual paginated key prefix: run `rg -n "getQueryKey|convex-paginated|asyncDataKey" src/runtime/composables/useConvexPaginatedQuery.ts src/runtime/utils/convex-shared.ts` — the predicate above uses `startsWith('convex')` which covers `convex:`, `convex:idle:`, and any `convex-paginated:` variant; confirm no unrelated Nuxt keys start with `convex` (grep the repo for other `useAsyncData`/`useState` keys).

**Regression test:** unit/nuxt test that seeds `nuxtApp.payload.data['convex:someKey']`, mounts a public subscribed query, runs the sign-out clearing sequence, and asserts: seeded private key gone, live public query key's data intact.

Acceptance: both parts tested; full nuxt suite green.

#### P1.4 — F-4: `defineSharedConvexQuery` survives its first consumer

**The bug:** `defineSharedConvexQuery.ts:126-131` runs `createConvexQueryState` inside the **first caller's** component scope; `onScopeDispose` in the query core tears down the shared subscription when that component unmounts, while the registry keeps handing out the dead state object.

**CORNERSTONE 4 — create the state in a detached effect scope owned by the registry:**

```ts
import { effectScope } from 'vue'

interface SharedQueryRegistryEntry<T> {
  value: T
  scope: ReturnType<typeof effectScope>
  config: unknown
  queryName: string
  argsFingerprint: string
  optionsFingerprint: string
}
```

and the creation path becomes:

```ts
// Shared state must outlive any individual consumer. A detached scope is owned
// by the registry (app lifetime), so the first consumer unmounting cannot
// dispose the shared subscription.
const scope = effectScope(true /* detached */)
const created = scope.run(() =>
  createConvexQueryState<Query, Args, DataT>(config.query, config.args, config.options, true),
)!.resultData

registry.entries.set(config.key, {
  value: created,
  scope,
  config,
  queryName,
  argsFingerprint,
  optionsFingerprint,
})
```

**Invariants:** (1) `scope.run` executes synchronously — `useNuxtApp()`/`useState` inside `createConvexQueryState` still need the Nuxt instance; verify the calls inside still work under the detached scope (the nuxt app context is ambient at call time since the factory runs during a consumer's setup — it does; the detached scope only changes _effect_ ownership, not the Nuxt context). (2) SSR: per-request registry means scopes are per-request; they are GC'd with the app object (registry lives on `nuxtApp`) — no explicit stop needed, but add a `/* scope is stopped never: registry and scope share the nuxt app lifetime */` comment so nobody "fixes" it. (3) Do NOT wrap the `existing` early-return path in a scope.

**Regression test (extend `test/nuxt/defineSharedConvexQuery.nuxt.test.ts`):** define one shared query; mount component A and component B both calling it; unmount A; emit a new value through the mock subscription; assert B's `data` receives the update (this is the exact scenario that fails today).

Acceptance: new lifecycle test green; existing 5 tests in that file green.

**Phase 1 gate:** `pnpm test` (count ≥ baseline + new tests), `pnpm test:types`, `pnpm check:contracts`.

---

### Phase 2 — Type safety (P1 type hole + tightening)

#### P2.1 — F-5: Required args must be required (query family + server helpers)

**CORNERSTONE 5 — the conditional rest-tuple.** Add ONE shared type (put it in `src/runtime/utils/query-args.ts` or a new small `src/runtime/utils/args-tuple.ts`, exported via the composables barrel only if needed by declaration emit):

```ts
import type { FunctionArgs, FunctionReference } from 'convex/server'

type EmptyArgs = Record<string, never>

/**
 * Mirrors convex's OptionalRestArgs rule for our (args, options) call shape:
 * functions whose args are satisfiable by {} keep args optional; everything
 * else makes args required at the type level. Runtime behavior is unchanged.
 */
export type ConvexQueryRest<
  Query extends FunctionReference<'query' | 'mutation' | 'action'>,
  ArgsParam,
  Options,
> =
  EmptyArgs extends FunctionArgs<Query>
    ? [args?: ArgsParam, options?: Options]
    : [args: ArgsParam, options?: Options]
```

Apply to the five public entry points (signatures only; bodies destructure the tuple):

```ts
export async function useConvexQuery<
  Query extends FunctionReference<'query'>,
  Args extends ConvexQueryArgs<FunctionArgs<Query>> = ConvexQueryArgs<FunctionArgs<Query>>,
  DataT = FunctionReturnType<Query>,
>(
  query: Query,
  ...rest: ConvexQueryRest<
    Query,
    MaybeRefOrGetter<Args>,
    UseConvexQueryOptions<FunctionReturnType<Query>, DataT>
  >
): Promise<UseConvexQueryData<DataT>> {
  const [args, options] = rest
  const { resultData, resolvePromise } = createConvexQueryState(query, args, options, false)
  await resolvePromise
  return resultData
}
```

Same pattern for: `useConvexPaginatedQuery` (public wrapper only — check where its public signature lives in `useConvexPaginatedQuery.ts`), `useConvexUser` (`useConvexUser.ts:61-68`), and the three server helpers in `src/runtime/server/utils/convex.ts:197-243` (there the tuple is `[args?: FunctionArgs<Query>, options?: ServerConvexOptions]` vs required — no MaybeRefOrGetter). For `defineSharedConvexQuery`, make the `args` **field** conditionally required on the options object:

```ts
type SharedQueryArgsField<Query extends FunctionReference<'query'>, Args> =
  EmptyArgs extends FunctionArgs<Query>
    ? { args?: MaybeRefOrGetter<Args> }
    : { args: MaybeRefOrGetter<Args> }
```

and intersect it with the rest of `DefineSharedConvexQueryOptions` (remove the inline `args?` member).

**Do NOT change** `createConvexQueryState`'s internal signature (`args?` stays — internal callers pass `undefined` legitimately). **Do NOT change** the `Args` generic's `'skip'` union — `useConvexQuery(api.x.get, 'skip')` must keep compiling. **Watch out:** generic default for `Args` must remain inferable from `rest[0]`; if inference breaks (test it!), fall back to two overloads per function instead of the conditional tuple — that is the sanctioned plan B.

**Negative-space contracts (F-23, same task):** in `test/fixtures/consumer-smoke/composables/usePublicApiSurfaceContracts.ts` add, for a required-args query from the fixture's api:

```ts
// @ts-expect-error required args must not be omittable (F-5)
useConvexQuery(api.tasks.get)
// @ts-expect-error wrong arg shape must not compile
useConvexQuery(api.tasks.get, { wrong: 1 })
```

plus the equivalent for `useConvexPaginatedQuery`, `serverConvexQuery` (in the fixture's server route file), and `useConvexUser` — AND positive cases proving no-arg queries still accept zero args. Mirror a compile-time assertion set in `test/unit/query-options-types.test.ts`.

Acceptance: `pnpm check:consumer-smoke` and `pnpm test:types` green; temporarily reverting the signature change makes the `@ts-expect-error` lines fail the typecheck (verify once, then restore).

#### P2.2 — F-19: `error` refs stop lying

In `useConvexQuery.ts`: change `UseConvexQueryData.error` to `ComputedRef<Error | null>` and build it as `computed(() => asyncData.error.value ?? null)`; delete the `as Ref<Error | null>` cast at the result object (~line 670). The internal bridge writes (`asyncData.error as Ref<...>` at ~499/512) keep writing to `asyncData.error` — they are writes to Nuxt's own ref and stay. Check `useConvexUser.ts` and `defineSharedConvexQuery` consumers for type ripple. Add a type test pinning `UseConvexQueryData<X>['error']` extends `ComputedRef<Error | null>`.

#### P2.3 — F-18: `createPermissions` context typed by its query

In `src/runtime/composables/usePermissions.ts`: change the config's query field to `FunctionReference<'query', 'public', Record<string, never>, TContext | null>` and remove the `as TContext | null` cast (~line 166). Fix `pending: Ref<boolean>` → `ComputedRef<boolean>` (~line 93). Update the playground/consumer-smoke permission query types if they now mismatch (they shouldn't — they already return the context shape).

#### P2.4 — F-15: `useConvexStorageUrl` typed + auth passthrough

In `src/runtime/composables/useConvexStorageUrl.ts`: constrain the reference to `FunctionReference<'query', 'public', { storageId: string }, string | null>`; add an options param `{ auth?: ConvexQueryAuthMode }` defaulting to `'none'` (preserves current behavior) and pass it through instead of the hardcoded literal. Add a `@ts-expect-error` contract for a mistyped getUrl query in consumer-smoke.

#### P2.5 — F-22: ConvexUser augmentation fixture

In `test/fixtures/consumer-smoke`: add `types/convex-user.d.ts` with `declare module 'better-convex-nuxt' { interface ConvexUser { auditProbeField?: 'yes' } }` and a composable that reads `useConvexAuth().user.value?.auditProbeField` with a type-level assertion (e.g. assigning to `'yes' | undefined`). Acceptance: `pnpm check:consumer-smoke` green; removing the augmentation file makes the probe line fail (verify once).

**Phase 2 gate:** full gate + `pnpm check:contracts`.

---

### Phase 3 — Security & docs hardening

#### P3.1 — F-9: Fix the file-storage docs example (this is the audit's #1 security item)

In `docs/content/docs/6.advanced/5.file-storage.md`: rewrite the three example Convex functions so `generateUploadUrl` requires an authenticated user, and `getUrl`/`deleteFile` verify ownership of the `storageId` (store an owner mapping in the example's table, matching however the doc's surrounding example models files — read the whole page first and keep its narrative). Add a prominent callout box:

> **Client validation is UX only.** `maxSize` / `allowedTypes` run in the browser and are trivially bypassed by calling your mutation directly. Enforce authentication, ownership, size, and MIME type inside your Convex functions — the upload URL and every `storageId` are attacker-reachable inputs.

If the playground has a corresponding `files`/storage module, align it with the same auth checks and add a convex-tier test asserting an unauthenticated `generateUploadUrl` call throws. If the playground has no storage backend, state that in the progress log and keep the fix docs-only.

#### P3.2 — F-11: Env-gate the SSR `authError`

In `src/runtime/server/utils/auth-snapshot.ts` (~line 278): wrap the detailed `buildTokenExchangeFailureMessage(...)` so production hydrates a generic string:

```ts
snapshot.authError = import.meta.dev
  ? buildTokenExchangeFailureMessage(/* existing args */)
  : 'Authentication is temporarily unavailable'
```

Keep the detailed message flowing into the server-side log events in BOTH environments (find the `logEvents.push` nearby — details go to logs, not to the client). Unit test: with dev=false simulated, the snapshot error contains none of `BETTER_AUTH_SECRET`, `convex/http.ts`, or the upstream error text (see how `test/unit/auth-proxy-security.test.ts` toggles env, or inject the flag as a parameter if `import.meta.dev` isn't mockable — parameterizing the function is the cleaner fix).

#### P3.3 — F-10: `no-store` on token-bearing SSR responses + docs

In `src/runtime/plugin.server.ts`, where the token is hydrated into state (~lines 145-164): when a non-null token was written, set the response header:

```ts
if (event && snapshot.token) {
  event.node.res.setHeader('Cache-Control', 'private, no-store')
}
```

(Adapt to how the plugin accesses the event — it already has one for cookies; prefer h3's `setResponseHeader(event, ...)` if h3 utils are already imported.) Add a short "Caching authenticated pages" warning section to `docs/content/docs/4.auth-security/1.authentication.md`: never put authenticated routes behind ISR/CDN/shared caches; the SSR payload contains a per-user token. Unit/nuxt test if the harness renders SSR responses; otherwise mark the test part BLOCKED with a note (the header line itself is trivial).

#### P3.4 — F-24: Unauthorized matcher stops guessing

In `src/runtime/utils/auth-unauthorized-core.ts`: remove message-substring heuristics ("authentication", "unauthorized", "not authenticated") and the 403/FORBIDDEN handling. Keep only structured signals: HTTP 401 status where available, and explicit Convex auth error codes/markers (read the current implementation to see which structured fields it already inspects — keep those that are code/status-based, delete those that are prose-based). **Flip the codifying test**: `test/unit/auth-unauthorized.test.ts` currently asserts `'Authentication failed'` (bare string) → true; replace with: bare-string prose → false; "Two-factor authentication required" → false; 403 permission error → false; 401/UNAUTHENTICATED-coded error → true. This intentionally narrows an opt-in feature (default off) — sign-out is a destructive recovery and false positives destroy valid sessions.

#### P3.5 — F-27: Canonical redirects never carry cookies cross-origin

In `src/runtime/server/api/auth/redirect-utils.ts`: in the cross-origin canonical-redirect branch, strip the `cookie` header from the forwarded headers before re-issuing the request (build a copy of `forwardHeaders` without `cookie`). Unit test in `test/unit/auth-proxy-redirect.test.ts` style: drive `fetchWithCanonicalRedirects` with a `fetchImpl` returning `302 Location: https://evil.example/api/auth/get-session` (same path+query, different origin) and assert the second fetch's headers contain no `cookie`. Same-origin redirects keep cookies (add the positive assertion too).

#### P3.6 — F-28: Sign-out clears the server token cache + docs note

Find the auth proxy's sign-out handling (`src/runtime/server/api/auth/[...].ts` — look for the sign-out path or response handling) and call `serverConvexClearAuthCache`-equivalent invalidation for the request's session key when a sign-out request passes through (read `src/runtime/server/utils/auth-cache.ts` for the key derivation — it is `jwt:${hash(sessionToken)}`; clear exactly that key). If the proxy cannot cheaply identify sign-out requests, an acceptable minimal fix is documenting the ≤60s revocation window in `docs/content/docs/6.advanced/7.module-config.md` under `authCache` and marking the code part BLOCKED with your analysis. Do not over-engineer this one.

**Phase 3 gate:** full gate.

---

### Phase 4 — Consolidation (drift-class fixes)

#### P4.1 — F-17: Single source for defaults + config normalization

This is wide but mechanical. Create `src/runtime/utils/config-defaults.ts` exporting a single frozen `CONVEX_MODULE_DEFAULTS` object (every default literal: query defaults, upload `maxConcurrent: 3`, `authCache.ttl: 60` + clamp bounds, body limits `1_048_576`, `authRoute: '/api/auth'`, debug flags, etc.) plus the shared normalizers (`normalizeAuthCacheTtl`, `normalizeMaxConcurrent`, …). Then:

- `src/module.ts`: `defaults:` block and the defu merge (~375-408) consume `CONVEX_MODULE_DEFAULTS` — delete every repeated `?? literal`.
- `src/runtime/utils/runtime-config.ts`: delete its duplicate `normalizeAuthCacheTtl` (~45-51) and clamp copies; import from the new file.
- `src/runtime/composables/useConvexUploadQueue.ts` (~86-90): delete the duplicated clamp; import.
- Delete dead per-composable fallbacks: `useConvexQuery.ts:152-154`'s `?? true` / `?? 'auto'` chains — `NormalizedConvexRuntimeConfig.defaults` is non-optional; keep `options?.x ?? defaults.x` only.
- Delete the dead `declare module 'nuxt/schema'` block in `src/runtime/types.d.ts` (~89-102). Run `pnpm test:types` + `pnpm check:consumer-smoke` immediately after — if the consumer fixture typecheck breaks, the block was not dead: restore it and mark BLOCKED with the error.

Acceptance: `rg -n "1_048_576|maxConcurrent.*3|ttl.*60" src/` shows each default defined exactly once (in the new file); `test/unit/runtime-config.test.ts`, `convex-config.test.ts` green (update imports, not expectations).

#### P4.2 — F-16: Runtime env reads deleted

In `src/runtime/utils/runtime-config.ts` (~60-61): delete the `process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL` runtime fallback (Nuxt's native `NUXT_PUBLIC_*` runtime override already handles it; `CONVEX_URL` becomes build-time only). Document in `7.module-config.md`: "`CONVEX_URL` is read at build time. For deploy-time overrides use `NUXT_PUBLIC_CONVEX_URL`." Acceptance: `rg "process.env" src/runtime` → no hits outside logger/dev guards; `runtime-config.test.ts` updated if it tested the fallback (update the test to assert the new contract, note in progress log).

#### P4.3 — F-13: One token resolver

Consolidate the three cookie→JWT exchange implementations: keep the `server/utils/` one as canonical (it has timeout + nitro cache). `fetchAuthToken` in `convex-cache.ts` (~260-298) must STOP performing its own `$fetch` exchange: SSR queries run after `plugin.server.ts` has already exchanged and written `useState('convex:token')` — so reduce `fetchAuthToken` to "return `cachedToken.value` if the request has a Better Auth session cookie, else undefined" and delete its `$fetch` branch. Read `plugin.server.ts` first to confirm ordering (plugin runs before route components' setup — it does; Nuxt plugins precede page setup). Server-route resolver (`server/utils/convex.ts:44-113`) and snapshot resolver (`auth-snapshot.ts`) share the exchange helper — extract the common `exchangeSessionForToken(siteUrl, cookieHeader, { timeout, cache })` into `server/utils/` and have both call it. Do not change any external behavior contract: `pnpm vitest run --project=unit test/unit/convex-cache-auth-token.test.ts test/unit/server-convex-utils.test.ts` plus the auth-snapshot tests must pass (update mocks, not assertions — if an assertion must change, it means SSR queries previously exchanged tokens themselves; assert the new single-exchange contract instead and note it).

#### P4.4 — F-25: One `convex:pending` default

Add `useConvexAuthPendingState()` (internal helper, e.g. in `src/runtime/utils/` or the auth dir): `useState<boolean>('convex:pending', () => import.meta.client)` — client starts pending (auth unknown), server starts settled (plugin.server writes the truth before render). Replace the three divergent `useState('convex:pending', ...)` initializers (`plugin.client.ts:89` `()=>true`, `useConvexAuth.ts:122`, `useConvexQuery.ts:185` + `useConvexPaginatedQuery.ts:298` `()=>false`) with the helper. **Risk note:** the effective initial value today depends on touch order; unifying may change auth-flicker behavior — run ALL nuxt-tier auth tests (`useConvexAuth`, `auth-pending`, query gate tests) and the new P1.1 test; if any legitimately disagrees with `import.meta.client` as the default, STOP and mark BLOCKED with the failing test name (the reviewer decides the default; do not pick a different one to make tests pass).

#### P4.5 — F-12: `useConvexCall` narrowed

In `src/runtime/composables/useConvexCall.ts`: remove the `timeoutMs` option for mutations and actions entirely (a "timed-out" mutation still commits server-side — the API invited double-submits). Keep timeout for queries only if trivially separable; otherwise delete the timeout feature wholesale (preferred — delete > simplify). Route unauthorized errors through `handleUnauthorizedAuthFailure` like `useConvexMutation` does (~`useConvexMutation.ts:274-321` for the pattern). Update `test/nuxt/convex-call.nuxt.test.ts` / contract tests, docs page `6.advanced` client-access, and regenerate the api-surface doc if option types are listed there. If `timeoutMs` removal breaks consumer-smoke, update the fixture (it is our fixture, not a consumer).

#### P4.6 — F-20: Delete the `./composables` subpath

Remove `./composables` from `package.json` `exports` and `typesVersions`. Run `rg -n "better-convex-nuxt/composables" . --glob '!node_modules'` — expect only the lint guard mentioning it; if real imports exist anywhere (starters/tests), migrate them to auto-imports first. Then `node scripts/check-package-exports.mjs` must pass (it validates the map against files — deleting an entry is safe for it; confirm). Keep `src/runtime/composables/index.ts` itself (module internals import from it).

#### P4.7 — F-26: WS timeout configurable + paginated refresh continuity + `refresh()` docs

- (a) Thread a `waitTimeoutMs`-style option from `convex.defaults` (add to defaults object in P4.1's new file, default 10_000) into `waitForQueryBridgeData` call sites; delete the duplicated timeout message in `useConvexPaginatedQuery.ts:578-581` by passing `timeoutMessage`.
- (b) In `useConvexPaginatedQuery.ts` `refresh()` (~827-864): re-fetch pages **sequentially**, feeding each page's fresh `continueCursor` into the next page's fetch instead of replaying stale stored cursors in parallel. Preserve page sizes (`numItems` per page as originally requested). Add the boundary test: seed two pages via mock, insert an item into page 1's range, `refresh()`, assert the concatenated list is gapless and ordered (follow the existing mock patterns in `test/nuxt/useConvexPaginatedQuery.nuxt.test.ts`). **This is the second-hardest change in the plan after Phase 1 — read the whole refresh + page-state code path first, and if the page-state model doesn't match this description, mark BLOCKED rather than guessing.**
- (c) Docs: in the queries page, document that `refresh()` on a subscribe-mode query is a no-op by design (the WebSocket is authoritative); recommend `subscribe: false` + `refresh()` for poll-style usage.

**Phase 4 gate:** full gate.

---

### Phase 5 — Architecture cut (docs / playground / starters)

Pre-authorized deletions in this phase (and ONLY these): `starters/vertical-ai/` (entire directory), `docs/installation2.md`, `playground/convex/organizations.ts`, `playground/convex/invites.ts`, empty dirs `starter/` and `apps/`, stray root `.DS_Store` files, `agentic-saas-console.log`, `mcp-agent-console-before.log`.

#### P5.1 — F-6: Rewrite the permissions docs track on Better Auth Organization

The core contradiction: `docs/content/docs/4.auth-security/1.authentication.md:274` forbids mirroring Better Auth tables; `0.permissions-setup.md:85-106`, `1.guide/4.permissions.md` (~99), and `3.standard-role-template.md` teach exactly that (app-owned `organizations` table + `role` column on `users`).

Rewrite those three pages (and `2.permissions.md` where it references the old model) so that:

- Roles/org membership are read from **Better Auth** (organization plugin / `auth.api.hasPermission` / admin-plugin roles) — never from an app-owned `role` column or `organizations` table.
- The permission-context Convex query reads Better Auth component state, exactly as `starters/team/convex/auth.ts` and `starters/agentic-saas` do — **use those starters as the reference implementation and copy their patterns into the docs**, don't invent new ones.
- Every "add this to your schema" snippet that created org/role tables is deleted, not annotated.
- The "frontend checks are UX only" framing from `2.permissions.md:16-22` is preserved verbatim — it is exemplary.

Add a guard: extend the doc-lint approach with a check that `docs/content` contains no `organizations: defineTable` and no `role: roleValidator` (add to the consolidated guard script if P5.5 is done, else a new package.json check mirroring the existing `check:no-*` pattern).

**This is content work a reviewer will scrutinize hardest. Keep pages teaching ONE model. If you cannot make a section work without inventing an API that doesn't exist in the starters, mark that section BLOCKED and leave a TODO comment rather than inventing.**

#### P5.2 — F-7a/b: Delete `starters/vertical-ai`; strip the playground

- `git rm -r starters/vertical-ai`.
- Playground: delete `playground/convex/organizations.ts`, `playground/convex/invites.ts`; remove the `organizations` table, `role`, and `organizationId` fields from `playground/convex/schema.ts`; delete/fix every playground page, component, composable, middleware, and convex test that referenced them (run `rg -ln "organizations|invites|roleValidator|organizationId" playground/` and work through the list). The playground's job after this: demo queries/pagination/mutations/uploads/auth/permissions-display — integration primitives only. The permission demo should consume the same Better Auth pattern as the docs now teach; if the playground lacks Better Auth org wiring, demo `createPermissions` against a minimal context query (signed-in flags only) and note it.
- Update `test/unit/starter-organization-ownership.test.ts`: remove `vertical-ai` from the `appOwnedOrganizationStarters` allowlist (~line 9). Leave `agency`/`mcp-agent` grandfathered — their rebase is out of scope for this run (audit "Next" bucket).
- `pnpm test` MUST stay green — playground convex tests are part of CI; migrate/delete tests tied to deleted modules (deleting a test of a deleted feature is sanctioned here — list every deleted test file in the progress log).

#### P5.3 — F-8: Fix the api-surface generator's broken example

In `scripts/generate-api-surface.mjs` (~line 317): the hardcoded example imports `createUserSyncTriggers` from `#convex/server` — it is not exported there. Change the example to import only `serverConvexQuery` from `#convex/server`, and add a separate documented snippet for `createUserSyncTriggers` via its real subpath `better-convex-nuxt/server/createUserSyncTriggers`. Run `node scripts/generate-api-surface.mjs` and commit the regenerated `docs/content/docs/6.advanced/8.api-surface.md`. Also fix the type-name typo in `7.module-config.md:42` (`AuthProxyOptions` → `AuthProxyDefaults`).

#### P5.4 — F-21: "Proven Locally" claims cut to provable

In `docs/content/docs/8.architecture/2.ai-agents-and-mcp.md` (~84-229): every claim under "Proven Locally" either (a) names a runnable command in this repo that proves it, or (b) moves to a clearly-labeled "Research notes (unverified in this repo)" subsection. Do not delete content — relabel and restructure. Do not touch `starters/platform-auth` code (its tests are the audit's "Next" bucket).

#### P5.5 — F-29/F-40: Repo hygiene + starter status truth

- Delete: `docs/installation2.md` (then remove its mention from the `check:no-legacy-generated-api-imports` script line in `package.json`), empty `starter/` and `apps/` dirs, root `.log` files, `.DS_Store`s. Add `.DS_Store` to `.gitignore` if absent.
- Replace `starters/IMPLEMENTATION_STATUS.md` and `starters/README.md` with ONE accurate `starters/README.md`: a table of the starters that actually exist after P5.2 (public, team, agentic-saas, agency, mcp-agent, platform-auth), each with a one-paragraph "owns / does not own" statement and an honest status column (team + agentic-saas = canonical/Better-Auth-org; agency + mcp-agent = legacy org model, pending rebase; platform-auth = experimental, untested).
- Root strategy memos: do NOT delete content. Create `research/` ledger moves only if trivial (`git mv new-direction.md research/` etc. for `new-direction.md`, `learnings.md`, `verification-loop.md`), keep `final-vnext.md`, `roadmap.md`, `grilling-decisions.md`, `ai-learnings.md` at root untouched (the maintainer decides their fate — too much judgment for this run). Update any relative links you break (`rg -n "new-direction|verification-loop|learnings.md" README.md docs/ *.md`).

**Phase 5 gate:** full gate + `pnpm lint` (all guard scripts — several reference paths you just changed; fix guard regexes that now point at deleted files).

---

### Phase 6 — P3 cleanup batch (small, independent; one commit each)

| ID           | Fix                                                                                                                                                                                                                                                                                                                                                   | File(s)                                                                                                    | Test                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P6.1 (F-30)  | `onSuccess`/`onError` only fire when the requestId commit succeeded (superseded/reset calls fire neither)                                                                                                                                                                                                                                             | `useConvexMutation.ts:284-298`, `useConvexAction.ts:167-197`, `utils/call-state.ts` (use its return value) | extend `call-state.test.ts`                                                                                                        |
| P6.2 (F-31)  | Delete the `LIMIT_*:` message-prefix special case (app convention in core)                                                                                                                                                                                                                                                                            | `utils/call-result.ts:10,33-56`                                                                            | update `call-result-types.test.ts`; grep starters/playground for reliance and migrate them to plain error messages                 |
| P6.3 (F-32)  | On queue halt, settle still-`queued` items to `'cancelled'` so a later `enqueue` can't resurrect them                                                                                                                                                                                                                                                 | `useConvexUploadQueue.ts:152-158,287-289`                                                                  | extend `upload-queue-state.test.ts`                                                                                                |
| P6.4 (F-33)  | `parseConvexResponse`: treat as error only when `status === 'error'` (a payload legitimately containing `code` must not throw)                                                                                                                                                                                                                        | `utils/convex-shared.ts:180`                                                                               | unit test with `{ status:'success', value:{ code:'x' } }`                                                                          |
| P6.5 (F-14)  | Upload guard: reject a second `upload()` while `_status === 'pending'`; create the AbortController BEFORE the URL-request mutation; check `signal.aborted` after the mutation resolves (cancel during URL phase leaves state `'idle'`, no XHR)                                                                                                        | `useConvexFileUpload.ts:242-251,268,330`                                                                   | two new nuxt tests (concurrent reject; cancel-during-URL)                                                                          |
| P6.6 (F-34)  | Delete dead identical `!subscribeRealtime` branch (`useConvexPaginatedQuery.ts:909-915`); replace the `useConvexAuth.ts:127-138` throwaway-engine fallback with a thrown descriptive error; keep the `setTimeout(0)` re-attach in `useConvexQuery.ts:588-594` but pin it with a regression test if one doesn't exist (structural fix is out of scope) | as listed                                                                                                  | suite green                                                                                                                        |
| P6.7 (F-35)  | One disable dialect: `defineSharedConvexQuery` args accept `'skip'` (add to its `Args` union) and docs mention only `'skip'`; keep `null/undefined` accepted at runtime for back-compat but remove them from the public type                                                                                                                          | `defineSharedConvexQuery.ts:74,95`                                                                         | type test                                                                                                                          |
| P6.8 (F-36)  | Import `ConnectionState` from `convex/browser` and delete the local duplicate + casts; type `getQueryKey` args as `FunctionArgs<Query>` (generic); make `AuthCacheOptions.enabled` optional; reuse `ConvexQueryAuthMode` in `QueryDefaults.auth`                                                                                                      | `useConvexConnectionState.ts:97,100`, `convex-shared.ts:278`, `module.ts`                                  | `test:types` + contracts                                                                                                           |
| P6.9 (F-37)  | Exclude devtools UI sources and `dist/runtime/server/tsconfig.json` from the published dist (adjust build config/ignore lists so only `devtools/ui/dist` static output ships)                                                                                                                                                                         | build config / `.npmignore`-equivalent in module-builder config                                            | `pnpm prepack` + `node scripts/check-package-exports.mjs --dist` green; verify `dist/runtime/devtools/ui/app.vue` no longer exists |
| P6.10 (F-38) | Document (or fix) defu array-concat for `trustedOrigins` set in both `convex:{}` and `runtimeConfig.public.convex` — pick documenting in `7.module-config.md` unless the fix is a one-liner with tests                                                                                                                                                | `module.ts:375`, docs                                                                                      | note in docs                                                                                                                       |
| P6.11 (F-39) | Replace the logged user email with a truncated user id in the debug auth log                                                                                                                                                                                                                                                                          | `server/utils/auth-snapshot.ts:262`                                                                        | grep: no `.email` in log call sites                                                                                                |
| P6.12 (F-42) | `createUserSyncTriggers`: add a test for `onUpdate` arriving before `onCreate` (assert current no-op behavior explicitly + document it in the function's JSDoc)                                                                                                                                                                                       | `server/createUserSyncTriggers.ts`, `test/unit/create-user-sync-triggers.test.ts`                          | new test                                                                                                                           |

---

## 3. Final Gate

All must pass from repo root, in this order:

```bash
pnpm lint
pnpm format:check
pnpm test:types
pnpm check:contracts
pnpm test                                    # count ≥ baseline + all new regression tests
node scripts/generate-api-surface.mjs --check
pnpm prepack
node scripts/check-package-exports.mjs --dist
```

Then finish `refactor-progress.md` with: baseline vs final test counts, table of all tasks (DONE/BLOCKED/SKIPPED + commit), list of every deleted file, list of every test whose assertions changed (with one-line justification each), and open questions for the reviewer. Do not merge, push, tag, or publish.

---

## 4. Where you are most likely to go wrong (read twice)

1. **Phase 1 watcher interplay.** Both watchers in `useConvexQuery.ts` fire on the same auth transition. The cornerstones are designed so double-firing is harmless (idempotent acquire, self-guarded setup). If you "deduplicate" the watchers you will break the sign-in resubscribe path. Don't.
2. **The nuxt test harness defaults to `auth:'none'`** — which is exactly why F-1 shipped undetected. Your P1 regression tests MUST run with module auth enabled and `auth:'auto'` queries, or they test nothing.
3. **`clearNuxtData` vs public queries (P1.3).** The `liveKeys` exclusion set is what keeps mounted public queries from blanking on sign-out. If you drop it, F-2's fix is undone from the other side.
4. **Detached scope ≠ detached context (P1.4).** `effectScope(true)` changes effect ownership only; `useNuxtApp()`/`useState` still work because the factory runs during a consumer's setup. Do not move creation out of the call path (e.g. into a plugin) — that changes SSR semantics.
5. **F-5 inference.** The conditional rest-tuple must keep `Args` inferable from the first rest element. Probe with the fixture's real generated types (`test/fixtures/consumer-smoke`), not hand-written `FunctionReference` literals only. If inference degrades, use the sanctioned plan B (overloads).
6. **Paginated refresh (P4.7b).** Sequential cursor-chaining changes a `Promise.all` into a loop — preserve error semantics (a failed page must not leave the page array half-swapped; build the new pages array fully, then commit atomically).
7. **Token resolver consolidation (P4.3).** The invariant is "one exchange per request, performed by plugin.server / server-route helper". If a test starts failing because SSR queries no longer self-exchange, that test was pinning the bug — update it to the new contract and log it; don't reintroduce the exchange.
8. **Guard scripts reference paths you will delete (Phase 5).** After deleting `docs/installation2.md` and `starters/vertical-ai`, run `pnpm lint` and fix the `check:no-*` script regexes in `package.json` that name them.
9. **Never widen a type to fix a compile error.** If a Phase 2 change breaks an internal file, the fix is at the call site or the internal signature — casts and `any` are forbidden (Invariant 1.3.5).
10. **Docs rewrites (P5.1) copy patterns from `starters/team`/`agentic-saas`** — they are the proven reference. Inventing new auth patterns in docs is the failure mode that caused F-6 in the first place.
