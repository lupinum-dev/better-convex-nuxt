# Better Convex Nuxt vNext — Internal Architecture and Maintenance Specification

## Status and authority

This document is the implementation specification for the internal cleanup that accompanies the breaking vNext release.

Implementation status: **senior Phase 0 only**. The `ConvexClientHandle`, `auth.skipRoutes`, and `auth.unauthorized` contracts were reconciled on 2026-07-09 and are now expressed in `vNext.md` (§5.4 and §5.1). Broad implementation remains blocked until every Phase 0 proof in section 20 passes.

It complements `vNext.md`:

- `vNext.md` owns public behavior, public API, migration semantics, and the six release phases.
- This document owns internal structure, state ownership, deletion work, dependency boundaries, lifecycle discipline, code-quality standards, and maintenance gates.
- If the documents disagree about observable behavior, `vNext.md` wins.
- If an implementation satisfies the public contract but violates an ownership, isolation, purity, or teardown invariant in this document, the implementation is not complete.

This is a hard-cutover plan. It does not authorize compatibility wrappers, parallel internal implementations, speculative extension points, or abstractions whose only justification is possible future reuse.

## 1. Executive decision

The vNext release must include a substantial internal cleanup.

The repository is healthy, not rotten. Its strongest practices must be preserved: explicit types, focused pure helpers, strong release checks, and extensive behavior tests. The cleanup is nevertheless necessary because the largest complexity hotspots are exactly the files vNext must change for auth, identity isolation, query execution, errors, and server calls.

The objective is not to make every file smaller or to apply a fashionable architecture. The objective is to leave one obvious owner for every important concept, delete integration machinery already owned by Nuxt, Convex, or Better Auth, and make security and race invariants mechanically verifiable.

The governing rule is:

> delete → simplify → replace → add

A cleanup change is in scope only when it does at least one of the following:

1. Deletes an obsolete public or private path.
2. Removes duplicate state or duplicate protocol ownership.
3. Makes an invalid state unrepresentable.
4. Establishes a package or environment boundary.
5. Makes a race, isolation, teardown, or serialization invariant testable.
6. Removes historical or generated material from the maintained source surface.
7. Replaces an ad hoc protocol implementation with an official dependency primitive.

Pure renames, mass file movement, style-only rewrites, generic service layers, and abstraction for hypothetical consumers are out of scope.

## 2. Verified baseline and corrections to prior feedback

The implementation team must use this evidence, not the unverified claims in prior reviews.

### 2.1 Verified strengths

- `src/**/*.ts` contains 87 TypeScript files and approximately 14,090 lines. Counting non-TypeScript source artifacts produces a larger source surface.
- Production TypeScript contains no explicit `any` escapes, `@ts-ignore`, or `@ts-expect-error` directives.
- No `TODO` or `FIXME` markers exist in production source.
- No obvious unreferenced file exists under `src/runtime/utils`; this is a static import-graph observation, not proof that every abstraction remains necessary.
- Upload transport is already shared correctly through `src/runtime/utils/upload-core.ts`.
- The module-builder cleanup in `build.config.ts` is a documented packaging workaround, not accidental complexity.
- The release script contains meaningful branch, worktree, tag, changelog, and npm collision checks.

### 2.2 Verified structural hotspots

| File                                                 | Current size | Verified issue                                                                                                        |
| ---------------------------------------------------- | -----------: | --------------------------------------------------------------------------------------------------------------------- |
| `src/runtime/composables/useConvexPaginatedQuery.ts` |  1,061 lines | One large orchestration closure; duplicates query gate, keying, transform, and hydration mechanics                    |
| `src/runtime/composables/useConvexQuery.ts`          |    801 lines | One large orchestration closure; mixes execution planning, transport, hydration, subscription, and presentation state |
| `src/runtime/auth/client-engine.ts`                  |    640 lines | One large factory owns identity, refresh, hooks, operations, proxying, and side effects                               |
| `src/runtime/utils/logger.ts`                        |    598 lines | Duplicated server/browser formatting, unsafe serialization paths, raw-data exposure risk, mutable method patching     |
| `src/module.ts`                                      |    530 lines | Defaulting, validation, registration, templates, and runtime configuration are interleaved                            |
| `src/runtime/utils/convex-cache.ts`                  |    422 lines | Reimplements subscription ownership, reference counts, bridges, and payload registries above Convex                   |
| `src/runtime/server/utils/auth-snapshot.ts`          |    378 lines | Multiple identity acquisition paths and significant request-scoped auth orchestration                                 |
| `test/nuxt/useConvexPaginatedQuery.nuxt.test.ts`     |  1,508 lines | Behavior coverage exists but is not organized by invariant                                                            |

`useConvexMutation.ts` and `useConvexAction.ts` also contain materially parallel call lifecycle, error, callback, and `.safe()` paths.

### 2.3 Corrections to external review claims

- Public composables do not all have complete JSDoc or multiple examples. `useConvexCall`, `useConvexUser`, `useConvexUploadQueue`, and `createBetterConvexAuthClient` are counterexamples. vNext deletes two of these surfaces; retained exports need intentional documentation.
- The source contains stale references. `eslint.config.mjs` recommends nonexistent `useConvexRpc`, while `README.md` and an auth documentation page present playground-only `useAuthClient()` as a library API.
- The two `better-convex:auth:refresh` hooks in `client-engine.ts` are mutually exclusive branches, not two simultaneously active duplicate handlers. The hook command bus should still be replaced by direct per-app coordination.
- `research/` contains approximately 15,999 lines and 41 `verify-*.sh` scripts, plus another shell inspection script. `experiments/` contains approximately 1,382 lines. These are much larger than previously reported.
- Empty `feature-templates/` directories are not Git-tracked. Removing them locally is housekeeping, not a repository change or release deliverable.
- The logger is not mostly declarative event types. It contains substantial duplicated formatting implementation and must receive safety-focused cleanup.
- Existing changelog headings are descending, but the `v0.4.0` release section is genuinely missing even though the tag exists.
- There are seven top-level starter directories but only six starter lockfiles. `starters/research` is documentation, and `starters/platform-auth` is a proof fixture rather than a usable starter.
- No evidence supports a fixed “two week” estimate or a claim that the earlier list was complete. Work is accepted by invariants and gates, not an arbitrary duration.

### 2.4 Additional adversarial-review findings

- Convex 1.32 and 1.38 deduplicate identical subscriptions by function and arguments and release the wire query after the final listener, so Better Convex Nuxt's parallel registry is deletable.
- Convex client-local query identity does not include the authenticated user. A fresh listener can receive a resident result produced for a previous identity. Identity-keyed Vue state and stale-promise guards alone are insufficient.
- Structural isolation therefore requires one replaceable current primary client on stable identity-key change; same-user token rotation retains the client.
- The original raw `useConvex(): ConvexClient` contract conflicts with replaceable clients. Current `vNext.md` has replaced it with `ConvexClientHandle`; the targeted review (2026-07-09) fixed the surface at `query | mutation | action | onUpdate` — `onUpdate` retained for Ginko's Studio bridge and contingent on the `vNext.md` §5.8 rebinding proof; `connectionState` removed.
- Vue app unmount starts synchronous callbacks and does not await returned promises. Nuxt SSR does not mount/unmount a browser app. Browser, SSR request, and HMR lifetimes need distinct rules.
- Convex's default browser client installs a `beforeunload` listener; every library-created browser client must disable it explicitly.
- The root typecheck excludes the server program, and the current line-oriented package checker cannot prove multiline imports or built-entry purity.
- Current `vNext.md` has already settled four error kinds, exact `ready()` snapshot semantics, the non-discriminated token-exchange result, the normalized public configuration, the retained default-off auth cache, and retention of `useConvexUser`. This internal plan follows those decisions rather than reopening them.
- The selected proof stack is Nuxt 4.4.7, Convex 1.38.0, Better Auth and API-key 1.6.23, and `@convex-dev/better-auth` 0.12.5. Development fixtures must align before permanent proofs are accepted.

## 3. Non-negotiable internal principles

### 3.1 One owner for every important concept

| Concept                                                               | Sole owner after vNext                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Effective build configuration                                         | Pure module build-plan resolver                                |
| Normalized public runtime configuration                               | Per-Nuxt-app runtime context                                   |
| Server secrets and server-only limits                                 | Nitro private runtime config                                   |
| Auth identity, auth epoch, identity generation, and public auth error | Per-app auth context                                           |
| Auth operation progress count                                         | Per-app pending-operation tracker                              |
| Primary client instance for the current identity generation           | Per-app runtime client owner                                   |
| Query wire deduplication and per-transport local cache                | Current `ConvexClient` instance                                |
| SSR payload reuse                                                     | Nuxt payload and async-data key                                |
| Mounted query result and transform                                    | Individual composable instance                                 |
| Explicit Vue state sharing                                            | One `defineSharedConvexQuery` definition instance per Nuxt app |
| Pagination page and cursor generation                                 | One pagination controller per composable instance              |
| Connection-state snapshot                                             | Per-app runtime client owner                                   |
| Server credential snapshot                                            | One `ServerConvexCaller` instance                              |
| Cross-request auth-token cache                                        | Server cookie-resolution cache owner                           |
| Generic call-error representation                                     | Framework-free `/errors` entry                                 |
| Product authorization interpretation                                  | Consumer application                                           |
| Logger instance and sanitization policy                               | Per-app runtime context                                        |
| DevTools state                                                        | One bounded per-app `DevtoolsSink`                             |
| App-lifetime resource cleanup                                         | Per-app runtime disposer                                       |
| Component query-listener cleanup                                      | Owning Vue effect scope                                        |
| SSR detached-resource cleanup                                         | Request-scoped disposer, when such resources cannot be avoided |

No implementation may introduce a second registry, inferred reconstruction path, or cache for any row without a senior-approved amendment to this document.

### 3.2 Delegate dependency-owned mechanics

- Nuxt owns application instances, SSR payloads, plugin order, runtime configuration, and application teardown.
- Convex owns query transport, wire-level deduplication, local query caching, function references, and official HTTP execution.
- Better Auth owns session operations and plugin client methods.
- Better Convex Nuxt owns deterministic coordination between those systems.
- Applications own authorization policy, redirects caused by business errors, roles, permissions, and product workflows.

### 3.3 No generic internal framework

Do not add a generic state-machine library, service container, repository layer, event bus, universal query engine, universal request engine, generic adapter hierarchy, or dependency-injection framework.

Small domain-local pure functions are preferred. An abstraction must have two real users with the same invariant, or one user whose complexity becomes materially safer through the extraction.

### 3.4 No aesthetic churn

Do not move untouched files solely to perfect a directory tree. Move or split a file only when its owning phase changes its responsibility. Preserve the existing upload layering and the documented DevTools packaging workaround unless a replacement deletes real machinery and passes equivalent packed-package tests.

## 4. Target internal architecture

### 4.1 Per-application runtime context

Create exactly one private runtime context for each Nuxt application:

```ts
interface BetterConvexRuntime<Client extends object = BaseAuthClient> {
  readonly config: ConvexRuntimeConfig
  readonly auth: ConvexAuthContext<Client>
  readonly clients: {
    getPrimary(): { client: ConvexClient; identityGeneration: number } | null
    replacePrimary(input: {
      identity: ConvexIdentityKey
      authEpoch: number
      identityGeneration: number
      isCurrent: () => boolean
      initialize: (candidate: ConvexClient) => Promise<void>
    }): Promise<ConvexClient>
    getAnonymous(): ConvexClient | null
  }
  readonly logger: Logger
  readonly devtools: DevtoolsSink | null
  addDisposer(dispose: () => void | Promise<void>): void
  dispose(): Promise<void>
}
```

Required constraints:

- The runtime context is private and is not a public service locator.
- The auth context is the sole owner of identity generation.
- The anonymous client is created lazily.
- The primary browser client is identity-scoped. Replace it when the stable identity key changes between anonymous and authenticated identities or between two users. Retain it for same-user token rotation.
- The runtime client owner creates, epochs, publishes, and closes client instances. The auth context supplies the candidate initialization handshake; the client owner does not interpret tokens or auth results.
- The connection-state store lives inside the runtime client owner. Today's implementation is a module-level `WeakMap` partitioned per app (`useConvexConnectionState.ts`); the deletion rationale is single ownership, not leakage.
- Replacement is latest-revision-wins. At switch start, mark replacement in flight and retire the public/current primary handle so imperative dispatch waits. After initialization and immediately before commit, synchronously check `isCurrent()` and disposed state; a stale candidate closes without incrementing epoch or publishing. No await occurs between the final guard and publication.
- There is one current primary client, not a user-indexed pool. Unsubscribe identity-sensitive work from the previous client and close it after the replacement is published.
- Every browser `ConvexClient` is constructed with `unsavedChangesWarning: false`; the dependency's default `beforeunload` listener is not acceptable for replaceable or HMR-tested clients.
- In an auth-enabled browser application, `auth: 'none'` uses a client that has never received an auth token.
- In an auth-disabled application, the primary anonymous client may be reused.
- Server rendering must not allocate WebSocket clients.
- Shared-query state is not stored on the runtime context. Each `defineSharedConvexQuery` definition closure owns its per-app state through one `WeakMap<NuxtApp, SharedState>`; the runtime participates only in app/request cleanup.
- Remove the public/raw `$convex` and `$auth` Nuxt-app/component augmentations with the raw-client contract amendment in section 4.4. All internal application state is reached through one private runtime attachment.
- Mutable application state must never be module-global.
- A frozen module-level disabled-auth value is allowed because it contains no application state.
- Initialization is HMR guarded and teardown is explicit.

Delete scattered ownership through `$convexAuthEngine`, `_bcnUnauthorizedRecoveryState`, `_convexRefreshAuthPromise`, module-global DevTools registries, the module-global connection-state store, the upload-queue sequence counter, shared logger caches, development-only single-value window globals, and equivalent private fields. DevTools UI request/binding state must be instance-owned rather than module-global.

### 4.2 Lifecycle and disposal

Register browser runtime teardown through Vue application unmount using `vueApp.onUnmount`. Do not assume a Nuxt `app:beforeUnmount` hook that is absent from the installed Nuxt hook contract.

`dispose()` is idempotent and concurrent calls return the same promise. Before its first await it marks the runtime disposed and advances its invalidation revision, so no late initializer or async completion can attach a resource or mutate state. It then:

1. Stop auth/session listeners.
2. Stop app-lifetime and request-lifetime shared-query scopes.
3. Immediately invoke rather than store any disposer registered after disposal began.
4. Stop connection listeners.
5. Close primary and anonymous `ConvexClient` instances by awaiting `close()`.
6. Disconnect DevTools transports.
7. Clear timers and pending retry work.
8. Collect errors without preventing remaining cleanup.

Individual query listeners are released by their owning Vue effect scope and are not registered a second time with the app disposer.

Vue does not await an app-unmount callback. Register `nuxtApp.vueApp.onUnmount(() => { void runtime.dispose() })`; tests and explicit host teardown call and await `runtime.dispose()` directly.

During active disposal, promises returned by late disposer registration join the current drain. After disposal completes, late cleanup still runs immediately and any error is reported safely. Async initializers check disposed state after every await and self-close before attachment.

Plugin reevaluation for the same Nuxt app reuses the live runtime and creates no new client, auth engine, logger, transport, or teardown hook. Replacing one Nuxt app with a different app instance disposes the old runtime before the replacement is treated as ready.

SSR does not rely on Vue unmount. Prefer allocating no detached SSR scope: queries use one-shot request execution and no WebSocket client. If an app-level abstraction must create a detached scope during SSR, Internal Phase 0 must first prove one request-completion path that runs for successful and failed renders; until that proof exists, the detached server scope is forbidden.

### 4.3 File-layout rule

Directory layout is not an acceptance criterion. Create the framework-free public entry directories required by package boundaries and extract domain-local files only while their owner is being rewritten.

- Module build-plan helpers stay beside `module.ts`.
- Auth transitions stay beside the auth coordinator.
- Query execution, identity, key, and pagination helpers stay beside query composables.
- Callable lifecycle stays beside mutation/action composables.
- Server caller, exchange, snapshot, and proxy code stay inside the server boundary.
- DevTools state, bridge, and transport stay inside the DevTools boundary.
- Leave the existing upload core in place unless the error-boundary change already requires moving the touched files.

Do not create `utils/core` or perform a mass move to match a target tree. A remaining `utils` directory is reserved for genuinely cross-domain, stateless primitives.

### 4.4 `useConvex()` and replaceable clients

The original public `useConvex(): ConvexClient` contract conflicts with structural client replacement. Code that captures the raw primary client receives a closed, stale instance after anonymous ↔ user or user A ↔ user B. A stable proxy pretending to be a complete `ConvexClient` would have to own raw subscription migration, `setAuth`, `clearAuth`, `close`, receiver identity, and third-party `instanceof` behavior, recreating the machinery this cleanup deletes.

The targeted review (2026-07-09) resolved this. The contract in `vNext.md` §5.4 is authoritative:

```ts
export interface ConvexClientHandle {
  query: ConvexClient['query']
  mutation: ConvexClient['mutation']
  action: ConvexClient['action']
  onUpdate: ConvexClient['onUpdate']
}

declare function useConvex(): ConvexClientHandle
```

The stable handle exposes receiver-preserving wrappers with stable function identity. Each invocation uses the current primary client and epoch; when an identity replacement is already in progress, it awaits that captured replacement and never dispatches to the superseded client. Replacement failure throws the normalized auth error. It does not expose `connectionState`, `setAuth`, `clearAuth`, or `close`. `useConvexConnectionState` owns connection observation; high-level query composables remain the normal subscription API. `onUpdate` is retained solely because Ginko's standalone Studio subscribes through `bridge.convexClient.onUpdate` and has no composable-based alternative; the owner rebinds active listeners A→B before publishing B, keeps the returned unsubscribe function stable, and must pass the `vNext.md` §5.8 rebinding proof. If that proof fails, the handle narrows to `query | mutation | action` and Phase 5 gains a funded Studio subscription-migration work item. This is the one direct imperative replacement for the deleted `useConvexCall`, without duplicating `.safe()` methods or stateful composables.

An invocation dispatched immediately before a switch captures its identity generation. After awaiting the Convex operation, it returns the result only if the epoch is still current and no replacement began. Otherwise it discards the value and throws `ConvexCallError({ kind: 'authentication', code: 'IDENTITY_CHANGED' })` without placing the old result in `data` or `cause`. A stale mutation/action may already have committed under the original identity, so this error is not safe-retry evidence.

Returning a raw client, an undocumented epoch snapshot, or relying on same-client cached-emission timing is not acceptable. The rebinding proof is the sole gate on `onUpdate`; widening beyond the four methods requires a new senior-approved review.

## 5. Configuration and module construction

### 5.1 One build-time resolver

Replace the interleaved defaulting and registration logic in `module.ts` with one pure resolver:

```ts
interface ModuleBuildPlan {
  readonly registration: {
    readonly coreClientPlugin: true
    readonly clientAuthPlugin: boolean
    readonly serverAuthPlugin: boolean
    readonly authProxy: boolean
    readonly routeMiddleware: boolean
  }
  readonly publicRuntime: ConvexPublicRuntimeConfig
  readonly privateRuntime: ConvexPrivateRuntimeConfig
  readonly authClientDefinition: ResolvedBuildOnlyDefinition | null
}
```

This resolver is the only code that:

- applies module defaults;
- validates invalid option combinations;
- resolves URLs and build-time definition files;
- decides plugin, middleware, proxy, and handler registration;
- separates public and private runtime configuration;
- produces normalized shapes used by templates and registration.

Do not hand-spread nested `??` defaults inside `defu`. Materialize the complete configuration once, then assign the resolved public and private shapes.

### 5.2 Public versus private runtime configuration

The normalized public shape is the exact `ConvexRuntimeConfig` locked in `vNext.md` §5.7. It includes the Convex URL, `siteUrl`, the normalized false-or-options auth object, query/upload defaults, and logging. Some values such as `siteUrl` and `trustedOrigins` are also consumed by server code, but they are not secrets and remain public because the public contract exposes them. This internal plan does not silently narrow that contract.

Private runtime configuration owns only values not exposed by §5.7:

- exchange timeout and response-size limits not supplied per call;
- server tracing details;
- server secrets absent from the normalized public contract.

`auth.proxy` already contains the public proxy limits and has one normalized value consumed by browser registration and server handlers. Mutable auth-cache entries are implementation state owned by the server cookie-resolution cache, never runtime configuration.

Build-only filesystem paths must never appear in runtime configuration, SSR payloads, published declarations, browser chunks, the package tarball, or final Nitro output. A consumer-local generated `.nuxt` type template may reference the resolved host, layer, or installed-package auth definition; that path is build output for the consumer and must not leak into published or runtime artifacts.

No composable may call `useRuntimeConfig()` or normalize configuration independently. Composables read the already normalized per-app runtime context.

### 5.3 Auth-disabled topology

The public `auth?: false | ConvexAuthOptions` contract is the simplest correct contract. Omission installs authentication with defaults, an object customizes it, and `false` removes it. Adding `true`, restoring nested `enabled`, or inferring disablement from missing files or environment variables would create duplicate or ambiguous configuration states.

`auth: false` must be resolved at build time into absence, not dormant runtime branches:

- no Better Auth client plugin;
- no auth engine;
- no auth server plugin;
- no auth proxy route;
- no auth middleware;
- no Better Auth runtime import in the browser graph;
- an always-available disabled auth context for `useConvexAuth()`;
- `optional` executes anonymously immediately;
- `required` remains idle;
- `none` executes anonymously.

The packed auth-disabled fixture must prove bundle absence, not only runtime non-execution.

## 6. Authentication internals

### 6.1 Identity as a discriminated value

Use one discriminated identity state:

```ts
type AuthIdentity =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'anonymous' }
  | {
      status: 'authenticated'
      token: string
      user: ConvexUser
      key: `user:${string}`
    }
```

Do not represent identity through independent booleans for token, user, authentication, and loading. Do not manufacture empty strings for absent Better Auth user fields. The public `ConvexUser` contract must model actual optionality, or decoding must reject values that fail its required schema.

Stable cache identity is Better Auth `user.id`, never a JWT and never a token hash.

### 6.2 Independent operation progress

Authentication operations remain independent from usable identity:

```ts
interface AuthOperations {
  readonly activeCount: Readonly<Ref<number>>
  readonly isPending: ComputedRef<boolean>
}
```

The auth context owns one orthogonal `error: Ref<ConvexCallError | null>`. Public status derives in the order locked by `vNext.md`: disabled, loading, authenticated, error, anonymous. Therefore a failed background refresh may expose `status === 'authenticated'` plus a non-null error while preserving usable identity. The pending tracker owns only the operation count; it is not another error or identity source.

This makes concurrent sign-in, sign-up, sign-out, and refresh progress deterministic through a count rather than a lossy boolean.

### 6.3 One effect coordinator

The per-app auth context owns:

- the single Better Auth client;
- identity state, public error, monotonically increasing `authEpoch`, and monotonically increasing `identityGeneration`;
- the initial-settlement promise;
- one refresh promise tagged with the auth epoch it synchronizes;
- pending-operation accounting;
- `ready()`;
- integrated sign-in and sign-up wrapping;
- sign-out and revocation transitions;
- Convex `setAuth` coordination.

Pure transition functions calculate next state. One coordinator performs effects. Do not add a generic state-machine dependency.

Delete the Nuxt hook command bus for auth refresh. Internal callers invoke context methods directly.

### 6.4 `ready()` implementation rule

Implement the exact semantics locked in `vNext.md` §5.3 as a snapshot operation:

- Capture the current initial-settlement promise and the refresh promise active at call time, if any.
- Await only that captured promise set under one deadline. The default is 5,000 ms; `timeoutMs: 0` disables the timer.
- If identity is settled and no refresh is active, resolve immediately with the current public status.
- A refresh or auth operation that starts after the call is not awaited.
- Captured rejection is reflected through auth state; `ready()` returns current status and never rejects.
- A revision replacement caused by sign-out, revocation, user switching, or teardown must settle or invalidate captured work without hanging. The waiter does not recapture the new revision's work.
- In an auth-disabled build, resolve immediately with `'disabled'`.
- Callers that captured the identical promise set may share one composed promise. Callers that captured different refresh work may not.

The implementation may not redefine `ready()` to mean “no auth operation is active.” Identity settlement and operation progress are separate contracts.

### 6.5 Auth race invariants

Use the two auth counters locked by `vNext.md` plus local execution revisions:

- `authEpoch` belongs to the auth context and invalidates stale auth-operation work;
- `identityGeneration` belongs to the auth context, changes only when the stable identity key changes, and invalidates identity-owned transport and application state;
- `executionRevision` belongs to an individual query, callable, upload, or pagination controller and invalidates its local async work.

Integrated sign-in, sign-up, and sign-out share one per-app serial identity-operation queue and execute in invocation order. An operation receives its `authEpoch` before its effect; a failed or non-session result publishes no candidate. Background refresh is separately single-flight and cannot commit across `authEpoch`. Same-user token rotation changes `authEpoch` but not `identityGeneration`; an identity-key change advances both before publishing replacement-owned state.

Sign-out advances `authEpoch` before awaiting Better Auth. A failed sign-out retains the existing identity and primary client under that newer auth epoch; a successful sign-out begins anonymous-client replacement. Definitive revocation advances the auth epoch before asynchronous cleanup and cannot be undone by older work.

The token fetcher passed to `ConvexClient.setAuth` never rejects. It catches and records failures. A transient failure may return the retained token only while the same non-revoked authenticated revision remains usable; definitive absence or revocation returns `null`.

When transient failure returns an unchanged retained token, schedule one coalesced coordinator retry with delays of 1, 2, 4, 8, 16, then at most 30 seconds. Continue only while the token's validated `exp` remains in the future. Stop on success, revision change, definitive rejection, expiry, or teardown; reset the attempt after success. A retained token is never returned at or after expiry, and a token without a valid required expiry is not retainable. The pinned Convex client does not guarantee another refresh when the returned token is unchanged.

Required transitions include:

- SSR anonymous → hydrated anonymous without authenticated UI flicker;
- SSR authenticated → hydrated authenticated without anonymous execution;
- loading → anonymous;
- loading → authenticated;
- loading → anonymous with an error, which derives public `status === 'error'`;
- anonymous → authenticated through integrated sign-in/sign-up;
- authenticated user A → same user A with rotated token;
- authenticated user A → authenticated user B;
- authenticated → anonymous through sign-out;
- authenticated → anonymous through definitive session revocation;
- authenticated → authenticated plus background refresh error;
- concurrent operations completing out of order;
- teardown while an operation is pending;
- two Nuxt applications in one process;
- error → authenticated through a successful sign-in without a preliminary refresh;
- error → anonymous through a later successful anonymous settlement;
- redirect initiation without synchronization and return-navigation settlement through SSR cookie exchange;
- auth-disabled builds, where identity remains disabled.

Integrated sign-in and sign-up resolve only after the auth context has synchronized the resulting Convex identity. Proxy wrappers must preserve method receivers by applying original methods to their owning client object.

### 6.6 Route skipping and unauthorized recovery

Prior drafts of `vNext.md` retained `auth.skipRoutes` and `auth.unauthorized`, but neither had a complete implementable contract:

- `skipRoutes` does not define SSR settlement, initial client settlement, navigation onto/off a matched route, `required`/`optional` behavior, or interaction with route protection. Any route-dependent identity settlement contradicts the one-identity and optional-waits rules.
- `unauthorized.includeQueries` requires a query-origin authorization signal, while the error contract correctly forbids message/data guessing and keeps product `ConvexError` values as `server`. A definitive auth-engine rejection has no meaningful `includeQueries` dimension.

That Phase 0 amendment landed in `vNext.md` §5.1 on 2026-07-09: `auth.skipRoutes`, `auth.unauthorized`, old `skipAuthRoutes`, page-meta `skipConvexAuth`, `auth-unauthorized-core.ts`, `auth-unauthorized.ts`, per-call recovery branches, and their docs/tests/config are deleted in Phase 1. Public operations use query-level `none`; Convex-only applications use `auth: false`; protected-route navigation uses `routeProtection`; applications own redirects caused by business authorization.

Definitive auth-engine token rejection or session revocation must clear token and user and transition to anonymous. Application authorization errors remain application errors.

## 7. Query architecture

### 7.1 Prove Convex ownership before deletion

The installed Convex client documents that `BaseConvexClient` deduplicates identical query subscriptions. Before deleting the current custom manager, add an instrumentation fixture that proves:

1. Two `onUpdate()` listeners for the same function and arguments on one client produce one wire subscription.
2. Both listeners receive updates.
3. Removing one listener leaves the other active.
4. Removing the final listener produces one wire `Remove` and releases the subscription.
5. Remount is correct whether Convex serves a still-resident value or reacquires it; indefinite cache retention is not a library contract.
6. Same-user auth-token rotation produces zero new listener acquisitions and zero wire `Add`/`Remove` messages. A server `QueryUpdated` is allowed.
7. Reusing one primary client across user A → user B reproduces delivery of an identity-blind resident A result for the same function and arguments.
8. Replacing the primary client on identity-key change prevents that delivery for regular, shared, and paginated queries.

Run the permanent wire fixture against the exact Convex version pinned in `vNext.md` and rerun it whenever the pinned Convex version changes. Observe protocol effects through a version-correct fake `webSocketConstructor`, not spies on Better Convex Nuxt internals.

If the fixture passes, delete:

- `subscriptionRegistry` and `SubscriptionEntry`;
- reference counts;
- query bridges and bridge listeners;
- `acquireQuerySubscription` and `releaseSubscription`;
- `clearSubscriptionCache` and `clearAuthSubscriptions`;
- payload-key registries and counts;
- public-only payload discovery and purge orchestration whose only purpose was the custom registry.

If any proof fails, stop. A senior must document the exact missing Convex behavior and approve the smallest compensating owner. The junior must not preserve the entire existing cache speculatively.

Deleting the payload registry does not delete sign-out cleanup. The replacement source of truth is the library-owned payload-key grammar, produced only by `createConvexQueryKey` plus `withAuthDimension` (vNext Phase 3): `convex:<functionName>:<argsHash>:auth:<mode>:<identityKey>` for `required`/`optional`, `convex:<functionName>:<argsHash>:auth:none` for `none`, and the same shapes under the `convex-paginated:` namespace. Sign-out/identity purge scans only these two namespaces and removes keys whose `:auth:` mode segment is `required` or `optional`; `none` keys are retained; no registry or count is consulted; keys outside these namespaces are never touched. Delete `clearAuthSubscriptions` only in the same change that makes every composable release its own listener on execution/identity invalidation. No phase-boundary commit may contain neither mechanism.

### 7.2 Small query execution plan

Phase 1 freezes one private auth port consumed by query gating and client replacement:

```ts
interface AuthIdentityPort {
  snapshot(): {
    authEnabled: boolean
    settled: boolean
    identityKey: ConvexIdentityKey | null
    authEpoch: number
    identityGeneration: number
    /** Non-null only when initial resolution failed without usable identity; feeds the `state: 'error'` execution plan. */
    error: ConvexCallError | null
  }
  waitForInitialSettlement(): Promise<void>
  subscribe(listener: () => void): () => void
  initializePrimary(candidate: ConvexClient, authEpoch: number): Promise<void>
}
```

Phase 1 adapts the existing auth engine to this port. The adapter is the sole publisher of `authEpoch` and `identityGeneration`; the legacy engine's internal `authGeneration` never crosses the port, and no query or client-owner code may read engine state except through `AuthIdentityPort`. Phase 3 replaces only the adapter/provider with the final auth coordinator. Query composables and the client owner must not learn Better Auth session shapes or be redesigned again in Phase 3.

Extract only the invariants shared by regular and paginated queries:

```ts
type QueryExecutionPlan =
  | {
      readonly state: 'idle'
      readonly reason: 'skip' | 'required-without-identity' | 'auth-disabled-required'
      readonly identityKey: ConvexIdentityKey | null
      readonly executionRevision: number
    }
  | {
      readonly state: 'waiting'
      readonly reason: 'auth-settlement' | 'client-replacement'
      readonly identityKey: null
      readonly executionRevision: number
    }
  | {
      readonly state: 'error'
      readonly reason: 'auth-resolution'
      readonly identityKey: null
      readonly executionRevision: number
      readonly error: ConvexCallError
    }
  | {
      readonly state: 'execute'
      readonly identityKey: ConvexIdentityKey
      readonly payloadKey: string
      readonly executionRevision: number
      readonly isolation:
        | {
            readonly kind: 'identity'
            readonly identityKey: ConvexIdentityKey
            readonly identityGeneration: number
          }
        | {
            readonly kind: 'none'
            readonly transportEpoch: number | 'server'
          }
      readonly transport:
        | {
            readonly kind: 'primary' | 'anonymous'
            readonly client: ConvexClient
            readonly acquisition: 'live' | 'once'
          }
        | {
            readonly kind: 'server'
            readonly acquisition: 'once'
          }
    }
```

The browser anonymous transport is created once per app and never replaced, so its `transportEpoch` has exactly one value per app lifetime; it exists only to distinguish browser-anonymous from `'server'` and to keep the tag shape uniform. Do not implement anonymous-client replacement to justify it.

The shared query foundation may own:

- normalized explicit arguments or `'skip'`;
- auth-mode execution gating;
- selected transport/client;
- stable identity-aware key construction;
- captured concrete client and identity generation;
- captured execution revision;
- stale-commit predicate;
- common Nuxt async-data error adaptation;
- common transform fallback typing when it is genuinely identical;
- the terminal-decision contract: the initial promise resolves on first data, on an idle decision, or when `defaults.waitTimeoutMs` elapses; a settled-anonymous `required` query resolves idle without consuming the timeout.

When initial auth resolution fails without a usable identity, `optional` and `required` produce the `error` plan and do not execute anonymously. `none` remains independent and may execute through its never-authenticated client.

It must not own mounted result state, subscription registries, pagination state, callbacks, or a second cache. Do not create a universal query engine.

### 7.3 Regular-query ownership

Each mounted regular-query composable owns one `ConvexClient.onUpdate()` listener and its unsubscribe function through its Vue effect scope. It owns its Vue-visible data, error, pending state, transform, and callback lifecycle. Nuxt owns SSR payload reuse. Convex owns wire deduplication.

Every raw visible snapshot is tagged with `{ isolation, executionRevision }`. For `required`/`optional`, isolation contains `{ identityKey, identityGeneration }`; for `none`, it contains the stable anonymous transport epoch and never changes because auth identity changes. Public computed state masks a tag mismatch before data can reach a transform, callback, log event, DevTools event, or component. Capturing only an identity key is insufficient because Convex's client-local cache is identity-blind.

SSR payload adoption first validates the mode/identity-aware payload key, then retags the accepted payload into the current browser isolation tag. A payload is never adopted merely because the query function and arguments match.

### 7.4 Structural cross-user isolation

Every `required`/`optional` identity-varying holder uses the same stable identity and identity-generation dimensions. `none` state uses its separate stable anonymous-transport dimension and is unchanged by the transitions below:

- Nuxt payload and async-data key;
- live listener identity generation and execution revision;
- shared-query instance;
- pagination generation and page collection;
- retained previous-data snapshot.

On anonymous → user, user → anonymous, or user A → user B:

1. Use the `authEpoch` and `identityGeneration` already assigned by the auth coordinator for this identity transition; the client owner allocates neither counter.
2. As soon as a different stable identity is discovered, stop new work for the old identity, enter an unsettled switching state, synchronously advance affected execution revisions, and mask old data/error/pages/cursors/previous-data snapshots.
3. Create the candidate primary client and, for an authenticated identity, complete its server-confirmed auth handshake before publication. Do not depend on Convex's experimental `expectAuth` option; the private candidate receives no application work before confirmation. Apply one internal 5,000 ms confirmation deadline independent of a caller's `ready()` timeout.
4. Publish the replacement client, its assigned `identityGeneration`, and the new identity as one coordinated transition.
5. Acquire new work from the replacement client.
6. Close the previous primary client. Any callback arriving between masking and close is rejected by its old epoch/revision.

Before candidate commit, recheck the captured auth epoch and runtime disposal without awaiting between the guard and publish. A stale candidate closes privately. If the current candidate times out or definitively fails authentication, close both candidate and retired primary, leave the current primary `null`, settle anonymous with an error, clear replacement/pending state, and settle captured refresh/`ready()` work. A later refresh may recover. Never resume user A after the Better Auth session has been identified as user B. Same-user transient refresh is the only path that may retain authenticated identity and the existing primary.

`keepPreviousData` must never cross an identity boundary. At no observable point may A's payload, error, pagination page, or transformed result become visible under B.

A same-user token rotation keeps the same identity key and primary identity generation. It updates auth on the existing client and does not reacquire listeners or wire queries.

On primary-client replacement, the runtime-owned connection-state store resets synchronously to its default disconnected snapshot, unsubscribes from the old client, and subscribes to the replacement only when it has consumers. Old-epoch connection callbacks are ignored. One fixture counts connection listeners across user switching and app disposal.

### 7.5 `none` transport isolation

In an auth-enabled browser application, `none` uses the lazy anonymous client even while the primary client is authenticated. Clearing auth immediately before a `none` query is not sufficient because it races with authenticated subscriptions and mutates shared transport state.

In an auth-disabled application, the single primary client is already permanently anonymous and may serve `optional` and `none`.

### 7.6 Pagination controller

Do not adopt Convex's experimental paginated subscription API as a decade-level foundation while it remains explicitly experimental.

One controller per paginated composable owns:

- first-page acquisition;
- later-page acquisition;
- cursor chain;
- refresh;
- reset;
- current generation;
- stale-commit rejection;
- disposal.

It receives a query execution plan. It does not know about JWT comparison, auth refresh commands, payload purging, or pending auth operations.

Refresh rebuilds the page chain sequentially from each fresh `continueCursor`; it does not replay stored cursors concurrently. It abandons the commit if identity, identity generation, arguments, skip state, or page-set revision changes, then rebinds live page listeners only after a committed refresh. First-page SSR hydration arrives through the execution plan and identity-aware payload key.

### 7.7 Shared queries

Retain `defineSharedConvexQuery` only as an explicit Vue-state sharing primitive, not a wire-deduplication feature.

The definition closure solely owns a `WeakMap<NuxtApp, SharedState>`. Remove caller-selected string keys, duplicate-key collision checks, query/options fingerprinting, runtime-context lookup, and private registry mutation on the Nuxt application when the closure identity can be the canonical definition identity.

`SharedState` stores the same isolation tag and execution revision as a non-shared query. It clears or masks data and error synchronously when its applicable isolation dimension changes and never republishes older tagged state; `none` shared state does not reset for auth transitions.

Browser detached shared-query scopes register with the application disposer. SSR uses component/request scope only; no detached SSR shared scope exists unless the Phase 0 successful/error request-cleanup proof establishes its owner.

## 8. Mutations and actions

Create one private callable lifecycle used by mutations and actions only. It owns:

- latest-call generation;
- pending, data, and error state;
- callbacks;
- logging and DevTools events;
- error normalization;
- throwing and `.safe()` result paths.

Every invocation captures `{ identityKey, identityGeneration, callRevision }`. An identity or identity-generation change synchronously masks retained callable data/error and retires visible pending state for that call revision. Private network bookkeeping still completes, but a stale completion rejects the throwing promise with the same `IDENTITY_CHANGED` error used by `ConvexClientHandle`; `.safe()` returns that normalized error. It never returns the old result, invokes callbacks, emits logs, or publishes DevTools events under the new identity. A stale mutation/action may already have committed and must not be presented as safely retryable.

Convex privately retains and may reapply optimistic updates. Identity-key change closes the retired primary client, which is the only supported way to discard its private optimistic state. Locally retained optimistic handles/state are also tagged with `identityGeneration`, cleared synchronously, and forbidden from applying to the replacement client.

Inject only the operation-specific behavior:

- mutation invocation and optional optimistic update;
- action invocation.

Do not include queries, pagination, uploads, or server calls in this abstraction. Do not export it. The lifecycle abstraction is accepted only if the final mutation and action composables no longer contain separate copies of the same pending, normalization, callback, and `.safe()` algorithm.

## 9. Errors

### 9.1 Framework-free boundary

The `/errors` entry contains no Nuxt, Vue, Nitro, Better Auth, DOM, or Node-only import. It may use the public Convex error value contract needed to recognize `ConvexError`; framework-free does not mean unaware of Convex. It owns:

- `ConvexCallError`;
- mechanically safe normalization;
- serialization and deserialization helpers;
- public error kinds locked by `vNext.md`.

### 9.2 Classification ownership

Pure normalization classifies only values that carry reliable evidence. It must not infer transport failure from every `TypeError` or infer application authorization from message strings.

Environment boundaries add known context:

- fetch, XHR, timeout, abort, oversized-response, malformed-response, and unexpected upstream HTTP-response boundaries create `transport` errors;
- required identity absence and token exchange 401/403 create `authentication` errors;
- Convex application errors preserve application data as `server` errors;
- unstructured Convex argument-validation failures remain `unknown`; the pinned versions expose no stable validation marker and vNext has no `validation` kind;
- unrecognized values remain `unknown`.

A reconnectable WebSocket disconnect is connection state, not a query call error. The query keeps its last valid state while the Convex client reconnects.

Recognize Convex application errors through the pinned `ConvexError` contract and its cross-package `Symbol.for('ConvexError')` marker so duplicate physical Convex installations do not erase structured data. Never classify from partial message text.

Throwing calls and `.safe()` must pass through the same normalizer. Delete conversion back into plain `Error`.

### 9.3 Serialization and redaction

Add a Nuxt payload reducer/reviver so hydrated errors retain `instanceof ConvexCallError` and their public fields.

The reviver performs strict structural validation of every serialized public field; an arbitrary object containing `name: 'ConvexCallError'` is not revived.

`cause` is runtime-only. It must not appear in `toJSON()`, SSR HTML, payload JSON, DevTools serialization, or logs. Library-owned credentials, request objects, response objects, tokens, cookies, and authorization headers must not be copied into public error data.

Convex application `data` is preserved verbatim. The application owns the requirement that its own public error data contains no secret; the library must not silently redact or reshape application data and then claim preservation.

## 10. Server runtime

### 10.1 Official Convex primitives

Implement `serverConvex()` with one lazy `ConvexHttpClient` per caller:

- validate option combinations synchronously;
- own one lazy authentication snapshot/token promise;
- own one lazy HTTP client;
- apply authentication once when a token exists;
- use official `query`, `mutation`, and `action` methods;
- construct the HTTP client with `logger: false` so arbitrary Convex function log lines are not re-emitted by default;
- inject a classified fetch wrapper that wraps fetch rejection only and lets `ConvexHttpClient` consume all HTTP responses;
- perform no automatic retry of token exchange or Convex operations.

Delete manual `/api/query`, `/api/mutation`, and `/api/action` construction, manual Convex response parsing, manual function-name reflection, and the old server call trio. Use Convex's official function-name utility wherever a name is required.

### 10.2 One request-scoped identity source

Each caller owns one lazy authentication snapshot. It may use the explicitly selected cookie or bearer exchange path. It must not silently fall back to a second `/get-session` identity source when exchange fails.

Retries initiated explicitly by the consumer may reuse the caller's settled snapshot. Creating a new caller creates a new snapshot. Failed token or client promises remain private to that caller and must not be stored on the H3 event, Nuxt app, or module/global scope.

Read and normalize private server configuration from the supplied H3 event once per caller. Do not consult a second runtime-config source after caller creation.

### 10.3 Exchange result

Use the public result locked by `vNext.md`:

```ts
interface ConvexTokenExchangeResult {
  token: string | null
  status: number | undefined
  error: ConvexCallError | null
}
```

Success returns a non-null token, a 2xx status, and `error: null`. Failure returns `token: null` and exactly one error; status is the upstream status when one exists. Pin these invariants in tests because the public type is intentionally not an `ok`-discriminated union.

The exchange boundary enforces timeout, response size, content type, credential redaction, cookie/bearer exclusivity, and exact authentication-versus-transport classification. Timeout and size limits apply to token exchange and auth-proxy bodies, not to private Convex HTTP protocol responses; the classified Convex fetch must not buffer or reinterpret them.

### 10.4 SSR auth-cache retention

`vNext.md` retains `auth.cache?: false | AuthCacheOptions` and `serverConvexClearAuthCache`. This document does not proof-gate those public surfaces out of existence.

Keep the implementation narrow:

- disabled by default;
- owned only by server cookie-based token resolution;
- keyed by a hash of the session token, never the raw credential;
- bounded by the configured TTL and JWT expiry;
- invalidated automatically by the sign-out proxy and explicitly through `serverConvexClearAuthCache`;
- absent from browser implementation state even though its non-secret normalized option remains part of the public config contract.

Before release, record a deterministic stub-upstream benchmark comparing exchange count and latency with the cache disabled and enabled. Document the accepted revocation window as `min(cache TTL, JWT expiry)`. Caller-local token reuse remains independently of this cross-request cache.

### 10.5 Server type program

The root TypeScript configuration currently excludes `src/runtime/server`. Add explicit scripts:

```json
{
  "typecheck:module": "vue-tsc --noEmit",
  "typecheck:server": "tsc -p src/runtime/server/tsconfig.json --noEmit",
  "typecheck:fixtures": "node scripts/check-packed-type-fixtures.mjs",
  "typecheck": "pnpm run typecheck:module && pnpm run typecheck:server && pnpm run typecheck:fixtures"
}
```

Names may be adjusted once, but the three distinct programs and aggregate gate are required.

The server configuration extends generated Nuxt types, so the aggregate command runs after `dev:prepare` or performs the required preparation itself. Use `vue-tsc` only if a concrete Vue-generated type dependency later requires it.

## 11. Uploads

Keep the existing architecture:

- `upload-core.ts` owns upload URL acquisition, XHR transport, abort, progress, and response validation.
- `useConvexFileUpload` owns one upload's reactive state.
- `useConvexUploadQueue` owns scheduling and queue-item state.

vNext work is limited to shared `ConvexCallError` boundaries, runtime-context access, teardown, and invariant tests. Do not create another upload service, generic request engine, or transport adapter hierarchy.

Replace the mutable module-global upload item sequence with instance-local ID ownership. Use `crypto.randomUUID()` where the browser contract provides it, or a counter scoped to that queue instance; do not add another application-global registry.

Upload URL acquisition and queue tasks are identity-owned. Each item captures `{ identityKey, identityGeneration, uploadRevision }`. Identity-key change aborts active XHR where possible, clears queued/results/error/pending state synchronously, and prevents old progress, success, error, callback, logging, or DevTools publication. A completed remote upload may remain in storage, but its stale result is never exposed under the replacement identity.

## 12. DevTools, logging, and diagnostics

### 12.1 Per-app DevTools

Replace mutable module-global query and mutation registries with one bounded private `DevtoolsSink` attached to the runtime context. Do not add a parallel store, registry, or event bus.

Required properties:

- every event includes an application instance identifier;
- mutation and call history is bounded;
- subscriptions and transports are disposed with the app;
- HMR produces no ghost state;
- two Nuxt applications in one process cannot observe each other's events;
- DevTools absence does not create a second execution path.
- the DevTools UI owns one UI-app-scoped bridge controller, including pending requests, message IDs, binding, timers, and cleanup; those values are not module-global.
- the UI never binds implicitly to the first responder. Discovery and request routing use an explicit application instance identifier; responses from every non-selected instance are ignored.

Delete the process-global development auth health-check cache. Real exchange diagnostics are the canonical signal.

### 12.2 Logger safety cleanup

Do not rewrite logging solely because the file is long. Make the following outcome-driven changes:

- one structured event model feeds server and browser sinks;
- serialization never throws for circular objects, `bigint`, symbols, getters, or hostile values;
- recursive redaction covers token, cookie, authorization, secret, password, session, and credential-shaped keys;
- depth, item-count, and string-size limits prevent unbounded logging;
- raw query result data and raw arguments are not logged by default;
- logger methods are immutable and are never monkey-patched by plugins;
- one logger instance belongs to one runtime context;
- formatting failures degrade to a safe diagnostic string without affecting application behavior.

One small framework-free `sanitizeDiagnosticValue` primitive may serve logging and DevTools because they share redaction, bounded traversal, and hostile-value invariants. It reads property descriptors instead of invoking accessors, catches per-property and proxy failures, and redacts before data reaches either sink. It is not used for public error serialization, whose application-data preservation contract is different.

Delete existing `logger.auth` method reassignment in client and server plugins. Reactive/proxied values are shallowly snapshotted under the same access guards, and grouped console output is balanced with `try/finally`.

Retain distinct browser and server presentation only where the sink requires it. Remove duplicated normalization and redaction logic.

### 12.3 Build workaround

Keep the current `build.config.ts` DevTools pruning behavior until a supported module-builder mechanism or a source/output relocation demonstrably removes it. Any replacement must prove the packed tarball contains the intended runtime files and excludes raw DevTools source/output debris. Do not refactor this hook for aesthetics.

## 13. Public-wrapper retention decisions

The public surface locked in `vNext.md` remains authoritative. Internal cleanup must not silently introduce a new public abstraction.

Apply these deletion decisions:

- Delete `useConvexCall` as already locked.
- Delete `createPermissions` and permission configuration as already locked.
- Delete `createBetterConvexAuthClient` as already locked.
- Delete the old standalone server trio's public exports and docs in Phase 1. Keep the implementations private only until `serverConvex()` replaces every internal consumer in Phase 4, then delete the files atomically.
- Keep `useConvexStorageUrl` only as a thin query convenience with no separate cache or policy.
- Keep `createUserSyncTriggers`; it belongs to a distinct Convex server environment.
- Simplify `defineSharedConvexQuery` as described in section 7.7.

Retain `useConvexUser` as locked by `vNext.md`. Implement it on the final query foundation with positional explicit arguments and no independent cache, client, identity, transport, or auth-settlement policy. Its session seed is tagged with `identityGeneration` and cleared before another identity becomes observable. Seed/provenance behavior remains only to the extent specified by the public contract; this internal document does not proof-gate the export out of existence.

## 14. Comments, JSDoc, and architecture records

### 14.1 Public documentation standard

Every retained public export must have concise JSDoc covering the applicable items:

- purpose;
- browser, server, or framework-free environment;
- defaults;
- invalid option combinations;
- auth and SSR behavior;
- thrown and safe-result errors;
- lifecycle or disposal semantics.

Public option fields document defaults and constraints at the field definition. Examples are required only when they add compile-checked value; do not mandate multiple examples for every function.

Examples representing public typing must compile in fixtures. Do not duplicate the same contract comments on interfaces and returned object literals.

### 14.2 Internal comment standard

Internal comments explain only:

- why ordering is required;
- a security or identity boundary;
- a non-obvious race guard;
- a dependency workaround;
- an invariant whose code shape is not self-evident.

Delete step narration and comments that restate code. Replace every `F-##` marker with a named test or ADR reference; where the surrounding comment already explains the invariant, delete only the marker token. Do not create a permanent registry solely to preserve external issue archaeology.

### 14.3 Architecture document and ADRs

Create `src/ARCHITECTURE.md` containing:

- the canonical ownership table;
- dependency direction rules;
- per-app runtime lifecycle;
- auth identity and operation separation;
- query identity-isolation rules;
- server/client/framework-free entry boundaries;
- comment and ADR policy.

Require two initial ADRs for durable, non-obvious decisions future maintainers might otherwise reverse:

1. Stable identity partitioning, identity-scoped primary replacement, and the dedicated never-authenticated transport.
2. Convex-owned subscription deduplication and deletion of Better Convex Nuxt's parallel subscription machinery, after the proof fixture passes.

Public contracts and mechanically enforced package-purity rules stay in `vNext.md`, `src/ARCHITECTURE.md`, and tests rather than receiving duplicate ADRs.

Each ADR contains status, context, decision, consequences, and the test that guards it.

## 15. Historical material, starters, and repository classification

### 15.1 Historical research

Do not move `research/` and `experiments/` into another in-tree archive. That preserves search noise and creates a false maintenance obligation.

Classify every file as one of:

- an active design input that must be distilled into `vNext.md`, this document, or an ADR;
- a currently executed verification script that must move into maintained `scripts/` or its owning deterministic fixture, with a named CI owner;
- concluded research or proof material that must be deleted and retained only in Git history.

After distillation, delete concluded research, proof scripts, and the monolithic experiment file. Update all references in TypeScript configuration, architecture docs, starter docs, and research cross-links. No maintained build or documentation path may reference deleted historical material.

Apply the same classification to `starters/research` and `starters/platform-auth/scripts/verify-oauth-provider-runtime.sh`. A live-only verification script is not a maintained fixture unless it gains a deterministic owner and CI gate.

### 15.2 Changelog repair

Reconstruct the missing `v0.4.0` changelog section from the tagged Git range and published package evidence. Do not invent release notes. If a fact cannot be reconstructed, document the release link and the limitation explicitly.

The maintained changelog intentionally begins at `v0.3.0`; do not manufacture earlier history.

### 15.3 Repository-root classification

Classify every install root as exactly one of:

- authoritative package development root;
- packed consumer fixture;
- documentation application;
- deployed demo;
- supported starter;
- in-repo test fixture owned by a named test project or check script;
- historical material scheduled for deletion.

Each retained root needs an owner, dependency-update policy, lockfile policy, and CI command. Unowned roots are deleted.

Do not blindly align every version. Deliberate compatibility fixtures may pin older versions, but their purpose and tested range must be explicit. Accidental drift is not allowed.

Classify `.nuxtrc` as a dependency-version source and `context7.json` as documentation integration metadata. Root placement alone is not a reason to delete either file. Record the current funding gap explicitly: six starters and the docs application have no CI owner until this classification assigns one or deletes them.

### 15.4 Starter policy

Before rewriting starter content, publish the supported starter matrix. Every supported starter must have:

- a clear use case distinct from the other starters;
- a README and complete application structure;
- a maintained dependency policy;
- build and typecheck coverage in CI;
- no unclassified generated output;
- a test proving the vNext integration path it demonstrates.

Prefer temporary code generation. A standalone starter may commit exact bootstrap/generated files only when its offline or pre-deployment use case requires them. Every retained generated set has an explicit allowlist and is never hand-edited. Bootstrap stubs use an offline template-hash check. Generated files that require a configured Convex deployment use their exact allowlist in pull requests and a live freshness check in the scheduled/release-candidate tier; they do not make `pnpm check` credential-dependent. Deployment caches, `.nuxt`, `.output`, `dist`, and generated AI metadata without a supported requirement remain forbidden. Dependency-generated/bootstrap declarations are exempt from production-source style rules but not from their assigned freshness gate.

Convert `starters/research` to maintained documentation or delete it. Convert `platform-auth` into a deterministic named proof fixture if its code remains needed; otherwise complete it as a real supported starter or delete it. Reconcile its live verification script and tracked `convex/_generated` files as part of that decision.

A genuinely downloadable standalone starter may own an independent lockfile. Check its dependency range and tested compatibility band centrally. Do not create a workspace/catalog solely to reduce lockfile count. A proof fixture may pin a distinct stack only when its compatibility purpose is documented.

### 15.5 Concrete hygiene ledger

Complete these verified maintenance items in the phase that already owns the affected surface:

- remove package-owned permissions language from `package.json`, README, documentation metadata, demo metadata, keywords, and examples when the permissions runtime is deleted;
- delete the demo's `permissions: true` configuration;
- fix stale `useConvexRpc`, `serverConvexQuery`, and playground-only `useAuthClient` guidance;
- remove the obsolete Renovate Better Auth `<1.5.0` guard and migrate legacy package matching syntax;
- pin `@types/node` and declare the supported Node engine;
- eliminate `.nuxtrc` as a duplicate version source if the package manifest or a named fixture can own the same pin;
- delete `.npmignore` only after packed-artifact tests prove `files: ["dist"]` is the sole publication allowlist;
- give Ginko's API-key/Convex integration test a real root verification command;
- make Ginko's production Studio bridge atomic: production cannot merge an incomplete bridge with development stubs;
- derive the Ginko Studio API type and runtime picker from one descriptor rather than parallel handwritten allowlists.

Empty untracked directories such as local `bin/` or `feature-templates/` trees are housekeeping, not repository release deliverables.

## 16. Static analysis, package boundaries, and CI

### 16.1 Dependency-direction gate

Add an AST-based source boundary check. Regex is insufficient for semantic imports and exports.

Enforce:

- `/errors` imports only its framework-free implementation, platform-neutral language primitives, and the public Convex error-value entry needed by the locked normalizer;
- `/auth-client` implementation imports no runtime dependency; type-only Better Auth imports are allowed, while Nuxt, `#app`, Vue, Nitro, Node-only modules, and server runtime are forbidden;
- `/server` never imports composables, Vue, browser-only code, or client plugins;
- browser runtime never imports server runtime;
- pure auth/query transitions never import Nuxt, Vue, Nitro, or environment globals;
- module/build code does not leak into runtime entries;
- type-only edges are allowed only when they cannot introduce runtime coupling.

Use the installed TypeScript parser or an equivalent maintained parser.

### 16.2 Packed-entry proofs

The existing line-oriented `check-package-exports.mjs` can miss multiline imports and does not prove entry purity. Replace it with AST inspection plus packed-package probes.

From a freshly packed tarball, test clean consumer processes for:

- package root;
- `/errors`;
- `/auth-client`;
- `/server`;
- `/server/createUserSyncTriggers` if retained as a separate export.

For each entry verify:

- runtime resolution;
- type resolution;
- exact expected exports;
- absence of forbidden exports;
- server/browser/framework purity;
- no source-machine absolute paths;
- no undeclared dependency resolution.

Use AST inspection plus the existing build graph/artifact evidence to prove `/errors` has no Nuxt, Vue, Better Auth, browser-only, or server-only dependency and `/auth-client` has no Nuxt or server code. Do not add a second bundler solely to obtain a metafile.

Source tests with mocked `#imports` are not sufficient package evidence.

### 16.3 Vocabulary checker

Replace the inline `sh -c '! rg …'` package scripts with one table-driven Node script. It may enforce forbidden words, old API spellings, and documentation vocabulary. It must not enforce semantic import/export architecture; the AST gate owns that.

This removes an undeclared ripgrep dependency and shell escaping from the portable release gate.

Treat this as a correctness fix, not optional hygiene: the current `sh -c '! rg PATTERN PATHS'` scripts invert ripgrep's command-not-found exit into success, so they can pass vacuously when `rg` is absent.

### 16.4 One authoritative check command

Use explicit verification tiers:

1. Every pull request, `pnpm check`: formatting, ESLint, vocabulary, module/server types, source dependency boundaries, API-surface freshness, deterministic unit/Convex/Nuxt tests, and source artifact hygiene.
2. Package pull-request job: clean `dist`, build once, pack once, then run packed type, export, purity, consumer, and tarball-content probes.
3. Path-filtered jobs: changed starters, docs, demo, and their generated-surface checks.
4. Nightly: all supported starters/install roots, broader browser matrix, live-service compatibility where credentials exist, and external links.
5. Release: every deterministic offline gate, every supported root, packed consumers, and the exact publishable tarball.
6. Registry/service verification: release-candidate or post-publication checks where publication is inherently required.

External links use retries and report failures, but third-party uptime alone does not invalidate an otherwise reproducible package artifact.

Critical auth, SSR, identity isolation, error serialization, and auth-disabled tests must not be skipped because an external `CONVEX_URL` is absent. Use deterministic fixtures for pull requests. Broad real-service E2E may remain scheduled and pre-release.

### 16.5 Deterministic CI and release

- Use Corepack with the repository's pinned pnpm version.
- Install through `pnpm install --frozen-lockfile`.
- Do not use unpinned `npx TOOL@latest` invocations in CI.
- Declare the supported Node engine and test the minimum supported version plus current LTS.
- Make `release:verify` a reproducible superset of the deterministic pull-request and package gates.
- Keep publication human-controlled and separate from verification.
- Prepare version/changelog first, then from the prepared clean tree clean `dist`, build once, and pack once.
- Extract and verify that tarball, recording a content manifest of path, mode, size, and SHA-256.
- Publish that exact tarball path; `npm publish` must not rebuild or repack it. `release.mjs` must pass the verified tarball file to `npm publish <tarball>.tgz`: publishing from the package directory is forbidden because npm re-runs the `prepack` lifecycle during directory publish, producing artifacts different from those verified (current defect: `scripts/release.mjs` publish step and its dist-rebuild resume branch). A resume re-verifies or re-packs, never publishes an unverified build. Record the content manifest (path, mode, size, SHA-256) as release evidence; do not fail releases on manifest diffs alone.
- Assert invariant/path-class allowlists and reject DevTools raw output, generated build debris, historical research, local absolute paths, and unplanned source files. Compare extracted content manifests rather than archive bytes or fixed hashed filenames.

## 17. Test architecture

### 17.1 Organize by invariant

Split large test files during their owning behavioral rewrite, not as a cosmetic pre-pass.

Recommended suites:

```text
regular-query/
  ssr-hydration
  auth-modes
  identity-switch
  subscription-lifecycle
  transforms-and-skip
paginated-query/
  first-page
  page-chain
  realtime
  identity-reset
  concurrency-and-stale-commit
auth/
  initial-settlement
  operations
  refresh-and-revocation
  races-and-ready
  teardown-and-hmr
```

Shared harnesses may expose deferred promises, fake clocks, fake clients, and event counters. They must not encode the behavior being tested.

### 17.2 Count effects, not only visible outcomes

Every race or resource invariant includes event/count assertions where applicable:

- client instances created and closed;
- token exchanges started;
- refreshes coalesced;
- wire subscriptions acquired and released;
- listener callbacks committed and rejected as stale;
- redirects or sign-outs, where the auth engine definitively owns them;
- timers and transports alive after teardown.

Visible data assertions alone cannot prove absence of duplicate work or leaks.

### 17.3 Required two-app and HMR fixtures

Add fixtures that create two Nuxt applications in one process. Prove independent auth identity, clients, shared query instances, DevTools events, and disposal.

Run repeated same-app plugin reevaluations and assert live resource counts remain constant. Separately run repeated app-create/app-dispose cycles and assert all live resource counts return to zero after each explicit disposal.

Distinguish same-app plugin reevaluation from application replacement: reevaluation reuses the runtime with zero creation/disposal, while an explicitly replaced app awaits disposal. Add switch-failure, connection-state rebinding, callable stale-completion, and primary-client replacement fixtures. The two-app harness and fake-WebSocket protocol harness are senior-owned Phase 0 spikes because they are not first-class `@nuxt/test-utils` features.

## 18. Complexity and typing standards

### 18.1 Type integrity

Maintain these production-source rules:

- no explicit `any`;
- no `@ts-ignore` or `@ts-nocheck`;
- `@ts-expect-error` only in compile-time fixtures with a reason and the exact rejected contract;
- no unchecked claim that JWT/session data is a `ConvexUser`;
- no double cast solely to force a public generic promise;
- no broad index signature where a discriminated union can represent valid states;
- no public type promising plugin methods unless a packed consumer fixture proves them.

The zero-unsafe-type policy applies to published source and maintained runtime fixtures. Test doubles may use narrow, locally justified escape hatches only when the fixture specifically tests an unsafe external boundary.

### 18.2 Complexity guard

Do not impose a blanket file-size limit. Declarative schemas and event unions can be long without being complex.

After the vNext rewrite:

- report cyclomatic complexity above 20 as advisory review telemetry during the cleanup baseline; promote it to an error only after the rewritten code proves the rule produces a small, meaningful exception set;
- do not impose a function-line limit or create an exception registry;
- a change that pushes a production file from below 1,000 lines to above 1,000 lines requires explicit senior review, but line count alone is not failure;
- complexity is blocking when code mixes ownership domains, duplicates a guarded algorithm, hides mutable state, or cannot be tested without unrelated effects;
- query and auth hotspots must be decomposed by ownership;
- regular and paginated queries must not contain separate copies of execution-gate logic;
- mutation and action must not contain separate copies of callable lifecycle logic;
- no new mutable registry may be introduced without an ownership-table amendment.

The limits are review alarms, not permission to fragment one algorithm into meaningless files.

### 18.3 Lint policy

Enable explicit project rules for unsafe TypeScript escapes, banned comments, and agreed complexity alarms after the cleanup baseline passes. Correct stale ESLint messages to name real vNext replacements. Deduplicate middleware and plugin restrictions only when the flat configuration remains readable.

## 19. Deletion ledger

### 19.1 Mandatory hard-cutover deletions

- `useConvexCall` and all imports, auto-imports, docs, tests, templates, generated API metadata, and examples.
- Permissions runtime, `createPermissions`, module options, docs, tests, and generated surfaces.
- `createBetterConvexAuthClient` and its generated/public references.
- Old standalone server call public exports/docs in Phase 1; their private implementations after atomic replacement in Phase 4.
- Old auth vocabulary, old skip dialects, and compatibility aliases.
- `auth.skipRoutes`, `auth.unauthorized`, and their recovery internals — the enabling `vNext.md` §5.1 amendment landed 2026-07-09; delete in Phase 1 per section 6.6.
- Plain-error conversion paths replaced by `ConvexCallError`.
- Stale `useConvexRpc` and `useAuthClient` documentation/lint references.

### 19.2 Proof-gated deletions

- Custom subscription registry, bridges, refcounts, and payload registry after Convex deduplication proof.
- Shared-query string keys and fingerprinting after closure identity tests.
- Module-global DevTools registries after per-app fixture passes.
- Module-global connection-state store, upload queue sequence, shared logger caches, raw debug globals, and DevTools UI controller state after their per-app/stateless replacements pass.
- Global development auth health-check cache.
- Manual Convex function-name and HTTP protocol helpers after official-client tests pass.
- Concluded research and experiment artifacts after decisions are distilled.
- Unsupported or unowned starters/install roots.

### 19.3 Explicitly retained structures

- Domain-local pure-core pattern, renamed and colocated as files are touched.
- Existing upload core layering.
- The default-off server auth cache, `serverConvexClearAuthCache`, and `useConvexUser`, as locked by current `vNext.md`.
- Test helpers that expose mechanics rather than policy.
- `release.mjs` safety discipline, while separating verify from publish.
- DevTools packaging workaround until an evidence-backed replacement exists.
- Explicit pagination orchestration while Convex's alternative remains experimental.

## 20. Workstreams and mapping to `vNext.md`

The public six-phase order remains authoritative. Internal work is woven into the owning phase so two teams do not rewrite the same hotspot concurrently.

### Internal Phase 0 — senior proofs and baseline gates

Complete before assigning broad implementation:

- completed 2026-07-09: the targeted `ConvexClientHandle` API review; the contract is `vNext.md` §5.4 (`query | mutation | action | onUpdate`, `onUpdate` contingent on the rebinding proof), and generated Nuxt-app types plus the Ginko Studio bridge follow it;
- completed 2026-07-09: the `vNext.md` amendment deleting `auth.skipRoutes` and `auth.unauthorized` (`vNext.md` §5.1); implement the deletion in Phase 1;
- FIRST TASK: upgrade this repository's development dependencies (currently Nuxt 4.3.1, Convex 1.32.0, Better Auth 1.6.20, `@convex-dev/better-auth` 0.12.4) and all proof fixtures to the exact stack pinned in `vNext.md`, then re-verify every dependency-behavior claim (optimistic-update retention across `setAuth`, the unchanged-token refetch dead-end, the unhandled token-fetcher rejection, the `convex` plugin ID, the `setAuth` socket pause) against the pinned versions;
- replace every `npx TOOL@latest` and nypm install in `.github/workflows/` with Corepack-pinned `pnpm install --frozen-lockfile` and version-pinned tool invocations; declare `engines.node`, pin `@types/node`, and test the minimum supported Node plus current LTS; every later phase gate assumes this deterministic baseline;
- build the table-driven Node vocabulary checker (section 16.3) with its per-name activation schedule before any Phase 1 vocabulary ban is added;
- fix `release.mjs` to publish the verified tarball file (section 16.5);
- packed typed Better Auth client fixture covering API-key plugins, the typed empty fallback, mutable merged plugin tuple, explicit Nuxt-layer definition, two builds in one process, actual HMR, packed install, and output path scans;
- Convex native subscription wire fixture, same-client A → B leak reproduction, replacement-primary isolation fixture, and same-user token-rotation fixture;
- live anonymous-client identity fixture;
- exact auth-revision, `ready()`, total-token-fetcher, transient-retry, and concurrent-session fixtures;
- epoch-scoped refresh-deduplication, retired-client hygiene (`IDENTITY_CHANGED` rejection, no unsaved-changes dialog, no `beforeunload` accumulation), and candidate-confirmation-without-`expectAuth` fixtures (`vNext.md` §5.8 proofs 8–10);
- browser unmount, same-app reevaluation, app replacement, two-app isolation, SSR request cleanup, and disposal-versus-initialization fixtures;
- `ConvexCallError` full Nuxt reducer/reviver and fatal-SSR redaction fixtures;
- repository install-root and starter classification, including the binding keep/delete decision for each starter, so Phase 1 vocabulary rewrites are performed only on starters that survive; deleted starters are removed in Phase 1 before the vocabulary gate covers `starters/`;
- baseline AST boundary, server typecheck, and aggregate check commands.

These are decisions and proof programs, not production rewrites.

### Public Phase 1 — foundations and pruning

Include:

- pure module build plan and exact normalized runtime split;
- frozen `AuthIdentityPort` with an adapter over the existing engine;
- final runtime context, replaceable identity-scoped primary, lazy anonymous client, connection-state rebinding, disposer, per-app logger/DevTools ownership, and diagnostic sanitization before transport;
- final regular/shared/paginated query decomposition, execution plan, tagged identity isolation, pagination controller, and native-subscription deletion;
- deletion of locked public surfaces and stale generated metadata, while keeping the old server trio private until Phase 4;
- deletion of route-skip and automatic unauthorized-recovery surfaces/internals after their Phase 0 public amendment;
- activate Phase 1 vocabulary bans only through the Phase 0-built table-driven checker (section 16.3);
- architecture ownership document.

Implement foundations and their consumers atomically inside Phase 1. Branch-local scaffolding may exist while a commit is being assembled, but no phase-boundary commit or packed artifact may contain old and new internal paths side by side.

### Public Phase 2 — errors, callables, and upload integration

Include:

- framework-free error implementation;
- boundary-owned classification;
- payload reducer/reviver;
- cause redaction;
- throwing/`.safe()` equivalence;
- packed `/errors` purity proof;
- mutation/action callable lifecycle with epoch-aware retained state;
- upload error-boundary integration without changing upload ownership;

### Public Phase 3 — final auth lifecycle and typed client

Include:

- per-app auth context and pure transitions;
- integrated client and receiver-preserving proxy logic;
- exact `ready()` semantics;
- pending-operation counter;
- removal of auth hook command bus;
- total Convex token fetcher, revision-scoped synchronization, and bounded transient retry;
- connection to Phase 1's frozen query/client ports without changing query or cache ownership;
- per-app teardown and HMR tests;
- split invariant-oriented auth tests.

Assign one owner to `client-engine.ts`. The Phase 1 owners of regular and paginated queries remain reviewers in Phase 3; Phase 3 may change their auth-port wiring but must not redesign their execution, cache, or listener ownership.

### Public Phase 4 — server caller

Include:

- official `ConvexHttpClient` implementation;
- caller-owned lazy snapshot and client;
- public `{ token, status, error }` exchange result and its runtime invariant;
- server type program;
- packed `/server` purity fixture;
- retained default-off SSR auth cache with benchmark, bounded revocation window, and sign-out invalidation;
- atomic migration of private internal consumers followed by deletion of the temporary server trio and manual protocol code.

### Public Phase 5 — Ginko hard migration

Begin only after the exact package tarball required by Ginko passes packed fixtures. Migrate Ginko directly to final APIs. Do not use Ginko to preserve an obsolete library path.

Confirm that:

- manual login refreshes are removed only after integrated auth synchronization passes;
- raw API-key browser HTTP is replaced by the final typed client method;
- runtime config casts disappear because normalized public types exist;
- the Studio bridge receives the stable `ConvexClientHandle`, not a raw replaceable `ConvexClient`;
- one Studio descriptor generates both the API type and runtime picker, so the bridge/API exports are a real allowlist;
- production requires an atomic complete Studio bridge and never fills missing production fields with development stubs;
- Ginko authorization and MCP failure budgets remain in Ginko;
- Ginko's MCP adapter performs exactly one exchange: 401/403 consumes its bad-secret budget and returns null; infrastructure, timeout, 5xx, oversized, or malformed failures throw the returned error and do not consume that budget;
- the Studio error-normalization migration includes `packages/cms/studio-app/src/composables/useCmsStudioQuery.ts`;
- Ginko's API-key/Convex integration test runs through a real root verification command;
- generated Convex API files are regenerated, not edited;
- package compatibility metadata and registry verification use the new breaking range.

Pre-publish verification consumes the packed candidate through `BETTER_CONVEX_NUXT_PACKAGE_ROOT`. Registry verification runs only after publication.

### Public Phase 6 — docs, hygiene, and release hardening

Include:

- public JSDoc and compile-checked examples;
- removal of all `F-##` comments;
- research/experiment distillation and deletion;
- starter rationalization and CI coverage;
- changelog `v0.4.0` reconstruction;
- final vocabulary locks;
- deterministic CI and canonical `pnpm check`;
- tiered CI, packed entry matrix, content-manifest allowlist, and exact verified-tarball publication;
- final architecture and ADR review;
- removal of temporary proof fixtures that are superseded by permanent acceptance fixtures.

## 21. Parallelization rules

A large team should parallelize independent domains, not the same hotspot.

Safe concurrent ownership after foundations are fixed:

- errors and payload serialization;
- typed Better Auth definition fixture;
- server caller and exchange;
- mutation/action callable lifecycle;
- tooling, package-boundary gates, and docs;
- Ginko inventory before migration begins.

Serial or tightly coordinated ownership:

- module build plan before plugin/template registration changes;
- Phase 1 freezes the auth/query port against the existing engine before Phase 3 replaces the engine behind that port;
- query execution plan before regular and paginated rewrites diverge;
- error contract before calls, uploads, and server finalize error paths;
- packed package exports before Ginko migration;
- repository classification before deleting research or starters.

No two branches may independently change the same state owner. One maintainer owns each hotspot through its phase.

## 22. Required acceptance matrix

### 22.1 Ownership and lifecycle

- Exactly one mutable runtime context exists per Nuxt application.
- No mutable module-global auth, query, application, or DevTools state remains.
- No auth refresh Nuxt hook remains.
- No private Nuxt-app fields remain except the single runtime attachment.
- Two applications have independent auth, clients, shared queries, logging, DevTools, and disposal.
- Teardown leaves zero clients, listeners, effect scopes, timers, and transports.
- Same-app plugin reevaluation creates and disposes zero resources; explicit app replacement and teardown leave zero resources.
- SSR allocates no WebSocket client and no unowned detached scope.
- Primary replacement rebinds at most one connection-state listener, resets its snapshot, and ignores every old-epoch callback.

### 22.2 Configuration and bundles

- No composable imports or invokes `useRuntimeConfig()`.
- Build-only definition paths do not enter runtime config, published declarations, package output, SSR payloads, or final browser/server chunks; consumer-local generated `.nuxt` templates are the sole allowed path-bearing artifact.
- Private-only configuration does not enter `runtimeConfig.public`, HTML, payload JSON, or browser chunks. Fields explicitly exposed by `vNext.md` §5.7 remain public.
- Auth-disabled output contains no Better Auth client, auth engine, proxy, middleware, or conditional dormant implementation.
- Invalid auth-only options with `auth: false` fail at build time with exact messages.

### 22.3 Auth

- SSR-provided anonymous and authenticated identity hydrate directly into the same settled state.
- Optional queries never execute anonymous-first while auth-enabled identity is unsettled.
- Integrated sign-in/sign-up resolve only after Convex synchronization.
- Concurrent operations keep `isPending` true until the final operation settles.
- Identity-producing operations execute through one invocation-ordered queue; background refresh cannot commit across `authEpoch`.
- Same-user refresh changes token without changing identity key or reacquiring queries.
- User switching rejects stale auth epochs, identity generations, and execution revisions.
- Definitive revocation clears identity; background refresh failure may preserve usable identity.
- `ready()` passes the captured-promise snapshot matrix and never hangs.
- Proxy-wrapped Better Auth plugin methods preserve `this`.
- The Convex token fetcher never rejects; retained-token transient failure schedules at most one bounded/coalesced retry and produces no unhandled rejection.
- A different-user candidate that cannot confirm never resumes the old identity and settles anonymous plus error without leaving `ready()` pending.

### 22.4 Queries

- N identical listeners on one client produce one wire subscription.
- Each listener may transform independently.
- Removing one listener does not release another listener's subscription.
- Removing the last listener releases the subscription.
- `none` uses the never-authenticated transport in auth-enabled applications.
- User A → user B exposes no A result, error, previous data, page, or cursor at any observation point.
- Anonymous → user and user → anonymous satisfy the same isolation rule.
- Every stable identity-key change replaces the primary client; same-user token rotation retains it.
- Stale work is rejected before transform, callback, logging, or DevTools publication.
- Same-user token rotation causes zero listener acquisitions and zero wire `Add`/`Remove`; a `QueryUpdated` is allowed.
- `'skip'` is the sole skip sentinel.
- Exact empty arguments reject options-shaped objects while allowing legitimate Convex argument types.
- Pagination rejects stale page completions after identity, arguments, skip, or refresh generation changes.

### 22.5 Errors, calls, and uploads

- Throwing and `.safe()` paths return equivalent normalized errors.
- SSR hydration preserves `ConvexCallError` identity and public data.
- Cause and credentials never serialize or log.
- A fatal SSR `ConvexCallError` response contains no cause data even when it bypasses the normal payload reducer.
- Mutation and action share one private lifecycle.
- Identity/identity-generation change masks callable retained state and prevents stale callbacks/logs/DevTools events.
- A `ConvexClientHandle` or callable operation crossing an identity generation returns only `IDENTITY_CHANGED`, never the old result; mutation/action documentation warns that the original operation may have committed.
- Optimistic update remains mutation-only.
- Upload abort, progress, queue concurrency, and response validation retain existing behavior.
- Identity change clears private/local optimistic state and upload queue state; stale upload/call progress and completions remain unobservable.
- Logging hostile values never throws.
- Diagnostic sanitization invokes no accessor, survives proxy/property failures, and redacts before both logging and DevTools transport.
- DevTools UI teardown rejects pending requests and clears request/fallback timers; two same-origin apps responding in either order cannot change the explicitly selected target.

### 22.6 Server and package boundaries

- `ServerConvexCaller` performs at most one exchange/snapshot resolution per caller.
- It owns one lazy `ConvexHttpClient`.
- The HTTP client uses `logger: false`; classified fetch wraps rejection without buffering or interpreting Convex responses.
- Cookie and bearer exchange are mutually exclusive and correctly classified.
- Exchange success/failure obeys the public `{ token, status, error }` invariant.
- The default-off auth cache is server-owned, hashed, bounded by TTL/JWT expiry, and invalidated on sign-out.
- Timeouts and size limits have deterministic tests.
- No manual Convex endpoint construction remains.
- `/errors` and `/auth-client` are framework-free.
- `/server` has no Vue or browser dependency.
- Root, server, and packed-fixture type programs pass.
- Packed exports match the exact vNext allowlist.
- The package root exports the reviewed `ConvexClientHandle` containing exactly `query`, `mutation`, `action`, and `onUpdate` (or exactly `query`, `mutation`, and `action` if the `vNext.md` §5.8 rebinding proof fails per section 4.4, together with the funded Studio migration), while `connectionState`, auth, and lifecycle methods fail typechecking. `useConvex()` and Ginko's Studio bridge use that stable handle rather than `ConvexClient`.
- The built-in no-definition auth-client fallback has a concrete typed declaration and does not degrade to `any`; API-key methods fail typechecking in that fallback.
- The merged plugin tuple preserves consumer plugin methods without readonly-tuple incompatibility, and packed Nuxt-layer/two-build fixtures infer independently.

### 22.7 Maintenance and release

- No explicit unsafe production types, opaque `F-##` comments, stale old API names, or tracked historical proof scripts remain.
- Every retained install root has an owner and CI gate.
- Every supported starter builds and typechecks in its path-filtered, nightly, and release gates.
- Every retained starter-generated file matches its allowlist and assigned offline template-hash or live freshness gate.
- `pnpm check` passes from a clean checkout with a frozen lockfile.
- CI contains no unpinned `@latest` tool invocation, declares the supported Node engine, and tests its minimum version.
- `release:verify` is a deterministic superset of pull-request and package checks and produces the exact tarball later published.
- The extracted release manifest records path, mode, size, and SHA-256, and publication receives that exact tarball path.
- The verified tarball contains no historical research, generated debris, raw DevTools output, or absolute source-machine paths.

## 23. Stop conditions requiring senior escalation

The implementing developer must stop and escalate when:

1. The packed typed Better Auth fixture cannot preserve consumer plugin methods through `useConvexAuth().client`.
2. Convex does not satisfy any native subscription ownership proof.
3. Same-user `setAuth` causes unavoidable query reacquisition or stale delivery.
4. Structural A → B isolation requires token-derived keys or a global purge.
5. Nuxt payload error revival cannot preserve the locked public error contract.
6. An auth-disabled bundle still statically includes Better Auth integration code.
7. A required lifecycle resource cannot be deterministically disposed.
8. Official `ConvexHttpClient` cannot implement a locked server behavior without manual protocol code.
9. Exact-empty query argument typing rejects a legitimate Convex argument contract or accepts an options-shaped object.
10. A proposed cleanup requires a new public option, public export, compatibility path, or second source of truth.
11. A historical file or starter cannot be classified safely.
12. Ginko requires product authorization policy to move into Better Convex Nuxt.
13. An intermediate phase can compile only by publishing old and new APIs together.
14. A critical acceptance test depends exclusively on an unavailable external service.
15. The `vNext.md` §5.8 `onUpdate` rebinding proof cannot demonstrate a replacement-safe surface without raw-client exposure or a second subscription owner (in which case the handle narrows to `query | mutation | action` per section 4.4 together with the funded Studio-migration work item).
16. `auth.skipRoutes` or `auth.unauthorized` remains public after Phase 1 despite the landed `vNext.md` §5.1 deletion amendment (section 6.6).
17. The same-client A → B resident-cache leak cannot be reproduced, or replacement-primary isolation cannot be proven, on the pinned stack.
18. Browser, SSR, or HMR resources cannot be assigned one deterministic disposer.
19. A pinned-stack re-verification contradicts the installed-version findings that motivate the architecture — in particular optimistic-update retention across `setAuth` or the unchanged-token refetch dead-end.
20. The packed node_modules-resident auth-client definition cannot be typed through the generated registry and the Ginko template escape hatch also fails.

The junior may choose local names and file splits within the ownership rules. The junior must not improvise identity semantics, auth settlement, cache ownership, error classification, retry policy, package exports, server credential precedence, or deletion retention decisions.

## 24. Definition of done

The internal cleanup is complete only when all of the following are true:

- The public vNext contract is implemented with no compatibility layer.
- `vNext.md`, generated types, Ginko bridge types, and public client-access docs contain the targeted-review-approved `ConvexClientHandle` contract required by identity-scoped client replacement.
- Every concept in the ownership table has one implementation owner.
- Query and auth hotspots are decomposed by responsibility, not mechanically split.
- Duplicate subscription, HTTP protocol, callable lifecycle, configuration normalization, and logging-safety logic is removed.
- All mutable state is request-, caller-, composable-, or Nuxt-app-scoped.
- Auth-disabled builds are structurally free of auth integration.
- Cross-user isolation, same-user refresh stability, SSR hydration, races, and teardown are proven with count assertions.
- Framework-free and server package boundaries are proven from the packed artifact.
- Historical research is distilled and removed, not relocated as permanent clutter.
- Every starter and install root is supported and tested or deleted.
- Public documentation and internal invariant comments describe the final code only.
- `src/ARCHITECTURE.md`, the required ADRs, and the canonical checks are present.
- Ginko consumes the final package without manual auth refreshes, raw API-key HTTP workarounds, runtime-config casts, or an overbroad Studio bridge.
- A clean checkout can run the complete verification with pinned tooling and produce the same verified tarball.

The desired long-term result is a smaller integration layer that delegates transport and caching to Convex, session operations to Better Auth, lifecycle to Nuxt, and authorization policy to applications. Better Convex Nuxt should own only the deterministic coordination those systems cannot own independently.
