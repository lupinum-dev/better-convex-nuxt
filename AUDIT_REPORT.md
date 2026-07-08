# better-convex-nuxt — Audit Report

**Date:** 2026-07-08 · **Version audited:** 0.4.0 (branch `main`, clean at `eef25d41`)
**Method:** Four independent reviewers (API/Types, Runtime, Security, Product Architecture) over non-overlapping areas, reconciled by an orchestrator; full deterministic verification suite executed locally. Two P1 runtime findings were **confirmed with failing reproduction tests** against the real Nuxt test harness; the P1 type hole was **confirmed with a tsc probe against the built dist**. E2E was not run (requires a live Convex deployment and `playground/.env.local`, unavailable in this environment).

---

## 1. Executive Verdict

**Production-readiness: Not yet. Solid core, two confirmed realtime-lifecycle P1 bugs, one confirmed P1 type hole, and a teaching layer (docs/playground/3 starters) that actively contradicts the product's own architecture.**

**Library status.** The core `src/` package is genuinely good: a single query core reused by every data-shaped composable, an auth proxy whose origin matching, body limits, cookie filtering, and token cache survived adversarial attack attempts, a best-in-ecosystem `CallResult` envelope, an auto-import registry that mechanically generates its own docs, and 510 passing tests across four deterministic tiers. But the sign-out/signed-in lifecycle is broken in two confirmed ways (signed-out visitors open unauthenticated WS subscriptions under a shared cache key; sign-out permanently freezes all public realtime queries), the payload cache retains the previous user's private data across sign-out, and the most common consumer mistake — omitting required query args — compiles cleanly.

**Product direction.** The thesis ("core owns integration primitives; starters/recipes own product semantics; Better Auth owns identity; Convex owns product data") **holds in core and breaks one layer out**. The repo simultaneously contains four competing org/member/role models: Better Auth Organization as sole truth (`starters/team`, `starters/agentic-saas` — correct), app-owned Convex org tables (`agency`, `vertical-ai`, `mcp-agent`), app-owned org + role-column-in-users (playground), and — worst — the same forbidden model **taught in the published permissions docs**, one page away from the auth doc that explicitly forbids it. The strategy memos (`roadmap.md:17-19`, `final-vnext.md:49`) already prescribe the fix ("If we cut over, we delete the old path"); it simply hasn't been executed. Execute the cut: fix the four runtime/type P1s, rewrite the permissions docs track on Better Auth Organization, strip the playground, delete `starters/vertical-ai`, and this becomes a credible 0.5.

**Top 5 risks (ranked):**

1. **Signed-out visitors open unauthenticated WS subscriptions under a shared `convex:idle:*` key** — confirmed by repro; guaranteed server auth errors, args cross-wiring, and (with `unauthorized.includeQueries`) sign-out/redirect loops on pages that should render signed-out. (F-1)
2. **Sign-out silently freezes every public (`auth: 'none'`) realtime query** — confirmed by repro; silent staleness is the worst failure mode for a realtime library. Compounded by the payload cache retaining the prior user's private data. (F-2, F-3)
3. **The docs permissions track teaches the forbidden app-owned org/role model**, contradicting `4.auth-security/1.authentication.md:274` in the same section; every user following the flagship guide builds the split-brain tenancy the product exists to prevent. (F-6)
4. **Required Convex args are optional in `useConvexQuery`/`useConvexPaginatedQuery`/`useConvexUser`/`serverConvex*`** — confirmed by tsc probe against dist; the day-one consumer mistake type-checks and fails at runtime, while mutations/actions catch it. (F-5)
5. **The file-storage docs ship a fully unauthenticated backend example** (`generateUploadUrl`/`deleteFile`/`getUrl` with no auth/ownership) and never state that client MIME/size validation is UX-only — copy-pasters ship anonymous upload and delete-any-file. (F-9)

**Top 5 deletion/simplification opportunities (ranked):**

1. **Delete `starters/vertical-ai`** — a superseded fork of `agentic-saas` with the forbidden org model, no `auth.ts`/`http.ts`, and a `users` table with no populator (latent bug). ~620 LOC, 4 tests.
2. **Strip the playground to integration-primitive demos** — delete `playground/convex/organizations.ts`, `invites.ts`, and the `role`/`organizationId` columns; move product-permission tests onto `starters/team`.
3. **Delete the `./composables` package subpath** — published but undocumented, and the repo's own lint (`check:no-stale-doc-imports`) _bans docs from mentioning it_. Surface without an owner.
4. **Consolidate the ~370 KB of root strategy memos** (7 files, mutually contradictory) into one current memo + `/research/` ledgers; delete `docs/installation2.md`, `starter/`, `apps/`, root `.log`/`.DS_Store` cruft.
5. **Single-source module defaults** — every default literal currently exists 2–4× across `module.ts`, `runtime-config.ts`, and per-composable fallbacks (`normalizeAuthCacheTtl` is duplicated verbatim); one `DEFAULTS` const + one normalizer.

---

## 2. Scorecard

| Area                                 | Rating    | Confidence | Evidence                                                                                                                                                                                                                             | Main Risk                                                                  |
| ------------------------------------ | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Product boundary                     | **Risky** | High       | Core clean (`src/` has no product semantics); docs/playground/3 starters violate (`docs/content/docs/4.auth-security/0.permissions-setup.md:85-106`, `playground/convex/schema.ts:16,38`, `starters/{agency,vertical-ai,mcp-agent}`) | Users copy the forbidden org model from the flagship docs                  |
| Public API                           | Usable    | High       | Registry-driven auto-imports (`src/module-api-surface.ts`), contract scripts green; `./composables` undocumented+banned, api-surface doc example broken                                                                              | API drift on undocumented subpath; broken doc example                      |
| TypeScript types                     | Usable    | High       | Strong: `OptionalRestArgs` mutations, `CallResult`, discriminated user state; confirmed args-arity hole in query family (F-5)                                                                                                        | Day-one runtime failures that types should catch                           |
| Module config                        | Usable    | High       | Config shape/defaults defined 3–4× (`module.ts:154-319`, `runtime/utils/runtime-config.ts`, `runtime/types.d.ts:14-57`, composable fallbacks)                                                                                        | Silent default drift; runtime env divergence (F-16)                        |
| SSR/realtime queries                 | **Risky** | High       | Two confirmed repro failures (F-1, F-2); dedup/refcount/hydration otherwise well-tested (26 nuxt cases)                                                                                                                              | Signed-out subscription bug; frozen queries after sign-out                 |
| Mutations/actions/optimistic updates | Strong    | High       | Best types in repo; 10 optimistic unit tests; race-guarded state                                                                                                                                                                     | Callback firing on superseded calls (P3); no bridge-level integration test |
| Auth/security                        | Usable    | High       | Origin matching, body limits, cookie filtering, token cache all adversarially verified safe; prod `authError` leak (F-11), CDN-caching guidance absent (F-10)                                                                        | Misconfigured CDN caching of token-bearing HTML                            |
| Permissions                          | Usable    | High       | Boundary docs exemplary ("Never trust the frontend", `2.permissions.md:16-22`); `TContext` untied to query type (F-18); wrong model in setup docs (F-6)                                                                              | Silent wrong-shape permission context; docs teach split-brain roles        |
| Upload/storage                       | **Risky** | High       | Unauth docs example (F-9); broken concurrency guard + cancel window (F-14); `useConvexStorageUrl` untyped, hardcodes `auth:'none'` (F-15)                                                                                            | Copy-pasted open storage backend                                           |
| Server utilities                     | Usable    | High       | `auto/required/none` policy coherent and safe by default; third parallel token-resolution impl (F-13)                                                                                                                                | Server-route vs SSR auth drift                                             |
| Devtools                             | Strong    | High       | Hard `import.meta.dev` gates, traversal-safe static serving, recorder stores no secrets, registries throw on server import                                                                                                           | Nested Nuxt app doubles build toolchain (accepted)                         |
| Docs                                 | **Risky** | High       | Contradictory permissions track (F-6), broken api-surface import (F-8), ~40 unverified "Proven Locally" claims (F-21), file-storage example (F-9)                                                                                    | Docs are the primary vector for every architecture violation found         |
| Starters                             | **Risky** | High       | 3 of 7 mirror Better Auth org state; `vertical-ai` superseded; status docs list a set that no longer exists                                                                                                                          | Users pick a violating starter; contributor confusion                      |
| Tests/verification                   | Usable    | High       | 510/510 green across 4 tiers; but both runtime P1s were invisible to the suite (harness defaults to `auth:'none'`), and consumer type contracts are positive-space only                                                              | Green CI ≠ lifecycle invariants held                                       |
| Packaging/release                    | Usable    | High       | `prepack` green, dist export validation 310 files; ships devtools UI _sources_ + stray `dist/runtime/server/tsconfig.json`; format drift in 101/660 files                                                                            | Minor dist cruft; release script assumes format-clean tree                 |
| Maintainability                      | Usable    | Medium     | 15,438 LOC src; single query core (good); 953-line paginated composable, 598-line logger, 7 negative-grep guards as scar tissue                                                                                                      | Teaching-surface duplication is where contributors will go wrong           |

---

## 3. Public Surface Inventory

Verified in sync: `package.json` `exports` ↔ `typesVersions` (by `check-package-exports`, 100 src / 310 dist files); auto-import registry ↔ docs (by `generate-api-surface.mjs --check`).

### 3.1 Package exports

| Export                                                                                                                                                                           | Kind              | Source                                         | Docs                                    | Tests                                                     | Type Quality                       | Verdict                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | ---------------------------------- | ----------------------------- |
| `.` (module + `ModuleOptions`, `AuthCacheOptions`, `QueryDefaults`, `UploadDefaults`, `AuthProxyDefaults`, `ConvexDebugOptions`, `LogLevel`, `ConvexAuthPageMeta`, `ConvexUser`) | Nuxt module entry | `src/module.ts`                                | `6.advanced/7.module-config.md`         | consumer-smoke typecheck; `use-convex-user-types.test.ts` | B (config shape triplicated, F-17) | Keep                          |
| `./composables` (all composables + ~40 types + `normalizeConvexError`, `resolveBetterConvexAuthBaseURL`)                                                                         | subpath           | `src/runtime/composables/index.ts`             | **None — docs lint bans mentioning it** | none direct                                               | B                                  | **Delete or document** (F-20) |
| `./server` (`serverConvexQuery/Mutation/Action`, `ServerConvexOptions`, `serverConvexClearAuthCache`)                                                                            | subpath           | `src/runtime/server/index.ts`                  | api-surface.md (via `#convex/server`)   | `server-index-exports.test.ts`, consumer-smoke            | B (args hole F-5)                  | Keep; state non-Nuxt intent   |
| `./server/createUserSyncTriggers`                                                                                                                                                | subpath           | `src/runtime/server/createUserSyncTriggers.ts` | `1.guide/3.auth.md`                     | `create-user-sync-triggers.test.ts`                       | A−                                 | Keep                          |

### 3.2 Aliases

| Alias            | Points to                                                                             | Docs                                                                                          | Tests                                              | Verdict                                |
| ---------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------- |
| `#convex/api`    | app `convex/_generated/api` or typed throwing placeholder (`src/module-templates.ts`) | api-surface.md                                                                                | `check:missing-convex-api` fixture; consumer-smoke | Keep — placeholder design is excellent |
| `#convex/server` | `runtime/server/index`                                                                | api-surface.md — **example imports `createUserSyncTriggers`, which it does not export** (F-8) | consumer-smoke                                     | Keep alias; fix docs                   |

### 3.3 Auto-imports (registry: `src/module-api-surface.ts`)

| Name                                                                                                                                          | Kind               | Source                                                  | Docs                                    | Tests                                                     | Type Quality                                                                                                   | Verdict                     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `useConvexQuery`, `getQueryKey`                                                                                                               | composable/helper  | `useConvexQuery.ts`                                     | 2.data-fetching                         | nuxt suite, `query-options-types.test.ts`, consumer-smoke | B — args hole (F-5); `error` typed `Ref<Error\|null>` but holds `undefined` (F-19); `getQueryKey` args untyped | Change                      |
| `defineSharedConvexQuery`                                                                                                                     | helper             | `defineSharedConvexQuery.ts`                            | 2.data-fetching/caching-reuse           | nuxt test, consumer-smoke                                 | B+ — different skip dialect (`null\|undefined`, no `'skip'`)                                                   | Change (lifecycle F-4)      |
| `useConvexPaginatedQuery` + `insertAtTop`, `insertAtPosition`, `insertAtBottomIfLoaded`, `updateInPaginatedQuery`, `deleteFromPaginatedQuery` | composable/helpers | `useConvexPaginatedQuery.ts`, `optimistic-updates.ts`   | 2.data-fetching/pagination, 3.mutations | nuxt + unit tests, consumer-smoke                         | A− helpers; B composable (F-5)                                                                                 | Keep/Change                 |
| `useConvexMutation` + `updateQuery`, `setQueryData`, `updateAllQueries`, `deleteFromQuery`                                                    | composable/helpers | `useConvexMutation.ts`, `regular-optimistic-updates.ts` | 3.mutations                             | nuxt + `call-result-types.test.ts`                        | **A — best in repo** (`OptionalRestArgs`, callable+state intersection, `safe`)                                 | Keep                        |
| `useConvexAction`                                                                                                                             | composable         | `useConvexAction.ts`                                    | 3.mutations/actions                     | nuxt + type tests                                         | A                                                                                                              | Keep                        |
| `useConvexCall`                                                                                                                               | composable         | `useConvexCall.ts`                                      | 6.advanced/client-access                | contract test                                             | A− types; runtime timeout hazard (F-12)                                                                        | **Shrink**                  |
| `useConvex`                                                                                                                                   | composable         | `useConvex.ts`                                          | 6.advanced/client-access                | indirect                                                  | A                                                                                                              | Keep                        |
| `useConvexConnectionState`                                                                                                                    | composable         | `useConvexConnectionState.ts`                           | 6.advanced/connection-state             | nuxt test                                                 | B — local `ConnectionState` duplicate + cast                                                                   | Change                      |
| `useConvexFileUpload`                                                                                                                         | composable         | `useConvexFileUpload.ts`                                | 6.advanced/file-storage                 | nuxt test, consumer-smoke                                 | B+                                                                                                             | Change (F-14)               |
| `useConvexUploadQueue`                                                                                                                        | composable         | `useConvexUploadQueue.ts`                               | 6.advanced/file-storage                 | unit + nuxt tests                                         | A− (`enqueueSafe` consistent)                                                                                  | Keep (P3 halted-resurrect)  |
| `useConvexStorageUrl`                                                                                                                         | composable         | `useConvexStorageUrl.ts`                                | 6.advanced/file-storage                 | smoke only                                                | **C** — untyped query ref, hardcoded arg name + `auth:'none'`                                                  | **Change or delete** (F-15) |
| `useConvexAuth` (auth-gated)                                                                                                                  | composable         | `useConvexAuth.ts`                                      | 4.auth-security                         | nuxt + engine tests                                       | B+ (augmentation works, untested — F-22)                                                                       | Keep                        |
| `useConvexUser` (auth-gated)                                                                                                                  | composable         | `useConvexUser.ts`                                      | 4.auth-security                         | discriminated-state type test                             | A− union; B entry (F-5)                                                                                        | Keep/Change                 |
| `createBetterConvexAuthClient` (auth-gated)                                                                                                   | factory            | `createBetterConvexAuthClient.ts`                       | 4.auth-security                         | plugin-tuple type test, consumer-smoke                    | A−                                                                                                             | Keep                        |
| `createPermissions` (permissions-gated)                                                                                                       | factory            | `usePermissions.ts`                                     | 4.auth-security/permissions             | nuxt test, consumer-smoke                                 | **C+** — `TContext` untied to query (F-18); `pending` mis-typed                                                | Change                      |
| `serverConvexQuery/Mutation/Action`                                                                                                           | server helpers     | `server/utils/convex.ts`                                | 5.server-side                           | unit + consumer-smoke                                     | B (F-5)                                                                                                        | Change                      |
| `serverConvexClearAuthCache`                                                                                                                  | server helper      | `server/utils/auth-cache.ts`                            | 6.advanced/performance                  | indirect                                                  | A−                                                                                                             | Keep                        |

### 3.4 Components and options

- **Components** (auth-gated, global): `ConvexAuthenticated`, `ConvexUnauthenticated`, `ConvexAuthLoading`, `ConvexAuthError` — typed slots via `defineSlots`; documented; Keep.
- **Module options**: `url`, `siteUrl`, `auth.*`, `authRoute`, `trustedOrigins`, `skipAuthRoutes`, `permissions`, `logging`, `authCache.*`, `defaults.{server,subscribe,auth}`, `upload.*`, `authProxy.*`, `debug.*` — all documented in `7.module-config.md` (one type-name error: doc says `AuthProxyOptions`, export is `AuthProxyDefaults`). Defaults secure (same-origin only, caches/debug/permissions/unauthorized-recovery all off). Drift analysis in §4 F-17 and the module-config table in §6.
- **Internal-but-reachable**: `createConvexQueryState`, `createConvexPaginatedQueryState` (file-level exports, not in index — acceptable seams). Devtools modules are dev-only dynamic imports, never exported — correctly internal. Auth-gated auto-imports are conditional in `module.ts:459-467`, but the `./composables` subpath bypasses gating (minor; degrades at runtime).

---

## 4. Findings

No P0s: no exploitable security hole was found in shipped code paths (the P1 security finding is in documentation users copy), and the package builds, typechecks, and passes its suite.

### P1 findings

#### P1 (F-1): Signed-out auth transition opens an unauthenticated WS subscription under a shared "idle" cache key — CONFIRMED

- Evidence: `src/runtime/composables/useConvexQuery.ts:598-615` — the `waitForAuth` watcher calls `setupSubscription()` whenever `waitForAuth` flips true→false, **including when auth settles to signed-out**. `setupSubscription` (`useConvexQuery.ts:521-559`) checks only `waitForAuth` and skip — never `executionGate.value.setupLiveSubscription`/`resolveAsIdle`. `getCacheKey()` (`useConvexQuery.ts:199-203`) returns `convex:idle:${fnName}` when `resolveAsIdle`, a key shared by every instance of that function regardless of args (`acquireQuerySubscription` dedupes by key, `src/runtime/utils/convex-cache.ts:191-218`). **Reproduced**: a temp nuxt-harness test (auth enabled, `auth:'auto'`, pending→false with no token) expected 0 `onUpdate` calls, got 1.
- Impact: Signed-out visitors on CSR-first loads (or after failed sign-in) open token-less WS subscriptions for private queries → guaranteed server auth errors; two same-function/different-args queries in this state share one bridge (args cross-wiring); with `unauthorized.includeQueries` enabled this feeds `handleUnauthorizedAuthFailure` → signOut+redirect loops on pages that should render signed-out.
- Root cause: Two overlapping watchers with different gate checks; the idle cache key doubles as a real subscription key. The execution gate (`query-execution-gate.ts`) exists but is bypassed by a parallel code path.
- Recommendation: `setupSubscription()` must early-return unless `executionGate.value.setupLiveSubscription`; delete the second watcher (fold `waitForAuth` transitions into the existing `{hash, skipped, pendingReason}` watcher — `pendingReason` already changes on every transition). Never call `acquireQuerySubscription` while `resolveAsIdle`.
- Acceptance criteria: Regression test (the repro): with auth pending→signed-out and `auth:'auto'`, zero `onUpdate` calls occur; no subscription is ever registered under a `convex:idle:*` key; existing 26-case nuxt suite stays green.
- Source-of-truth check: Protects one — restores the execution gate as the single subscription decision point.

#### P1 (F-2): `signOut` kills ALL shared subscriptions; public `auth:'none'` live queries silently freeze — CONFIRMED

- Evidence: `src/runtime/auth/client-engine.ts:507,529` calls `clearSubscriptionCache(nuxtApp)` (unsubscribes and clears every entry, `convex-cache.ts:363-371`). `useConvexQuery`'s resubscribe watcher (`useConvexQuery.ts:564-596`) fires only on `argsHash/skipped/pendingReason` changes — none change for `auth:'none'` queries on sign-out. The component-local `registeredCacheKey` still points at the dead entry, so it believes it is subscribed. **Reproduced**: temp test calling `clearSubscriptionCache` against a mounted `auth:'none'` query — no resubscription; subsequent emits never reached the component.
- Impact: After any sign-out (including unauthorized recovery), every public realtime query on screen stops updating until navigation/remount. Silent staleness in a realtime library.
- Root cause: Invalidation granularity is "everything" while recovery granularity is "auth-gated queries only"; subscription ownership is split between cache refcounts and per-component `registeredCacheKey` — two ledgers that can disagree.
- Recommendation: Tag entries with their auth mode at acquire time and clear only `auth !== 'none'` subscriptions on sign-out (simplest); or emit an auth-generation signal that query instances watch to resubscribe.
- Acceptance criteria: Regression test: after `signOut()`, `auth:'none'` queries keep receiving updates; `auth:'auto'` queries tear down to signed-out idle state.
- Source-of-truth check: Removes the second ledger disagreement (cache vs component bookkeeping).

#### P1 (F-3): Sign-out does not clear the Nuxt payload/asyncData query cache — stale private data retention, possible cross-account bleed

- Evidence: No `clearNuxtData`/`payload.data` usage anywhere in `src/runtime` outside devtools (verified by grep). `client-engine.ts` signOut clears token/user/subscriptions only. Query keys (`getQueryKey`, `src/runtime/utils/convex-shared.ts:278-281`) contain no user identity.
- Impact: User A's private query results remain in `nuxtApp.payload.data` after sign-out (certain). On sign-in as user B, `useAsyncData` under identical keys can serve A's cached values as initial data until the first live result lands — _Hypothesis_ for the visible-render part; provable with a harness test seeding `payloadData` and flipping tokens.
- Root cause: Sign-out invalidation has three consumers (subscriptions, payload data, settled snapshots) but only one is wired.
- Recommendation: In the signOut success path, `clearNuxtData(key => key.startsWith('convex'))` (both `convex:` and `convex-paginated:` prefixes) and reset settled-state snapshots via the same event as F-2's fix. One invalidation event, three consumers.
- Acceptance criteria: After signOut, no `convex*` keys remain in `payload.data`; a two-user harness test never renders user A's data in user B's session.
- Source-of-truth check: Removes a stale derived copy of server state outliving its authorization.

#### P1 (F-4): `defineSharedConvexQuery` shared state dies with its first consumer

- Evidence: `src/runtime/composables/defineSharedConvexQuery.ts:126-140` creates the query state inside the **first caller's** effect scope and caches it in an app-level registry; `createConvexQueryState` registers `onScopeDispose` cleanup in that scope (`useConvexQuery.ts:618-625`). Later callers get the cached object without acquiring any subscription of their own. _Hypothesis_ (direct code path, not repro'd): first consumer unmounts → subscription released (refcount 1) → all other consumers hold a frozen `data` ref forever; the registry entry is never invalidated. The existing test file covers only key/config semantics, zero lifecycle.
- Impact: The composable's core promise ("shared") fails exactly in the multi-consumer case it exists for.
- Root cause: Shared-lifetime state created in a component-lifetime scope.
- Recommendation: Create the state in a detached `effectScope()` owned by the registry (dispose on app teardown) — the honest model for app-lifetime sharing; or refcount consumers and drop the registry entry at zero.
- Acceptance criteria: Test: mount A and B on the same shared query, unmount A, emit update → B receives it.
- Source-of-truth check: Aligns state lifetime with its declared owner (the app registry, not the first component).

#### P1 (F-5): Required Convex args are optional across the query family and server helpers — compiles, fails at runtime — CONFIRMED

- Evidence: `useConvexQuery.ts:681-689` (`args?: MaybeRefOrGetter<Args>`), `useConvexPaginatedQuery.ts:936-944`, `useConvexUser.ts:61-68`, `defineSharedConvexQuery.ts:83`, `server/utils/convex.ts:197-243` (`args?: FunctionArgs<Query>`). **Confirmed against built dist**: `useConvexQuery(reqQuery)`, `useConvexPaginatedQuery(pagQuery)`, `serverConvexQuery(ev, reqQuery)`, `useConvexUser(reqQuery)` all typecheck with a `FunctionReference<'query','public',{id:string},string>` (tsc exit 0, `@ts-expect-error` negative controls held). Runtime sends `{}` → server-side ArgumentValidationError.
- Impact: The single most common consumer mistake is uncaught, while sibling mutation/action/call APIs DO catch it via `OptionalRestArgs`. Inconsistent inference users hit on day one.
- Root cause: `args?` chosen for no-arg ergonomics without a conditional tuple.
- Recommendation: Conditional rest-tuple (or overloads): optional args only when `Record<string, never> extends FunctionArgs<Query>`; apply to all five entry points. The rule already exists in-repo (`OptionalRestArgs` on mutations) — queries diverge from it.
- Acceptance criteria: `useConvexQuery(api.tasks.list)` compiles; `useConvexQuery(api.tasks.get)` errors; `@ts-expect-error` contracts added to `test/fixtures/consumer-smoke/composables/usePublicApiSurfaceContracts.ts` and `test/unit/query-options-types.test.ts` such that reverting the fix fails `check:consumer-smoke`.
- Source-of-truth check: Restores `OptionalRestArgs` as the single arity rule.

#### P1 (F-6): Published permissions docs teach the forbidden app-owned org/member/role model — and contradict the adjacent auth doc

- Evidence: `docs/content/docs/4.auth-security/0.permissions-setup.md:85-106` instructs creating `organizations: defineTable` and a `users` table with `role: roleValidator, organizationId: v.optional(v.id('organizations'))`. `docs/content/docs/1.guide/4.permissions.md:99` ("`role: roleValidator, // Add this!`"). `4.auth-security/3.standard-role-template.md:70-158` builds permission context from `user.organizationId`. Direct contradiction in the same section: `4.auth-security/1.authentication.md:274` — "Do not mirror those tables into your app schema as a second source of truth… role, membership, invitation… should stay in the generated Better Auth component schema."
- Impact: Every user following the flagship permissions guide builds the split-brain tenancy model the architecture forbids; migrating to Better Auth Organization later is a schema rewrite.
- Root cause: Permissions docs were written against the pre-cutover playground; the Better Auth Organization cutover happened in `starters/team` but the docs track was never rewritten (the cut prescribed in `roadmap.md:19` and `final-vnext.md:49` was not executed here).
- Recommendation: Hard-cut. Rewrite `0.permissions-setup.md`, `1.guide/4.permissions.md`, `2.permissions.md`, `3.standard-role-template.md` to source role/org from Better Auth (`auth.api.hasPermission` / a permission-context query reading Better Auth state), as `starters/team` and `agentic-saas` already do. No dual-path "simple mode."
- Acceptance criteria: No `organizations: defineTable` or `role:` column in any users-table snippet under `docs/content`; extend the `starter-organization-ownership` guard pattern to `docs/content`.
- Source-of-truth check: Removes a documented second source of truth for org/member/role.

#### P1 (F-7): Playground — the module's reference/testbed — implements the forbidden model; three starters mirror org state

- Evidence: `playground/convex/schema.ts:16` (`organizations`), `:38` (`users` with `role`, `organizationId`), `playground/convex/invites.ts` (full app-owned invitation lifecycle), `playground/convex/organizations.ts`; playground's `*.test.ts` are part of CI, so green CI depends on the anti-pattern. Starters: `starters/agency/convex/schema.ts:20-37` + `organizations.ts:19-33` (Convex-owned orgs + owner membership insert); `starters/vertical-ai` (same backbone, **no `auth.ts`/`http.ts`**, `users` table with no populator — latent bug; `starters/research/004-starter-matrix.md:102` shows it is the same product as `agentic-saas`, pre-cutover); `starters/mcp-agent` (Better Auth present but **without the org plugin**; owns `organizations`/`memberships`); `roleRank` ladder triplicated across the three `access.ts` files. `test/unit/starter-organization-ownership.test.ts:9` grandfathers `['agency','vertical-ai','mcp-agent']` in an allowlist — the violation is known and codified rather than fixed. `starters/IMPLEMENTATION_STATUS.md` and `starters/README.md` list a 5-starter set that omits `agentic-saas` and `platform-auth` entirely.
- Impact: The most-visible copies of the tenancy model (playground, 3 starters, status docs) are the wrong ones; contributors and users extend them.
- Root cause: Pre-cutover code never deleted/quarantined.
- Recommendation: (a) Delete `starters/vertical-ai` now. (b) Strip playground to non-tenant feature demos (tasks/files/pagination/auth) — delete `organizations.ts`, `invites.ts`, the role column; move permission tests to `starters/team`. (c) Merge `agency`'s one distinctive idea (`organizationLinks` delegation) into a `starters/team` recipe; delete the starter. (d) Rebase `mcp-agent` on Better Auth Organization (its ~71-test service-actor/approval suite is the valuable part — keep it). (e) Replace both starter status docs with one accurate table carrying each starter's "owns / does not own" statement.
- Acceptance criteria: `appOwnedOrganizationStarters` allowlist shrinks to `[]`; `rg 'organizations: defineTable|invites' playground/convex` is empty; `pnpm test` green; one status doc listing exactly the existing starters.
- Source-of-truth check: Removes three duplicate org/member/role implementations.

#### P1 (F-8): `8.api-surface.md` documents a broken import — and the generator regenerates the bug

- Evidence: `docs/content/docs/6.advanced/8.api-surface.md:46`: `import { createUserSyncTriggers, serverConvexQuery } from '#convex/server'`. `src/runtime/server/index.ts` does not export `createUserSyncTriggers` (surface pinned by `test/unit/server-index-exports.test.ts`). The example prose is hardcoded in `scripts/generate-api-surface.mjs:317`, so `check:api-surface-docs` **regenerates** the bug instead of catching it. All real usage (`starters/team/convex/auth.ts:8`, `1.guide/3.auth.md`) correctly uses the `better-convex-nuxt/server/createUserSyncTriggers` subpath — necessarily, since it runs in `convex/` where Nuxt aliases don't exist.
- Impact: Copy-paste from the page self-titled "source of truth" fails to compile.
- Root cause: The generator validates auto-import _names_, not example code.
- Recommendation: Fix the generator's example; document `createUserSyncTriggers` under its subpath. Do NOT add it to `server/index` — that would invite importing Nitro-context code into the Convex bundle.
- Acceptance criteria: Regenerated doc's example compiles as written; a consumer-smoke contract imports every symbol each doc example names.
- Source-of-truth check: `server/index.ts` + its export test stay authoritative; the generator stops holding an unchecked second copy.

#### P1 (F-9): File-storage docs ship a fully unauthenticated backend; client validation never framed as UX-only

- Evidence: `docs/content/docs/6.advanced/5.file-storage.md:30-56` — the canonical example's `generateUploadUrl` (no auth), `getUrl` (no auth/ownership), `deleteFile` (no auth/ownership). Client-side `maxSize`/`allowedTypes` live in `useConvexFileUpload.ts:283` and `src/runtime/utils/mime-type.ts` ("client-side file type validation"); the upload PUTs with browser-supplied `Content-Type` (`src/runtime/utils/upload-core.ts:73`). The doc contains no "enforce on the backend" callout — in sharp contrast to the exemplary permissions doc.
- Impact: Copy-pasters expose anonymous upload-URL minting (storage-cost/malware-hosting abuse), delete-any-file (IDOR/destruction), and resolve-any-file-URL. The UI checks are trivially bypassed by calling the mutation directly.
- Root cause: Example backend omits auth; doc omits the trust-boundary statement.
- Recommendation: Add auth+ownership checks to all three example functions and a red callout: "Client `maxSize`/`allowedTypes` are UX only. Validate size/MIME and enforce auth+ownership inside the Convex mutation/query; the upload URL and storageId are attacker-reachable."
- Acceptance criteria: Doc example mutations reject unauthenticated calls and cross-user storageIds; a playground/starter convex test asserts anonymous `generateUploadUrl`/`deleteFile` throw.
- Source-of-truth check: Enforcement moves to Convex functions where it belongs.

### P2 findings

#### P2 (F-10): SSR-hydrated JWT in the HTML payload with no cache-safety guard or guidance

- Evidence: `src/runtime/plugin.server.ts:145-164` — `useState('convex:token')`/`useState('convex:user')` are serialized into the client-readable `__NUXT__` payload; no `Cache-Control` set; `1.authentication.md:38-45` describes hydration with no caching caveat.
- Impact: Correct for per-request SSR; but under route rules/ISR/CDN caching or a shared reverse-proxy cache on any authenticated page (a common misconfiguration), user A's bearer JWT and profile are served to other users — full impersonation until token expiry.
- Root cause: The token must reach the client for the Convex WebSocket; nothing guards against caching the page that carries it.
- Recommendation: Have the server plugin set `Cache-Control: private, no-store` on responses where a token was hydrated; add a docs warning against ISR/CDN caching of authenticated routes.
- Acceptance criteria: Test asserting an authenticated SSR render carries `Cache-Control: private, no-store`; docs section exists.
- Source-of-truth check: N/A (defense in depth).

#### P2 (F-11): Production SSR `authError` leaks internal setup hints, inconsistent with the proxy's deliberate prod suppression

- Evidence: The proxy hides details in prod (`src/runtime/server/api/auth/[...].ts:240-243`); the SSR path does not: `server/utils/auth-snapshot.ts:278-284` builds `authError` via `buildTokenExchangeFailureMessage` regardless of environment and `plugin.server.ts:163` hydrates it client-visible. The message (`auth-errors.ts:41-51`) embeds `${siteUrl}/api/auth/convex/token`, `BETTER_AUTH_SECRET` and `convex/http.ts` hints, and appends the raw upstream `error.message`.
- Impact: On misconfigured prod deployments, end users see internal implementation/config hints and possibly raw upstream errors via `<ConvexAuthError>`.
- Root cause: Snapshot error construction is not environment-gated.
- Recommendation: In prod, hydrate a generic message; keep details dev-only/server logs.
- Acceptance criteria: With `import.meta.dev=false`, `snapshot.authError` on a failed token exchange contains no secret names, file hints, or raw upstream messages.
- Source-of-truth check: N/A.

#### P2 (F-12): `useConvexCall` timeouts don't cancel — mutation double-submit hazard; second behavioral contract for calls

- Evidence: `src/runtime/composables/useConvexCall.ts:42-59` — `withTimeout` races a bare `setTimeout` against `convex.mutation(...)`; the mutation still commits server-side after "timeout". No `ensureConvexAuthReady`, no `handleUnauthorizedAuthFailure`, no devtools registration (all present in `useConvexMutation.ts:274-321`).
- Impact: Caller sees timeout → retries → duplicate writes. Two divergent contracts for "call a mutation".
- Root cause: Duplicated transport with divergent policy.
- Recommendation: Remove `timeoutMs` for mutations/actions (or make it observation-only with an explicit "may still commit" doc note); route through the same auth-ready/unauthorized pipeline — or shrink `useConvexCall` to queries only and point imperative mutation users at `useConvexMutation(...).safe`.
- Acceptance criteria: No code path where a timed-out mutation is presented as failed-and-safely-retriable; contract test updated.
- Source-of-truth check: Restores one call pipeline.

#### P2 (F-13): Three parallel token-resolution implementations

- Evidence: `server/utils/auth-snapshot.ts` (plugin.server: nitro cache + session fallback, 5s `fetchWithTimeout`); `utils/convex-cache.ts:260-298` `fetchAuthToken` (SSR queries: `useState` cache only, ignores nitro authCache, no timeout); `server/utils/convex.ts:44-113` `resolveAuthToken` (server routes: nitro cache, no useState).
- Impact: Cookie→JWT exchange semantics/caching/timeout drift; SSR-query auth and server-route auth can disagree within one request.
- Root cause: Each surface grew its own resolver.
- Recommendation: One `resolveTokenFromCookie(cookieHeader, {cache})` in server utils; `fetchAuthToken` becomes "read the `useState` populated by plugin.server, or nothing" — SSR queries should never run their own exchange since plugin.server already ran.
- Acceptance criteria: One exchange implementation in `src/`; unit test that SSR query token === plugin.server token for the same request.
- Source-of-truth check: Removes two derived token paths.

#### P2 (F-14): Single-file upload concurrency guard checks the wrong thing; cancel window during URL phase is a no-op

- Evidence: `useConvexFileUpload.ts:268` guards on `currentAbortController`, which is only assigned at `:330` **after** `requestUploadUrl` resolves — two `upload()` calls during the mutation phase both proceed and interleave shared `status/progress/data` refs. `cancel()` (`:242-251`) during that phase aborts nothing; the upload later overwrites the reset state with `'success'`.
- Recommendation: Guard on `_status.value === 'pending'`; create the AbortController before step 1; check `signal.aborted` after the mutation resolves.
- Acceptance criteria: Tests: second concurrent `upload()` rejects immediately; `cancel()` during URL generation prevents the XHR and leaves state `'idle'`.
- Source-of-truth check: `status` becomes the single in-flight ledger.

#### P2 (F-15): `useConvexStorageUrl` is untyped, hardcodes the arg name and `auth: 'none'`

- Evidence: `useConvexStorageUrl.ts:85-101` — `FunctionReference<'query'>` (any args/return), builds `{ storageId: id }`, forces `{ auth: 'none' }`, annotates `ComputedRef<string | null>` regardless of actual return type.
- Impact: Differently-named args or non-string returns compile and break; apps whose `getUrl` requires auth (the common secure pattern — see F-9) can never attach a token.
- Recommendation: Constrain to `FunctionReference<'query', 'public', { storageId: string }, string | null>` and add an options param (at minimum `auth` passthrough) — or delete the composable; it is a 10-line wrapper users can write correctly.
- Acceptance criteria: Mistyped getUrl query fails to compile; auth-required storage URLs work.
- Source-of-truth check: N/A.

#### P2 (F-16): Runtime env re-resolution creates server/client config divergence

- Evidence: `src/runtime/utils/runtime-config.ts:60-61` reads `process.env.NUXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL` on every normalize call. On the client `process.env` is an empty shim → the fallback is silently server-only. `NUXT_PUBLIC_CONVEX_URL` is already applied natively by Nuxt's runtime-config env override; `CONVEX_URL` set only at deploy time yields SSR-works/client-broken with no warning.
- Recommendation: Read env only in `module.ts` (build time); rely on Nuxt's `NUXT_PUBLIC_*` override at runtime; document `CONVEX_URL` as build-time only; delete env reads from `runtime-config.ts`.
- Acceptance criteria: `rg process.env src/runtime` returns nothing outside logger/dev guards.
- Source-of-truth check: Nuxt runtime-config env override becomes the single mechanism.

#### P2 (F-17): Config shape and defaults defined in three-plus places

- Evidence: (1) `ModuleOptions` + `defaults:` in `src/module.ts:154-319` — and every default appears **again** as `?? literal` in the defu merge at `module.ts:375-408`; (2) `ConvexPublicRuntimeConfig` in `src/runtime/types.d.ts:14-57`; (3) `NormalizedConvexRuntimeConfig` + `normalizeConvexRuntimeConfig` re-deriving every default; (4) per-composable third fallbacks (`useConvexQuery.ts:152-154` dead `?? true`); `normalizeAuthCacheTtl` duplicated verbatim (`module.ts:55-61` vs `runtime-config.ts:45-51`); `maxConcurrent` clamping duplicated (`runtime-config.ts:94-99` vs `useConvexUploadQueue.ts:86-90`); literals `60`, `3`, `1_048_576`, `'/api/auth'` each appear 2–3×. Additionally `types.d.ts:89-102` carries a dead `declare module 'nuxt/schema'` augmentation that consumers never load (the real one is the `module-templates.ts:34-77` template — a third copy of the `#app` augmentation).
- Impact: A default change requires 3–4 coordinated edits; drift is invisible until build-time, SSR, and client behavior diverge.
- Recommendation: One `DEFAULTS` const + one normalize function shared by module and runtime; delete dead fallbacks, the duplicate ttl/clamp normalizers, and the dead `nuxt/schema` block.
- Acceptance criteria: Each default literal exists exactly once in `src/`; `runtime-config.test.ts` anchors the single normalizer; `test:types` + `check:consumer-smoke` green.
- Source-of-truth check: Establishes one authoritative config pipeline (currently none is).

#### P2 (F-18): `createPermissions` does not tie `TContext` to the query's return type

- Evidence: `usePermissions.ts:69` (`query: FunctionReference<'query'>`, untyped) + `usePermissions.ts:166` (`permissionContext.value as TContext | null`).
- Impact: A query returning a different shape than `checkPermission` expects compiles; permission checks silently evaluate against wrong data.
- Recommendation: `query: FunctionReference<'query', 'public', Record<string, never>, TContext | null>`; drop the cast. Also fix `pending: Ref<boolean>` → `ComputedRef<boolean>` (`usePermissions.ts:93`).
- Acceptance criteria: Mismatched query/checkPermission pair is a compile error; consumer-smoke updated.
- Source-of-truth check: The Convex query is the source of the context shape; types now say so.

#### P2 (F-19): `error` refs typed `Ref<Error | null>` but hold `undefined`

- Evidence: `useConvexQuery.ts:670` casts Nuxt 4's `Ref<ErrorT | undefined>` to `Ref<Error | null>`; bridge code later writes literal `null` (`useConvexQuery.ts:499`) → mixed value domain. `useConvexUser.error` inherits it. (Paginated query already normalizes correctly via computed.)
- Recommendation: `computed(() => asyncData.error.value ?? null)` (matching paginated); delete the cast.
- Acceptance criteria: No `as Ref<Error | null>` cast; type test pinning the value domain.
- Source-of-truth check: Nuxt's signature is the truth; the cast created a false second one.

#### P2 (F-20): `./composables` subpath — published, undocumented, and banned from docs

- Evidence: `package.json` exports it; `check:no-stale-doc-imports` fails the build if docs mention `better-convex-nuxt/composables`; no starter/playground/doc usage exists.
- Impact: Public surface without an owner; importing it bypasses auth/permissions auto-import gating.
- Recommendation: Delete the subpath (and its typesVersions entry). Auto-imports + `#convex/server` + the `createUserSyncTriggers` subpath cover all documented paths.
- Acceptance criteria: exports/typesVersions/docs/lint agree; `check:package-exports` green.
- Source-of-truth check: Removes a contradictory second import path.

#### P2 (F-21): `2.ai-agents-and-mcp.md` makes ~40 "Proven Locally" claims with zero in-repo tests

- Evidence: `docs/content/docs/8.architecture/2.ai-agents-and-mcp.md:84-229` (delegated-run permission re-checks, OAuth PKCE/DCR/introspection/revocation "proofs"); the proofs live in `ai-learnings.md` prose and a shell script; `starters/platform-auth` has **no unit tests** (only `scripts/verify-oauth-provider-runtime.sh`); `final-vnext.md:364-366` records an open refresh-rotation blocker, and `final-vnext.md:609` itself says "Do not say: Public OAuth/MCP ready".
- Recommendation: Cut "Proven Locally" to claims backed by a runnable command in this repo; move the rest to research ledgers labeled unverified.
- Acceptance criteria: Every claim names its proof command; `platform-auth` gains token-denial invariant tests before any public claim.
- Source-of-truth check: N/A (claims vs evidence).

#### P2 (F-22): `ConvexUser` augmentation works but is one refactor from silently breaking — zero fixtures

- Evidence: Recipe `docs/content/docs/7.recipes/3.user-augmentation.md`. Verified by tsc probe against dist: the `declare module 'better-convex-nuxt'` merge DOES reach `useConvexAuth().user` — but only because every hop in the re-export chain is a _named_ interface re-export; `export *`, a type alias, or inlining breaks the recipe with no signal. `rg "declare module 'better-convex-nuxt'" test/` → nothing.
- Recommendation: Add a `convex-user.d.ts` + usage assertion to `test/fixtures/consumer-smoke`.
- Acceptance criteria: `check:consumer-smoke` fails if augmentation stops reaching `UseConvexAuthReturn['user']`.
- Source-of-truth check: The fixture becomes the executable truth for a docs-only contract.

#### P2 (F-23): Consumer type contracts are positive-space only

- Evidence: `usePublicApiSurfaceContracts.ts` has zero `@ts-expect-error`; `query-options-types.test.ts` covers option shapes, not call arity. This is exactly why F-5 shipped.
- Recommendation: Add negative-space contracts (required-args omission, wrong arg types, writes to readonly refs).
- Acceptance criteria: Reverting the F-5 fix fails `check:consumer-smoke`.

#### P2 (F-24): `isConvexUnauthorizedError` substring matching signs users out on false positives

- Evidence: `src/runtime/utils/auth-unauthorized-core.ts:26-52` — any message containing "authentication"/"unauthorized"/"not authenticated" matches; 403/FORBIDDEN (authorization) is treated like 401 (authentication); `handleUnauthorizedAuthFailure` then signs out and redirects (`auth-unauthorized.ts:86-99`). `test/unit/auth-unauthorized.test.ts` currently _codifies_ the false positive (`'Authentication failed'` string → true). Feature is opt-in (default off).
- Recommendation: Match only structured signals (401/explicit `UNAUTHENTICATED` codes); never destroy a session on 403; flip the codifying test to negative cases ("Two-factor authentication required", permission-denied 403 must NOT sign out).
- Acceptance criteria: The two negative cases above pass.
- Source-of-truth check: N/A.

#### P2 (F-25): Three divergent defaults for the `convex:pending` state key

- Evidence: `plugin.client.ts:89` (`() => true`), `useConvexAuth.ts:122` (`() => import.meta.client`), `useConvexQuery.ts:185` / `useConvexPaginatedQuery.ts:298` (`() => false`). Effective initial value depends on first-touch order and SSR serialization (SSR `useConvexQuery` writes `false`, defeating plugin.client's "start as true" intent).
- Recommendation: One exported `useConvexPendingState()` with a single default; all four sites use it.
- Acceptance criteria: One default in `src/`; auth-flicker nuxt tests green.
- Source-of-truth check: Removes an accidental three-way default race.

#### P2 (F-26): Hard-coded 10s WS-first-result timeout errors awaited queries; paginated `refresh()` can drop items; `refresh()` on subscribe queries is a silent no-op

- Evidence: (a) `convex-cache.ts:121` (`timeoutMs ?? 10_000`), message duplicated in `useConvexPaginatedQuery.ts:578-581` — awaited queries on flaky WS reject at 10s into error state though data may arrive at 11s (error-then-data recovery exists at `useConvexQuery.ts:489-517`). (b) `useConvexPaginatedQuery.ts:827-864` re-fetches each page over HTTP with the original `(cursor, numItems)` in parallel — items inserted inside page _i_ since original load fall into an invisible gap between page _i_'s new end cursor and page _i+1_'s fixed start. (c) `asyncData.refresh` on a subscribe-mode query resolves immediately from the bridge snapshot (`useConvexQuery.ts:399-402`) — documented as re-fetch, actually a no-op.
- Recommendation: (a) Make the timeout configurable via `convex.defaults` and prefer staying pending over settling into error for subscribe-mode. (b) Refresh pages sequentially, chaining each fresh `continueCursor`. (c) Document `refresh` as meaningless under live subscriptions (WS is authoritative) or force an HTTP fetch.
- Acceptance criteria: (b) test: insert into page 1's range between load and refresh → concatenated list gapless. (a)/(c) docs + config test.
- Source-of-truth check: (b) protects the WS journal as pagination's source of truth during refresh.

#### P2 (F-27, Hypothesis): Canonical-redirect follower re-sends Better Auth cookies cross-origin

- Evidence: `src/runtime/server/api/auth/redirect-utils.ts:13-41,55-100` — on a 3xx where path+query are unchanged but origin differs, the proxy re-issues the request to the new origin reusing `forwardHeaders`, which include filtered Better Auth cookies (`headers.ts:38-43`). Bounded to 2 redirects, http/https only. Exploitation requires the trusted Convex site to emit a redirect to an attacker origin (compromise/misconfig) — low probability, but the cookie-to-foreign-origin forwarding is real. Provable by a unit test driving `fetchWithCanonicalRedirects` with a `302 Location: https://evil.com/...` fetchImpl and asserting the second fetch carries the cookie header.
- Recommendation: Only follow canonical redirects whose target host matches the configured `siteUrl` registrable domain (apex↔www), or strip `cookie` on cross-origin hops.
- Acceptance criteria: The unit test above asserts no cookie crosses origins.
- Source-of-truth check: N/A.

#### P2 (F-28): Server auth-token cache invalidation is manual and unwired

- Evidence: `server/utils/auth-cache.ts:40-45` exposes `serverConvexClearAuthCache`, but nothing in sign-out flow calls it; a revoked session's cookie keeps yielding a cached JWT until TTL (clamped ≤60s). Cache is per-session-hash keyed and **off by default** (safe). _Hypothesis_: TTL honoring depends on the mounted unstorage driver (memory driver ignores `ttl`).
- Recommendation: Document the ≤60s revocation window prominently; hook the auth proxy's sign-out route to clear the cache key; verify TTL behavior on the default driver.
- Acceptance criteria: Docs note + sign-out-clears-cache test.

#### P2 (F-29): Starter/docs corpus drift and guard-script sprawl

- Evidence: 7 negative-grep guards in `package.json` (each a past drift incident), one still scanning the dead `docs/installation2.md`; ~370 KB of root strategy memos with internal contradictions (research mandates the name `vertical-ai` while the repo built `agentic-saas`; `roadmap.md` and `final-vnext.md` each claim direction ownership); starter copy-paste drift already observable (`compatibilityDate` diverged `2026-06-21` vs `2026-06-23`; vendored `convex/betterAuth/` pinned at 0.12.4 vs 0.12.5 across starters); `demo/convex/schema.ts:13-20` stores `role` in an app users table (the pattern docs forbid) for the labs role-switcher.
- Recommendation: Shrink the surfaces (delete installation2.md and vertical-ai; single permissions track) and guards shrink with them; fold remaining greps into one documented `scripts/check-doc-invariants.mjs`; add vendored-component version alignment to `check-workspace-deps`; banner the demo as non-reference or rebase it.
- Acceptance criteria: ≤4 negative-grep guards, none referencing deleted files; `check:workspace-deps` covers the vendored component.

### P3 findings (abbreviated; all have file evidence)

- **F-30 Callback/state divergence on superseded calls**: `call-state.ts:32-44` guards commits by requestId but `useConvexMutation.ts:284-298`/`useConvexAction.ts:167-197` always fire `onSuccess/onError`, even after `reset()` or supersession. Align callbacks with the requestId guard.
- **F-31 App convention in core**: `call-result.ts:10,33-56` special-cases `LIMIT_*:` message prefixes — a consumer-app convention in a general-purpose module. Delete or generalize behind an option.
- **F-32 Upload queue halted items resurrect**: `useConvexUploadQueue.ts:152-158` rejects deferreds on halt but leaves items `'queued'`; `:287-289` a later enqueue resumes them though callers were told they failed. Settle to `'cancelled'` at halt.
- **F-33 `parseConvexResponse` false errors**: `convex-shared.ts:180` treats any object bearing `code` as an error; a query legitimately returning `{ code }` throws. Narrow to `status === 'error'`.
- **F-34 Dead/implicit code**: `useConvexPaginatedQuery.ts:909-915` identical branches (delete); `useConvexQuery.ts:588-594` `setTimeout(0)` re-attach hack (structural fix or pin with regression test); `useConvexAuth.ts:127-138` creates a throwaway auth engine per call when `$convexAuthEngine` missing (return clear error); `deep-unref.ts` supports nested refs the types forbid (delete or type as `DeepMaybeRef`).
- **F-35 Skip-sentinel inconsistency**: runtime accepts `null|undefined|'skip'` (`query-args.ts:5-20`); `useConvexQuery` types only `'skip'`; `defineSharedConvexQuery.ts:74` types `null|undefined` but not `'skip'`. One dialect (`'skip'`) everywhere.
- **F-36 Type nits**: local `ConnectionState` duplicate + casts (`useConvexConnectionState.ts:97,100` — import from `convex/browser`); `getQueryKey(query, args?: unknown)`; `AuthCacheOptions.enabled` required (makes `{ ttl: 30 }` a type error); `QueryDefaults.auth` inlines `ConvexQueryAuthMode`; doc names `AuthProxyOptions` vs actual `AuthProxyDefaults` (`7.module-config.md:42`).
- **F-37 Dist cruft**: `dist/runtime/devtools/ui/` ships UI _sources_ alongside built `ui/dist`; stray `dist/runtime/server/tsconfig.json` extends a nonexistent path for consumers. Exclude both.
- **F-38 defu array concat**: `module.ts:375` — user-set `trustedOrigins` in both `convex:{}` and `runtimeConfig.public.convex` concatenates rather than overrides. Document or use array-replace semantics.
- **F-39 PII in debug logs**: `auth-snapshot.ts:262` logs user email (debug-gated). Log a hashed/truncated id.
- **F-40 Repo cruft**: `docs/installation2.md` (stale scratch with personal paths), empty `starter/` and `apps/`, root `.log` files, `.DS_Store`s, untracked `feature-templates/` and `bin/lib` (commit-with-README or delete — untracked is the worst state).
- **F-41 Format drift**: `pnpm format:check` fails on 101/660 files while the `release` script assumes a format-clean tree. Run `pnpm format`, commit, and add format:check to CI.
- **F-42 `createUserSyncTriggers` ordering**: out-of-order `onUpdate` before `onCreate` silently no-ops (no test). Assert and document.

---

## 5. Source-Of-Truth Audit

| Concept                            | Current Owner                                     | Evidence                                                                                                                                                                                                                                                                      | Duplicate/Derived State?                                                                   | Verdict                        | Required Action                                                                                            |
| ---------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Auth user                          | Better Auth component                             | `createUserSyncTriggers.ts:113-118` ("derived and rebuildable"); `useConvexUser.ts:11-27` discriminated `'better-auth'\|'projection'\|'session'` sources                                                                                                                      | Yes, sanctioned: derived `users` projections (team `auth.ts:156`, demo, playground)        | OK in core; leaks elsewhere    | Every projection uses the helper + rebuild path; agency/mcp-agent/vertical-ai hand-roll or lack populators |
| Session                            | Better Auth (cookie via Nuxt proxy)               | `server/api/auth/[...].ts`; `server/utils/auth-snapshot.ts`                                                                                                                                                                                                                   | Per-request derived snapshot                                                               | OK                             | None                                                                                                       |
| Convex JWT                         | Derived from Better Auth session                  | `plugin.server.ts` exchange; opt-in cache `module.ts:55-61,367-372` (TTL 1–60s)                                                                                                                                                                                               | Nitro-storage cache — opt-in, bounded                                                      | OK                             | Wire sign-out invalidation (F-28); note three resolver impls (F-13)                                        |
| Organization                       | **Split-brain**                                   | Better Auth: `starters/team` (no org table; enforced by `test/unit/starter-organization-ownership.test.ts:32`), `agentic-saas`. Convex-owned: `agency/convex/schema.ts:20-37`, `vertical-ai`, `mcp-agent`, `playground/convex/schema.ts:16`, docs `0.permissions-setup.md:85` | Yes — full second implementations                                                          | **P1 VIOLATION**               | Delete from playground, docs, agency/vertical-ai/mcp-agent (F-6, F-7)                                      |
| Member                             | Split-brain (same split)                          | `memberships: defineTable` in 3 starters; `users.organizationId` in playground + docs                                                                                                                                                                                         | Yes                                                                                        | **P1 VIOLATION**               | Same                                                                                                       |
| Invitation                         | Better Auth in team; app-owned in playground      | `playground/convex/invites.ts` (full lifecycle — exactly what `final-vnext.md:168` forbids)                                                                                                                                                                                   | Yes                                                                                        | **P1 VIOLATION**               | Delete playground invites                                                                                  |
| Role                               | **Worst split — 4 owners**                        | Better Auth static roles (`team/convex/auth.ts:38-90`); triplicated `roleRank` in 3 `access.ts`; role column in playground + `demo/convex/schema.ts:13-20`; docs teach role-in-users (`1.guide/4.permissions.md:99`)                                                          | Yes, uncontrolled                                                                          | **P1 VIOLATION**               | Standardize on Better Auth roles + `hasPermission`                                                         |
| Team                               | Better Auth (when enabled)                        | team starter uses string `teamId`; ownership test asserts no mirror                                                                                                                                                                                                           | No mirror                                                                                  | OK                             | None                                                                                                       |
| Permission context                 | Derived at read time from a Convex query          | `usePermissions.ts:155-161`; `:211-212` UX-only disclaimer                                                                                                                                                                                                                    | Transient reactive state                                                                   | OK in core                     | Docs must stop feeding it from app role tables (F-6); tie `TContext` to query (F-18)                       |
| Product data                       | App Convex tables keyed by Better Auth string IDs | `team/convex/schema.ts:35-53`                                                                                                                                                                                                                                                 | No                                                                                         | OK — thesis-conformant         | None                                                                                                       |
| Product audit                      | App Convex tables                                 | `auditEvents` in team/agentic-saas                                                                                                                                                                                                                                            | No                                                                                         | OK                             | None                                                                                                       |
| Upload file metadata               | Convex storage                                    | upload composables hold transient progress only                                                                                                                                                                                                                               | Transient                                                                                  | OK                             | None                                                                                                       |
| Query cache/subscription state     | ConvexClient + module hydration cache             | `utils/convex-cache.ts`; single `createConvexQueryState` core reused by `usePermissions`/`useConvexUser`                                                                                                                                                                      | Derived; but payload copy outlives auth (F-3) and ownership split across two ledgers (F-2) | OK design, broken invalidation | Fix F-1/F-2/F-3                                                                                            |
| Devtools state                     | Dev-only in-memory registries                     | `devtools/query-registry.ts:11-16` throws on server import; recorder stores no secrets, capped 20                                                                                                                                                                             | Derived observability                                                                      | OK                             | Keep dev-only                                                                                              |
| Generated API aliases/placeholders | Convex codegen                                    | `module.ts:322-330` aliases; missing-API placeholder throws loudly with typecheck fixture                                                                                                                                                                                     | Starters commit `any`-typed `_generated` bootstrap stubs (documented non-canonical)        | OK with caveat                 | Keep policy; treat starter "typecheck passes" as a soft signal                                             |

---

## 6. Type Story Deep Dive

**Best type decisions (preserve):**

1. `OptionalRestArgs`-based callable + attached reactive state on mutation/action (`UseConvexMutationReturn` intersection) — precise arity, tested down to `Parameters<...>` tuple labels (`call-result-types.test.ts:44-48`).
2. `CallResult<T>` discriminated envelope, uniform across `mutation.safe`, `action.safe`, `useConvexCall.*Safe`, `uploadQueue.enqueueSafe` — with nested-CallResult semantics explicitly typed and documented (`error-handling.md:149-158`).
3. `ConvexUserState` discriminated union correlating `source`/`data`, with equality-based type tests.
4. `module-api-surface.ts` as a `satisfies`-checked registry consumed by both `addImports` and the docs generator — auto-import names cannot drift from docs.
5. Missing-`convex/_generated/api` typed placeholder + dedicated typecheck fixture — the "not yet codegen'd" state is representable, actionable, CI-guarded.
6. `createBetterConvexAuthClient` const-generic plugin tuple preserving Better Auth plugin typing.
7. Pagination types faithfully mirror convex-react, so optimistic helpers infer item types end-to-end without casts.
8. Notably clean hygiene: **zero** `as any` / `: any` / `@ts-ignore` in `src/` (7 reviewed casts total).

**Type holes and widening risks (ranked):** F-5 args arity (the big one); F-18 permissions `TContext`; F-15 storage-URL widening; F-19 error null/undefined; F-35 skip-sentinel dialects; `transform` purity forced by per-read `computed` re-execution (`useConvexQuery.ts:659-662`) but not expressed in types.

**Generics to tighten:** `createPermissions` query param; `useConvexStorageUrl` reference; `getQueryKey` args; `ConnectionState` import instead of local duplicate.

**Type-level tests that exist:** `query-options-types.test.ts`, `call-result-types.test.ts` (incl. negative `HasKey` checks for removed legacy APIs — a good pattern), `use-convex-user-types.test.ts`, `better-auth-client-plugin-types.test.ts`, `better-auth-local-component/convex/type-contracts.ts`, consumer-smoke `nuxi typecheck`, missing-convex-api `nuxi typecheck`. Unusually strong for a v0.4 module.

**Type-level tests missing:** required-args negative contracts (F-5/F-23); ConvexUser augmentation fixture (F-22); `transform` return inference; `initialData` × `transform` interaction; `error` value domain; `ServerConvexOptions.auth: 'required'` narrowing.

**Declaration/packaging risks:** `typesVersions` mirrors `exports` 1:1 (kept for TS<4.7 — fine). ESM-only, intentional. `dist/types.d.mts` uses `../dist/...` specifiers — generated by nuxt-module-build, resolves, leave alone. Ship-list issues: F-37 (UI sources + stray tsconfig in dist), F-20 (`./composables`).

---

## 7. Feature Completeness Matrix

| Feature               | Implementation                                             | Docs                                                          | Tests                                                              | Missing cases                                                                                      | Direction                                                              |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Queries               | Full (SSR HTTP + WS bridge + dedup/refcount)               | Good                                                          | Strong (26 nuxt cases)                                             | Signed-out gate (F-1, confirmed); signOut lifecycle (F-2/F-3); `refresh()` under subscribe (F-26c) | Fix gate; unify idle keys                                              |
| Paginated queries     | Full (per-page WS subs, SSR first page)                    | Good                                                          | Good (20 cases)                                                    | Refresh page-boundary continuity (F-26b); loadMore-during-args-change race                         | Keep; add boundary test; delete dead branch                            |
| Mutations             | Full (state, optimistic, safe, callbacks)                  | Good                                                          | Good                                                               | Callback-vs-state divergence on overlap (F-30)                                                     | Keep                                                                   |
| Actions               | Full (mirror)                                              | Good                                                          | Good                                                               | —                                                                                                  | Keep; consider one factory (~90% duplicated with mutations)            |
| One-shot calls        | Full but divergent                                         | Thin                                                          | Contract only                                                      | Timeout ≠ cancellation (F-12); no auth-ready/unauthorized/devtools parity                          | **Shrink or delete**                                                   |
| Optimistic updates    | Full (regular + paginated)                                 | Good                                                          | Unit-tested                                                        | No end-to-end optimistic-write→mounted-subscriber test                                             | Keep; add one integration invariant                                    |
| Connection state      | Full, refcounted singleton                                 | Good                                                          | Tested                                                             | Local type duplicate (F-36)                                                                        | Keep                                                                   |
| Auth                  | Full (engine, generations, hydration)                      | Good                                                          | Good unit suite                                                    | signOut side effects (F-2/F-3, confirmed)                                                          | Fix invalidation story                                                 |
| Auth route protection | Minimal middleware + pure decision fn                      | Good — correctly UX-only                                      | Unit + e2e                                                         | —                                                                                                  | Keep                                                                   |
| Auth proxy            | Full                                                       | Good                                                          | Strong security unit suite                                         | Redirect-cookie constraint (F-27); prod authError gating (F-11)                                    | Keep; harden                                                           |
| Permissions           | Small, correctly display-only framed                       | Exemplary boundary docs; **wrong model in setup track** (F-6) | Nuxt + smoke                                                       | `TContext` tie (F-18)                                                                              | Keep helper; rewrite docs track                                        |
| User sync triggers    | Full (create/update/delete/rebuild)                        | Documented as derived projection                              | Good unit suite                                                    | Out-of-order events silently no-op (F-42)                                                          | Keep as core primitive                                                 |
| File upload           | Full                                                       | Good content; **unauth example** (F-9)                        | Tested                                                             | Concurrency guard + cancel window (F-14)                                                           | Fix guard + docs                                                       |
| Upload queue          | Full (concurrency, halts, deferreds)                       | Good                                                          | Good (15 cases)                                                    | Halted-items resurrect (F-32)                                                                      | Keep; settle halted items                                              |
| Storage URLs          | Thin wrapper                                               | Good                                                          | Smoke only                                                         | Untyped + hardcoded `auth:'none'` (F-15)                                                           | Fix or delete                                                          |
| Server helpers        | Full (`auto/required/none` + token)                        | Good                                                          | Good unit suite                                                    | Third token-resolution impl (F-13)                                                                 | Consolidate                                                            |
| Devtools              | Full; strictly dev-gated                                   | n/a                                                           | Registry/transport/path tested                                     | —                                                                                                  | Keep; trim dist sources (F-37)                                         |
| Starters              | 7 shipped; 2 canonical, 3 violating, 1 untested, 1 minimal | Status docs stale (F-7)                                       | team/agentic-saas/mcp-agent strong; vertical-ai 4; platform-auth 0 | Org-ownership allowlist ≠ []                                                                       | Delete vertical-ai; merge agency; rebase mcp-agent; test platform-auth |

---

## 8. Test And Verification Results

Environment note: the checkout's `node_modules/.bin` shims initially pointed into an unrelated workspace (`ginko-cms`) — fixed with `pnpm install --frozen-lockfile` before running anything. E2E requires a live Convex deployment + `playground/.env.local`, unavailable here — **not run**.

| Command                                                                 | Result                       | Duration | Notes                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | ---------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                        | PASS                         | 2s       | Repaired stale bin links (local env issue, not repo)                                                                                                                                                                         |
| `pnpm lint`                                                             | **FAIL**                     | 2s       | Only `check:no-starter-generated-artifacts` — tripped by _untracked local_ `.nuxt`/`node_modules` in 4 starters (not git-tracked; local dev state). All other lint guards + eslint would need those dirs removed to complete |
| `pnpm format:check`                                                     | **FAIL**                     | 4s       | 101 of 660 files have format drift (F-41); `release` script assumes clean                                                                                                                                                    |
| `pnpm test:types` (vue-tsc)                                             | PASS                         | 6s       |                                                                                                                                                                                                                              |
| `pnpm check:contracts`                                                  | PASS                         | 13s      | api-surface docs, package exports (100 files), workspace deps (8 manifests), consumer-smoke typecheck, missing-convex-api typecheck, better-auth-local-component tsc                                                         |
| `pnpm test` (unit+convex+nuxt+browser)                                  | PASS                         | 4.6s     | **510/510 tests, 65 files**                                                                                                                                                                                                  |
| `pnpm prepack`                                                          | PASS                         | ~3min    | Devtools UI build + module build + dist export validation (310 files, 627 kB)                                                                                                                                                |
| `node scripts/generate-api-surface.mjs --check`                         | PASS                         | 1s       | Cannot catch F-8 (bug is in the generator's own prose)                                                                                                                                                                       |
| `node scripts/check-package-exports.mjs`                                | PASS                         | 1s       |                                                                                                                                                                                                                              |
| `pnpm test:e2e`                                                         | **NOT RUN**                  | —        | Needs live Convex + `.env.local`                                                                                                                                                                                             |
| Repro: signed-out subscription (temp nuxt test)                         | **FAILED as predicted**      | —        | `expected 1 to be +0` — confirms F-1; temp file removed                                                                                                                                                                      |
| Repro: signOut freezes `auth:'none'` query (temp nuxt test)             | **FAILED as predicted**      | —        | No resubscription after `clearSubscriptionCache` — confirms F-2; temp file removed                                                                                                                                           |
| tsc probe vs dist: args-arity (4 holes + 2 `@ts-expect-error` controls) | Holes compile, controls held | —        | Confirms F-5                                                                                                                                                                                                                 |
| tsc probe vs dist: ConvexUser augmentation (+ negative control)         | Augmentation works           | —        | Supports F-22 (works today, untested)                                                                                                                                                                                        |

**Missing invariant tests (ranked):**

1. Auth-settles-signed-out never subscribes (make the F-1 repro permanent).
2. signOut lifecycle contract: public queries stay live; private queries idle; `payload.data` `convex*` keys cleared.
3. `defineSharedConvexQuery` survives first-consumer unmount.
4. Required-args negative type contracts in consumer-smoke.
5. Unauthorized-recovery false positives ("Two-factor authentication required", 403 must not sign out).
6. Upload: concurrent `upload()` rejection; cancel during URL phase.
7. `useConvexCall` mutation timeout semantics (or delete the feature).
8. Paginated refresh boundary continuity after mid-page insertion.
9. ConvexUser augmentation consumer fixture.
10. Optimistic update → mounted subscriber (bridge path) integration.
11. `createUserSyncTriggers` out-of-order events.
12. Anonymous-caller rejection tests for the file-storage doc example backend.

**Tests to fix/flip:** `test/unit/auth-unauthorized.test.ts` codifies the over-broad matcher (flip with F-24). `test/nuxt/useConvexQuery.nuxt.test.ts` wraps everything in `auth:'none'` (harness line 28) — exactly why F-1 went unseen; add an `auth:'auto'` axis to a subset of subscription-lifecycle tests. `starter-organization-ownership.test.ts`'s allowlist should shrink to `[]` as F-7 executes.

---

## 9. Roadmap Recommendation

### Now — before calling the library solid (0.5 gate)

| Item                                                                      | Why now                                                           | Acceptance criterion                                                     | Belongs in          |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| Fix F-1 (signed-out subscription gate)                                    | Confirmed bug; breaks every signed-out visit with private queries | Repro test permanent + green; no `convex:idle:*` subscriptions           | Core                |
| Fix F-2/F-3 (signOut lifecycle: selective clear + payload purge)          | Confirmed bug; silent staleness + private-data retention          | signOut contract test (public live, private idle, payload clean)         | Core                |
| Fix F-4 (shared query detached scope)                                     | Core promise of the API fails multi-consumer                      | Two-consumer unmount test                                                | Core                |
| Fix F-5 (required-args conditional tuple) + F-23 negative contracts       | Day-one type bug; contracts can't catch regressions               | `@ts-expect-error` contracts fail on revert                              | Core                |
| Rewrite permissions docs track on Better Auth Organization (F-6)          | Flagship guide teaches the forbidden model                        | No org-table/role-column snippets in `docs/content`; grep guard extended | Docs                |
| Fix file-storage doc example + trust-boundary callout (F-9)               | Copy-pasters ship open storage                                    | Anonymous-call rejection asserted                                        | Docs + starter      |
| Delete `starters/vertical-ai`; strip playground org/invite/role (F-7 a,b) | Greenfield hard-cut the memos already prescribe                   | Allowlist shrinks; playground grep empty; suite green                    | Starters/playground |
| Fix F-8 (api-surface generator example)                                   | "Source of truth" page doesn't compile                            | Regenerated example compiles                                             | Docs tooling        |
| `pnpm format` + commit; wire format:check into CI (F-41)                  | Release script assumes clean tree                                 | format:check green                                                       | Repo                |

### Next — before broader release

| Item                                                                                                                                                               | Why next                                        | Acceptance criterion                                | Belongs in   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------- | ------------ |
| Env-gate SSR `authError` (F-11); `no-store` on token-bearing SSR responses + docs (F-10); constrain canonical-redirect cookies (F-27)                              | Hardening of real but conditional exposures     | The three acceptance tests in §4                    | Core         |
| Consolidate token resolution (F-13) and config defaults/normalization (F-16/F-17)                                                                                  | Drift class that produces prod-only bugs        | One resolver; each default literal once             | Core         |
| Fix unauthorized matcher (F-24), `convex:pending` defaults (F-25), upload guard (F-14), storage-URL typing (F-15), permissions `TContext` (F-18), error ref (F-19) | User-visible correctness/type fixes, each small | Per-finding tests                                   | Core         |
| Shrink `useConvexCall` (F-12); delete `./composables` subpath (F-20)                                                                                               | Narrow the surface while unreleased             | Contract scripts agree                              | Core         |
| Merge `agency` into a team recipe; rebase `mcp-agent` on Better Auth org (F-7 c,d); one starter status doc (F-7 e)                                                 | Complete the boundary cut                       | Allowlist `[]`; mcp-agent's 71 tests green          | Starters     |
| Cut `2.ai-agents-and-mcp.md` claims to provable ones; add platform-auth invariant tests (F-21)                                                                     | Claims currently exceed evidence                | Every claim names a runnable command                | Docs/starter |
| ConvexUser augmentation fixture (F-22)                                                                                                                             | Documented contract, zero coverage              | consumer-smoke fails on break                       | Tests        |
| Consolidate root memos → 1 + `/research/`; delete cruft (F-40, F-29)                                                                                               | Contributor findability                         | ≤1 root direction doc; `git clean -nd` unsurprising | Repo         |

### Later — only after requirements prove them

| Item                                                                                                                       | Why later                                                                     | Acceptance criterion                  | Belongs in |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- | ---------- |
| P3 cleanups (F-30…F-39, F-42)                                                                                              | Real but low-harm; batch opportunistically                                    | Per-finding                           | Core       |
| Mutation/action single factory                                                                                             | ~90% duplication, but both are stable and tested — refactor only when touched | Suite green, no API change            | Core       |
| Split `useConvexPaginatedQuery.ts` (953 LOC)                                                                               | Only if a bug forces it                                                       | —                                     | Core       |
| Publish the "Rejected Paths" list (generic authz DSL, org composables in core, MCP/OAuth in core, billing rollups) as docs | Makes intentional non-support visible to contributors                         | Docs page exists                      | Docs       |
| E2E in CI with a seeded Convex deployment                                                                                  | Worth the cost only once the Now-bucket lifecycle tests exist                 | Green e2e on the auth+query lifecycle | Tests      |

Core scope should otherwise stay frozen per `final-vnext.md:184-193`. Everything in this roadmap reinforces the boundary: fixes land in core, product semantics land in starters/recipes, and the docs teach exactly one tenancy model.

---

## 10. Literature Notes

**Local sources used (all shaped the audit):**

- `README.md`, `package.json` — surface/scripts inventory; release-script assumptions (F-41).
- `final-vnext.md`, `new-direction.md`, `roadmap.md`, `grilling-decisions.md`, `ai-learnings.md` — the product thesis and non-negotiables tested in §5; notably `roadmap.md:17-19` ("No app-owned mirrors… If we cut over, we delete the old path") and `final-vnext.md:49,168,184-193,249-263,364-393,439,609`, which prescribe most of the cuts this audit recommends (F-6, F-7, F-21, F-29).
- `docs/content/docs/8.architecture/1.saas-kit-direction.md`, `2.ai-agents-and-mcp.md` — direction vs evidence gap (F-21).
- `docs/content/docs/1.guide/5.concepts.md`, `4.auth-security/1.authentication.md`, `2.permissions.md`, `0.permissions-setup.md`, `3.standard-role-template.md`, `1.guide/4.permissions.md` — the contradiction at the heart of F-6.
- `docs/content/docs/6.advanced/5.file-storage.md` (F-9), `7.module-config.md`, `8.api-surface.md` (F-8), `7.recipes/3.user-augmentation.md` (F-22).
- `test/TESTING.md` — four-tier deterministic test strategy; used to judge tier placement of missing invariants.
- Starter `README.md`s, `starters/IMPLEMENTATION_STATUS.md`, `starters/research/004-starter-matrix.md` — starter provenance and status drift (F-7).
- Installed package sources as ground truth for platform behavior: `nuxt/dist/app/composables/asyncData.d.ts` (Nuxt 4 `error: Ref<ErrorT | undefined>`, F-19) and `convex` package types (`FunctionReference`, `OptionalRestArgs`, `PaginationResult` — F-5 and pagination semantics), read from `node_modules` at the pinned lockfile versions.

**External sources:** No external URLs were retrieved during this audit; the environment ran offline against the repo and its lockfile-pinned dependencies. Platform claims (Nuxt `useAsyncData`/runtime-config env overrides, Convex function references/pagination journal behavior, Better Auth Organization semantics) were verified against the **installed** versions of those packages rather than live documentation. Before acting on F-16 (Nuxt env-override behavior) and F-26b (Convex pagination journal/cursor semantics), re-confirm against current official docs (nuxt.com/docs, docs.convex.dev, better-auth.com/docs) — behavior may have moved past the pinned versions. No recommendation in this report is based on unpinned memory of external APIs.

**Confirmation methodology:** Findings marked CONFIRMED were proven by executable evidence produced during this audit — two failing reproduction tests in the real `@nuxt/test-utils` harness (F-1, F-2, files removed after capture) and two `tsc` probes compiled against the built `dist/` (F-5, F-22). Findings marked _Hypothesis_ (F-3 visible-bleed portion, F-4, F-27, F-28 TTL-driver portion) state exactly what test would prove them; each is written so that test can be added directly.
