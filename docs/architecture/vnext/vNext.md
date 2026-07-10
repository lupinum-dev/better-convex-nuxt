# Better Convex Nuxt vNext

## Hard-cutover implementation specification for Better Auth, Convex, Nuxt, and Ginko CMS

> **ARCHIVED — IMPLEMENTATION PLAN COMPLETED**
>
> This specification governed the unreleased vNext hard cutover. Its phased work is no longer awaiting assignment. The implementation has moved to executable package contracts, invariant tests, and release gates. This file is retained as an architecture decision record; unchecked boxes below are historical planning notation, not pending work or release status.

Status: archived on 2026-07-10 after implementation of the six-phase cutover. Release-candidate certification remains owned by the current repository gates and coordinated downstream verification, not by this document.

Target: the next unreleased Better Convex Nuxt release and the matching Ginko CMS migration

Compatibility policy: hard cutover; do not retain aliases, shims, deprecated overloads, or dual APIs for the removed surfaces

### Closeout evidence

| Decision area | Authoritative executable evidence |
| --- | --- |
| Package surface and removed imports | `scripts/package-entry-manifest.mjs`, package-export checks, packed-consumer fixtures |
| Identity isolation and query behavior | Query, pagination, client-owner, and identity-boundary invariant tests |
| Authentication topology and lifecycle | Enabled/disabled consumer fixtures, auth coordinator tests, build-graph checks |
| Error and server-call contracts | `/errors` and `/server` contract fixtures, SSR serialization and security tests |
| Ginko migration | Ginko package checks, production audit, and exact-tarball consumer verification |
| Release readiness | `pnpm run release:verify` plus the coordinated Ginko release-candidate gate |

Any disagreement between historical checklist text and an executable contract is resolved by the accepted public API, package manifest, and invariant tests. A changed decision requires a new ADR and corresponding executable proof rather than editing this archive in place.

This document is the implementation authority for the vNext cutover. It is intentionally detailed enough for an engineer who is new to the repositories to work phase by phase without inventing missing behavior.

## 1. Outcome

After this cutover, Better Convex Nuxt has one normal application path and a small set of environment-specific advanced paths.

The normal application path is Nuxt auto-imports:

```ts
const auth = useConvexAuth()
const profile = await useConvexQuery(api.users.profile, {}, { auth: 'required' })
const save = useConvexMutation(api.users.save)

const result = await auth.signIn.email({ email, password })
if (result.error) {
  throw result.error
}

await save({ displayName: 'Ada' })
```

The advanced paths are separated by execution environment:

```ts
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'
import { ConvexCallError, normalizeConvexError } from 'better-convex-nuxt/errors'
import { exchangeConvexToken, serverConvex } from 'better-convex-nuxt/server'
```

There is no runtime `better-convex-nuxt/composables` export and no generic utility dumping ground.

## 2. Design rules

Every implementation decision must satisfy these rules:

1. One normal way per task. A lower-level primitive is allowed only when it serves a distinct advanced environment.
2. Authentication policy uses the same words on client and server.
3. Successful integrated sign-in and sign-up do not resolve until Convex authentication is synchronized.
4. Auth identity and auth-operation activity are separate dimensions.
5. Query caches are partitioned by stable user identity, never by a raw JWT and never by only `authenticated` versus `anonymous`.
6. A server caller resolves one auth snapshot and reuses it for all calls made through that caller.
7. Generic error normalization preserves application data and does not guess product authorization semantics.
8. Build-only configuration never leaks into `runtimeConfig.public`.
9. Ginko CMS policy remains in Ginko CMS. Better Convex Nuxt owns transport, integration state, and general-purpose mechanics.
10. Deleted greenfield APIs stay deleted. Add lint and contract checks that prevent them from returning.
11. Authentication is installed by default. `auth: false` is the single explicit Convex-only mode; there is no nested `auth.enabled` toggle.

## 3. Explicit non-goals

Do not add any of the following:

- CMS publishing, review, asset-policy, or operation-confirmation abstractions.
- MCP authorization, failure-budget, credential-record, or capability policy.
- Organization or role policy.
- A generic agent framework.
- A framework-free query state manager for the Ginko Studio SPA.
- An embedded-SPA bridge in Better Convex Nuxt.
- `safe`, `optional`, `lazy`, or `maybe` variants of existing composables.
- Compatibility wrappers for `auto`, `refreshAuth`, `awaitAuthReady`, `useConvexCall`, `createPermissions`, or the old server-call trio.
- Runtime registration singletons for Better Auth clients.

## 4. Final public API

### 4.1 Package root

The root keeps the Nuxt module as its runtime default export and exports stable public types.

```ts
import betterConvexNuxt from 'better-convex-nuxt'
import type {
  BaseAuthClient,
  ConvexAuthMode,
  ConvexAuthOptions,
  ConvexAuthClientRegistry,
  ConvexAuthStatus,
  ConvexCallErrorKind,
  ConvexClientHandle,
  ConvexRuntimeConfig,
  InferRegisteredConvexAuthClient,
  ModuleOptions,
  ServerConvexOptions,
  UseConvexAuthReturn,
  UseConvexMutationOptions,
  UseConvexPaginatedQueryOptions,
  UseConvexQueryOptions,
} from 'better-convex-nuxt'
```

Do not export the raw `ConvexPublicRuntimeConfig`. Consumers read the normalized config returned by `useConvexConfig()`. `ConvexAuthClientRegistry` is a type-level declaration-merging interface only; no runtime registry object exists (§3, non-goal 10).

`ServerConvexOptions` is defined once in `better-convex-nuxt/server` and re-exported as a type from the root. The root does not contain a second definition.

### 4.2 App auto-imports

Keep:

- `useConvex`
- `useConvexQuery`
- `useConvexPaginatedQuery`
- `useConvexMutation`
- `useConvexAction`
- `useConvexAuth`
- `useConvexUser`
- `useConvexConfig`
- `useConvexConnectionState`
- `defineSharedConvexQuery`
- `useConvexFileUpload`
- `useConvexUploadQueue`
- `useConvexStorageUrl`
- regular and paginated optimistic-update helpers
- `ConvexAuthenticated`, `ConvexUnauthenticated`, `ConvexAuthLoading`, and `ConvexAuthError`, registered unconditionally and rendered from `ConvexAuthStatus`

Component rendering is exact: `ConvexAuthenticated` renders only for `authenticated`; `ConvexUnauthenticated` renders for `anonymous` and `disabled`; `ConvexAuthLoading` renders only for `loading`; `ConvexAuthError` renders only for `error`.

Delete:

- `getQueryKey`; identity-aware payload keys are internal and are not a stable application cache-key contract
- `useConvexCall`
- `createPermissions`
- the `permissions` module option
- `createBetterConvexAuthClient`
- `resolveBetterConvexAuthBaseURL`
- `BetterConvexAuthClientOptions`
- `BetterConvexAuthClientPluginList`
- the orphaned `src/runtime/composables/index.ts` barrel (the `/composables` package export was already removed in 0.5.0; retain the documentation ban); `ConvexCallError`, `normalizeConvexError`, and `CallResult` get their sole runtime/type home in `/errors`

`useConvex()` no longer returns the identity-owning raw `ConvexClient`. It returns one stable `ConvexClientHandle` for the Nuxt app. The handle delegates each operation to the current primary client, rejects stale-generation completions, and survives an authenticated-client replacement. It does not expose `setAuth`, `clearAuth`, or `close`; transport ownership stays inside the module. Stateful query and pagination composables remain the normal subscription API.

### 4.3 Framework-free auth-client definition

```ts
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'
```

This subpath contains only the definition identity function and its types. It must not import Nuxt, Vue, `#imports`, browser globals, or server globals.

### 4.4 Framework-free errors

```ts
import { ConvexCallError, normalizeConvexError } from 'better-convex-nuxt/errors'
```

This is the sole runtime home of the shared error contract.

### 4.5 Server

```ts
import {
  exchangeConvexToken,
  serverConvex,
  serverConvexClearAuthCache,
} from 'better-convex-nuxt/server'
```

Keep `better-convex-nuxt/server/createUserSyncTriggers` as its existing separate subpath.

`serverConvexClearAuthCache` remains a distinct cache-maintenance operation. It is not an alternative caller and does not weaken `serverConvex` as the only query/mutation/action API.

Delete these server exports:

- `serverConvexQuery`
- `serverConvexMutation`
- `serverConvexAction`

## 5. Canonical contracts

### 5.1 Authentication installation

Keep the ability to use Better Convex Nuxt without Better Auth, but remove `auth.enabled` from the public input.

```ts
export interface ModuleOptions {
  auth?: false | ConvexAuthOptions
}

export interface ConvexAuthOptions {
  /** Build-only path to the single client definition. Never copied to runtime config. */
  client?: string
  route?: string
  trustedOrigins?: string[]
  /** Omitted/false disables the cache; an object enables it. */
  cache?: false | AuthCacheOptions
  proxy?: AuthProxyDefaults
  debug?: ConvexDebugOptions
  routeProtection?: Partial<ConvexRouteProtectionConfig>
}
```

Semantics:

| Input                      | Meaning                                                                         |
| -------------------------- | ------------------------------------------------------------------------------- |
| omitted                    | Install authentication with defaults                                            |
| `{}`                       | Install authentication with defaults                                            |
| `{ routeProtection: ... }` | Install authentication with those options                                       |
| `false`                    | Convex-only build; do not install the auth engine, client, proxy, or middleware |

Do not support `auth: true`. It adds no information because authentication is already the default. Do not infer disabled auth from a missing URL, missing definition file, or missing environment variable; configuration mistakes must remain visible.

Normalize the runtime shape as a discriminated value, not as an options object containing another user-controlled toggle:

```ts
export type NormalizedConvexAuthConfig =
  | false
  | {
      route: string
      trustedOrigins: readonly string[]
      cache: false | Readonly<Required<AuthCacheOptions>>
      proxy: Readonly<Required<AuthProxyDefaults>>
      debug: Readonly<Required<ConvexDebugOptions>>
      routeProtection: ConvexRouteProtectionConfig
    }
```

`auth.client` is removed before runtime config is constructed. Internal code derives `const authEnabled = config.auth !== false`. It may pass that derived boolean to low-level helpers, but `enabled` is not a module option and is not another source of truth.

When `auth: false`:

- `useConvexAuth()` remains auto-imported and returns the stable `disabled` state;
- `optional` queries execute anonymously without waiting;
- `required` queries remain idle;
- `none` queries execute anonymously immediately;
- no auth proxy route, Better Auth client, auth middleware, or auth engine is added to the build;
- auth-only options cannot coexist with `false` because every auth-only build option lives inside `ConvexAuthOptions`.

This explicit off switch is necessary for genuinely public Convex applications. The false-or-options shape makes contradictory states such as `{ enabled: false, routeProtection: ... }` impossible.

Use the same grammar for optional auth subsystems: omitted/`false` means disabled and an options object means enabled. `AuthCacheOptions` contains only `ttl`. Delete its nested `enabled` boolean and the warning that asks users to add one.

`auth.skipRoutes` and `auth.unauthorized` are deleted, together with the old top-level `skipAuthRoutes`, the `skipConvexAuth` page meta, `auth-unauthorized-core.ts`, `auth-unauthorized.ts`, and every per-call unauthorized-recovery branch. Public data uses query-level `'none'`; Convex-only applications use `auth: false`; protected navigation uses `routeProtection`; redirects caused by business authorization belong to the application. A definitive auth-engine token rejection or session revocation clears token and user and transitions to `anonymous`; it is not a configurable recovery product. This removes the documented `skipAuthRoutes` client-bootstrap performance knob; that cost is accepted for vNext.

Split installation by environment:

1. An always-installed core plugin creates the primary Convex client and imports no Better Auth code.
2. An auth-enabled-only client plugin creates the Better Auth client and auth engine.
3. An auth-enabled-only server plugin resolves SSR identity.
4. Auth proxy handlers and auth route middleware are registered only when auth is enabled.

An auth-disabled production build must contain no Better Auth client, auth engine, proxy handler, or auth middleware in its generated client or Nitro graphs.

### 5.2 Authentication modes

Use one type everywhere:

```ts
export type ConvexAuthMode = 'required' | 'optional' | 'none'
```

Semantics:

| Mode       | Initial auth loading | Settled authenticated | Settled anonymous   |
| ---------- | -------------------- | --------------------- | ------------------- |
| `required` | Wait                 | Execute with identity | Stay idle           |
| `optional` | Wait                 | Execute with identity | Execute anonymously |
| `none`     | Do not wait          | Execute anonymously   | Execute anonymously |

The fixed default is `optional`. Delete `defaults.auth`; authentication policy must not change invisibly between applications.

`optional` must never execute anonymously while initial auth is still loading. It executes once after settlement.

`none` means anonymous transport, not merely an anonymous cache key. In an authenticated browser, regular and paginated live `none` queries use a lazily created per-Nuxt-app anonymous `ConvexClient` that never receives `setAuth`. Auth-disabled builds reuse the already-anonymous primary client. Close every allocated client during app teardown. Construct every library-created browser `ConvexClient` — primary, replacement candidates, and the anonymous client — with `unsavedChangesWarning: false`: Convex registers a per-client `beforeunload` listener that `close()` does not remove, and a retired client closed with an in-flight mutation would otherwise permanently arm the unsaved-changes dialog. The anonymous client's WebSocket connects eagerly at construction, so lazy creation is mandatory, not stylistic.

Vue 3.5 exposes the teardown hook on the app instance, not as a Nuxt `app:unmounted` hook. Register it once:

```ts
nuxtApp.vueApp.onUnmount(() => {
  const clients = new Set([primaryClient, anonymousClient.value].filter(Boolean))
  void Promise.all([...clients].map((client) => client!.close()))
})
```

Do not invent a Nuxt lifecycle hook name for this cleanup.

### 5.3 Authentication state

```ts
export type ConvexAuthStatus = 'disabled' | 'loading' | 'anonymous' | 'authenticated' | 'error'
```

`status` describes current usable identity. `isPending` describes auth work in flight. These are deliberately independent.

```ts
export interface UseConvexAuthReturn<Client extends BaseAuthClient = BaseAuthClient> {
  status: ComputedRef<ConvexAuthStatus>
  isPending: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>
  user: Readonly<Ref<ConvexUser | null>>
  token: Readonly<Ref<string | null>>
  error: Readonly<Ref<ConvexCallError | null>>
  signIn: IntegratedSignIn<Client>
  signUp: IntegratedSignUp<Client>
  signOut: () => Promise<unknown>
  refresh: () => Promise<void>
  ready: (options?: { timeoutMs?: number }) => Promise<ConvexAuthStatus>
  client: Client | null
}
```

Public behavior:

- `disabled` is terminal for the current app build.
- SSR-authenticated and SSR-anonymous hydration starts in its settled state and never flashes through `loading`.
- A background refresh for an authenticated user keeps `status === 'authenticated'` while `isPending === true`.
- A failed background refresh may leave `status === 'authenticated'` and set `error` when the existing identity is still usable.
- A definitive 401 that invalidates the session transitions to `anonymous` and clears identity data.
- `ready()` waits for initial settlement and for the refresh that was active when `ready()` was called. It does not chase later refreshes.
- A timeout returns the current status and does not throw.

Race and invalidation invariants:

- Every auth engine owns two monotonically increasing counters. `authEpoch` invalidates stale auth-operation work. `identityGeneration` changes only when `getConvexIdentityKey` changes and invalidates identity-owned transport and application state. Same-user token rotation changes `authEpoch` but not `identityGeneration`.
- Token exchange stages a private `{ token, user, identityKey }` candidate. Public token, user, identity key, and authenticated status are published atomically only after Convex confirms the candidate through its auth callback.
- Exception: the SSR-hydrated snapshot is published as the settled initial state before client-side Convex confirmation; the server-side token exchange is its confirmation. The Convex client's `setAuth` pauses the socket until the token is confirmed, so no application work executes unauthenticated. A subsequent definitive rejection of the hydrated token follows the normal revocation transition.
- Refresh results may mutate token, user, error, status, or Convex transport only when their captured `authEpoch` remains current. Identity-owned callbacks may commit only while their captured `identityGeneration` remains current.
- Integrated sign-in, sign-up, and sign-out share one per-Nuxt-app serial identity-operation queue. Concurrent calls execute in invocation order. Background refresh remains separately deduplicated per `authEpoch`: the deduplication promise is tagged with the epoch it synchronizes, and a caller holding a newer `authEpoch` starts a new refresh rather than awaiting a stale one. It cannot commit across `authEpoch`.
- Sign-out and definitive revocation are identity-queue operations. Each increments `authEpoch` when it begins executing — before performing its effect or awaiting Better Auth — not at invocation time. Revocation discovered outside the queue increments `authEpoch` immediately before any asynchronous cleanup.
- A 401/403 or definitive Convex token rejection clears token, user, and `error` in one synchronous publish and transitions to `anonymous`.
- A timeout, network failure, or upstream 5xx during background refresh retains an already usable identity, records the error, and keeps `status === 'authenticated'`.
- If no usable identity exists and initial resolution fails, preserve the normalized error and settle `error`; `optional` and `required` surface that error without executing anonymously.
- A settled token without a non-empty Better Auth `user.id` is an authentication error. Discard it and never install it into Convex.
- Every stable identity-key change—anonymous→A, A→anonymous, or A→B—increments `identityGeneration`, synchronously hides and clears prior identity-owned library state, and retires the prior primary client. Authenticate or clear a fresh primary client and publish the new settled identity only after the transport reaches that state. Direct A→B has no settled-anonymous interlude.
- The token fetcher passed to Convex never rejects. A transient background failure returns a still-usable current token and records a transport error; without a usable token it returns `null` and settles `error`.
- Sign-in is legal from `error`; it does not require a preliminary `refresh()`.

`ready()` has exact snapshot semantics:

1. Capture the initial-settlement promise and the refresh promise active when called.
2. Await only those captured promises under one deadline.
3. Reflect rejection through auth state and return the current status; never reject.
4. Do not chase later work.
5. Default `timeoutMs` is 5,000 ms; `timeoutMs: 0` disables the timeout.
6. `disabled` resolves immediately.
7. Do not independently wait for sign-in, sign-up, or sign-out unless their refresh was already captured.

### 5.4 Identity cache key

```ts
export type ConvexIdentityKey = 'anonymous' | `user:${string}`

export function getConvexIdentityKey(user: ConvexUser | null): ConvexIdentityKey {
  if (!user) return 'anonymous'
  if (typeof user.id !== 'string' || user.id.length === 0) {
    throw new TypeError('Authenticated Convex user is missing a stable Better Auth user id')
  }
  return `user:${user.id}`
}
```

Use this one extraction function for SSR snapshots, client auth, cache keys, payload keys, and subscription keys.

Never construct `user:undefined`. A token without a resolved user is not a settled identity and must keep auth-gated queries waiting.

Token rotation for the same user does not change the key. Switching users changes the key even if sign-out cleanup failed.

The identity dimension applies to every identity-varying state holder:

- SSR payload keys;
- Nuxt async-data keys;
- live subscription keys;
- shared-query keys;
- paginated first-page keys and page generations;
- component-local settled data, errors, and subscription bridge snapshots.
- mutation and action call data, errors, pending status, callbacks, and optimistic updates;
- upload queue tasks, results, pending state, and callbacks;
- cached advanced-client handles and connection-state listeners.

On an identity-key change, synchronously clear local data, local errors, bridge snapshots, paginated pages, mutation/action/upload state, and optimistic state before acquiring work for the new identity. `keepPreviousData` never crosses an identity boundary. Ignore HTTP responses, subscription updates, callbacks, and locally applied work captured under a stale identity generation.

Convex 1.38 privately retains and reapplies pending optimistic updates. Clearing only Nuxt payloads and query state is therefore insufficient. Retire and close the primary `ConvexClient` on every stable identity-key change, including sign-in, sign-out/revocation, and direct user replacement; never import private Convex modules to purge it. Same-user token rotation retains the current client.

The per-app client owner is the single source of truth for the current primary and lazy anonymous clients. `useConvex()` returns its stable `ConvexClientHandle`, not a raw client. The handle exposes only replacement-safe operations required by consumers. A call captures the current identity generation and must reject or discard completion after replacement. Subscription behavior beyond the existing stateful composables must not be added to the handle unless the senior proof demonstrates transparent replacement without stale observations.

The public surface is exactly:

```ts
export interface ConvexClientHandle {
  query: ConvexClient['query']
  mutation: ConvexClient['mutation']
  action: ConvexClient['action']
  onUpdate: ConvexClient['onUpdate']
}
```

`connectionState` is not on the handle; `useConvexConnectionState()` is the only connection-observation API. `onUpdate` is retained solely because the Ginko Studio bridge (§10.6) is a non-Nuxt consumer whose live queries cannot use the stateful composables. The owner rebinds every active `onUpdate` listener to the fresh primary client during A→B before publishing B and unsubscribes it from A; the returned unsubscribe function remains stable and removes whichever underlying subscription is current. An invocation that crosses an identity generation rejects with `ConvexCallError({ kind: 'authentication', code: 'IDENTITY_CHANGED' })` and never returns the old result. If the §5.8 rebinding proof fails, the handle narrows to `query | mutation | action` and Phase 5 gains a funded work item migrating `useCmsStudioQuery.ts`, `useCmsStudioPaginatedQuery.ts`, and `useAccess.ts` off subscriptions; the release does not proceed with both the narrow handle and unmigrated Studio subscriptions. The `$convex` and `$auth` Nuxt-app property augmentations are deleted; do not return the raw client or build a generic proxy over every `ConvexClient` property.

### 5.5 Query arguments and skip

Every query call has three positional slots:

```ts
useConvexQuery(query, argsOrSkip, options)
```

Rules:

- The only skip value is the string literal `'skip'`.
- `null` and `undefined` are type errors and are not runtime skip aliases.
- No-argument Convex functions require `{}`.
- Options can never occupy the argument slot.
- Apply the same grammar to paginated queries and `defineSharedConvexQuery`.

Valid:

```ts
useConvexQuery(api.settings.get, {})
useConvexQuery(api.entries.get, () => (entryId.value ? { id: entryId.value } : 'skip'))
useConvexPaginatedQuery(api.entries.list, {}, { initialNumItems: 25 })
```

Invalid:

```ts
useConvexQuery(api.settings.get)
useConvexQuery(api.settings.get, null)
useConvexQuery(api.settings.get, { server: false })
```

For a truly empty Convex argument object, keep the repository's distributive `TightenEmptyArgs` formulation with `Record<PropertyKey, never>` (`src/runtime/utils/args-tuple.ts`); do not replace it with a naive `keyof` conditional that breaks union arguments. Change `ConvexQueryRest` and the shared-query args field so the args slot is always required, and update `test/unit/query-options-types.test.ts` accordingly: the current zero-args-accepted assertions for no-arg, all-optional, and union-optional queries become `@ts-expect-error` cases, while the union-member and unknown-property-rejection cases are preserved unchanged.

`defineSharedConvexQuery` always requires its `args` field, including `{}` for a no-argument query. `useConvexUser` remains a canonical/profile query helper—not an alias for `useConvexAuth().user`—and follows the same positional explicit-args grammar.

Query composables remain `async` and awaitable. Their promise resolves when the initial invocation reaches a terminal gate decision: first data is available, the query resolves as idle because of `'skip'` or auth policy, or `defaults.waitTimeoutMs` elapses. Waiting for initial auth settlement happens inside that promise. A settled-anonymous `required` query resolves idle immediately rather than consuming the wait timeout; `none` does not inspect or wait for auth.

### 5.6 Error contract

```ts
export type ConvexCallErrorKind = 'authentication' | 'transport' | 'server' | 'unknown'
```

Detection table:

| Kind             | Only valid sources                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `authentication` | Required identity missing, token exchange 401/403, explicit auth-engine classification     |
| `transport`      | Fetch/XHR failure, timeout, abort, unusable response, or unexpected upstream HTTP response observed at a library-owned HTTP boundary (token exchange, upload, auth proxy, SSR HTTP query); failures surfaced by `ConvexHttpClient`'s internal response handling carry no mechanical boundary tag and remain `unknown` |
| `server`         | Convex application/function error with `data` preserved verbatim                           |
| `unknown`        | Anything not mechanically classifiable above                                               |

The pure normalizer never guesses `authentication`. A product `ConvexError` with `data.code === 'UNAUTHORIZED'` remains `server`.

### 5.7 Normalized public config

`useConvexConfig()` returns the read-only result of the same normalizer used internally. It has no setter and creates no second configuration source.

```ts
export interface ConvexRuntimeConfig {
  readonly url: string | undefined
  readonly siteUrl: string | undefined
  readonly auth:
    | false
    | {
        readonly route: string
        readonly trustedOrigins: readonly string[]
        readonly cache: false | Readonly<Required<AuthCacheOptions>>
        readonly proxy: Readonly<Required<AuthProxyDefaults>>
        readonly routeProtection: Readonly<ConvexRouteProtectionConfig>
      }
  readonly defaults: {
    readonly server: boolean
    readonly subscribe: boolean
    readonly waitTimeoutMs: number
  }
  readonly upload: {
    readonly maxConcurrent: number
  }
  readonly logging: LogLevel | false
}
```

The build-only `auth.client` field is absent. `config.auth === false` is the only disabled-auth signal. Do not expose the raw `runtimeConfig.public.convex` input type as this normalized contract.

### 5.8 Pre-implementation proof gate

This gate is senior-owned and must pass before Phase 1 is assigned to a junior. Use packed-package fixtures pinned to the dependency versions selected for vNext.

The selected proof/release stack is explicit:

| Package                   | Pinned proof version |
| ------------------------- | -------------------: |
| Nuxt                      |              `4.4.7` |
| Convex                    |             `1.38.0` |
| Better Auth               |             `1.6.23` |
| `@better-auth/api-key`    |             `1.6.23` |
| `@convex-dev/better-auth` |             `0.12.5` |

Update Better Convex Nuxt's development fixtures and Ginko's compatibility/release stack to these versions before running the proofs. Runtime dependency ranges may remain semver-compatible where appropriate, but CI and packed-consumer fixtures use the exact versions above. Better Convex Nuxt's `check:workspace-deps` guards its own graph; Ginko's registry verification must separately assert that the installed release stack resolves these compatible versions without duplicate incompatible copies.

Prove all seven risks with minimal executable fixtures:

1. A packed Nuxt consumer narrows a non-null plugin-typed `useConvexAuth().client` from a generated definition and receives `apiKey.create`, while a base fixture exposes only the base client after the same narrowing. Retain this as a permanent real-package `nuxi prepare`/`nuxi typecheck` fixture; a disposable TypeScript micro-proof is not the release gate.
2. An authenticated browser can run a live `none` query through a separate anonymous Convex client and receive `ctx.auth.getUserIdentity() === null` without disturbing authenticated queries.
3. A real SSR-rendered Nuxt app in which a query fails server-side hydrates `useConvexQuery(...).error.value` as `instanceof ConvexCallError` with equal `kind`, `message`, `code`, `status`, and `data`, while a sentinel secret present only in `cause` appears in neither rendered HTML nor the payload. A bare reducer/reviver round-trip is insufficient.
4. A mounted `keepPreviousData: true` query switches directly A→B while an A-owned optimistic mutation remains in flight and a consumer retains the object returned by `useConvex()`. After `identityGeneration` changes, no A data, error, page, bridge snapshot, optimistic value, mutation/action/upload state, callback, HTTP result, WebSocket update, `useConvexUser.seedFromSession` value, or advanced-handle observation may appear. The A primary client is closed, the retained handle delegates to B, and the anonymous client is unchanged.
5. Query, mutation, and action server calls receiving a non-OK upstream body containing a sentinel secret expose only the generic public boundary error. The sentinel is absent from `message`, `toJSON()`, logs, and Nuxt payloads.
6. Concurrent token-bearing sign-ins execute serially in invocation order and each resolves only after its own identity is confirmed by Convex. Deferred B-then-C completion must leave C as the final identity.
7. Credential-bearing token exchange rejects redirects and never sends the credential to a redirect target.

The 2026-07-09 architecture review adds four proofs to this gate:

8. Epoch-scoped refresh deduplication: with a background refresh in flight, a completing sign-in advances `authEpoch` and its Convex synchronization does not await the stale refresh; the stale refresh cannot commit.
9. Retired-client hygiene: closing a client with an in-flight mutation rejects the consumer-held promise with `IDENTITY_CHANGED`, arms no unsaved-changes dialog, and accumulates no `beforeunload` listeners across repeated sign-in/out cycles.
10. Candidate confirmation without `expectAuth`: a fresh client given a token via `setAuth` reaches its confirmed-auth callback with zero application work executed pre-confirmation, within the internal 5,000 ms budget. The `setAuth` socket pause spans only the token-fetch window; confirmation then arrives asynchronously through the `onAuthChange(true)` callback driven by the server-confirmation transition, so the gate for all application work is that callback, not the pause. The 5,000 ms figure is our own budget, not a Convex constant.
11. `onUpdate` rebinding: active handle listeners rebind A→B with stable unsubscribe identity and no stale emission. Ginko's standalone Studio subscribes through `bridge.convexClient.onUpdate` and has no composable-based alternative; if this proof fails, the handle narrows and Phase 5 gains a funded Studio subscription-migration work item — the release does not proceed with both the narrow handle and unmigrated Studio subscriptions.

The development stack in this repository was upgraded to the pinned proof stack (Nuxt 4.4.7, Convex 1.38.0, Better Auth 1.6.23, `@better-auth/api-key` 1.6.23, `@convex-dev/better-auth` 0.12.5) as the first Phase 0 task, and every dependency-behavior claim (optimistic-update retention across `setAuth`, the unchanged-token refetch dead-end, the unhandled token-fetcher rejection, the `convex` plugin ID, and the `setAuth` socket pause spanning only the token-fetch window) was re-verified on the pinned versions before any proof was accepted.

Also verify the installed `@convex-dev/better-auth` version exposes the Convex client plugin's stable ID. The currently inspected package declares `id: 'convex'`; pin that expectation with a fixture rather than relying on recollection.

Local feasibility audit already verified:

- the definition generic compiles against Better Auth `1.6.20` and `1.6.23` with `BetterAuthClientPlugin`, preserves `apiKey.create`, and rejects consumer `baseURL`/`basePath`/`fetchOptions`;
- `apiKey.create` accepts Ginko's `name`, `expiresIn`, and `metadata` input and returns typed `id` and `key` fields;
- Better Auth email sign-in exposes `data.token`, sign-up exposes `data.token: string | null`, and redirect-only social results have no token;
- the Convex client plugin ID is `convex`, and the API-key plugin ID is `api-key` in the pinned packages;
- independent `ConvexClient` instances own independent auth and expose `close(): Promise<void>`; Vue 3.5 exposes `vueApp.onUnmount` for cleanup;
- Nuxt 4.3.1 and 4.4.7 expose `definePayloadPlugin`, `definePayloadReducer`, `definePayloadReviver`, and ordered plugins; a direct devalue reducer/reviver round-trip preserved class identity without serializing `cause`, but Nuxt `useAsyncData` wraps handler rejections in `H3Error`, so this does not prove the real query path;
- `ConvexHttpClient` supports constructor-injected fetch, `setAuth`, and typed query/mutation/action methods and reconstructs `ConvexError.data` from `errorData`;
- Convex 1.32 and 1.38 expose no stable argument-validation marker, so the public `validation` kind was removed;
- Convex's UDF-failure HTTP status constant is not exported from `convex/browser`, so vNext does not depend on it or guess classifications from it;
- Nuxt module-dependency defaults preserve an explicit host `auth: false` under `defu`.

The latest executable audit also proved that Convex 1.38 reapplies an A-owned pending optimistic update after B's server result when one primary client is reused. It also proved that `ConvexHttpClient` may expose an arbitrary non-OK upstream response body as `Error.message`. Those failures are why client retirement and server-boundary sanitization are mandatory rather than optional hardening.

These checks prove API feasibility, not the eleven cross-system behaviors above. Current proof status: all eleven §5.8 proofs pass on the pinned stack with recorded count evidence, under `test/proofs/` — packed typing (proof 1, real `nuxi prepare`/typecheck fixture), live anonymous `none` isolation (proof 2), the real SSR error/redaction path (proof 3), same-client A→B leak reproduction and replacement-primary isolation (proof 4 and the §17 isolation fixtures), server-boundary sanitization and redirect safety (proofs 5 and 7), the serial sign-in, epoch-refresh-deduplication, retired-client-hygiene, candidate-confirmation, total-token-fetcher and concurrent-session gates (proofs 6, 8, 9, 10), and `onUpdate` rebinding with stable unsubscribe identity and zero stale emission (proof 11). Proof 11 passed, so the handle retains `query | mutation | action | onUpdate`. The reuse-one-client A→B approach failed and was replaced by the retirement design, re-confirmed on the pinned stack. Junior implementation of Phase 1 may proceed. The targeted `useConvex()` handle API review was completed on 2026-07-09; its outcome is the §5.4 contract.

If any proof fails, stop the release and update the design with evidence. Failure does not authorize retaining `createBetterConvexAuthClient`, adding another public client, weakening anonymous `none`, or weakening cross-user isolation.

## 6. Phase 1 — foundation vocabulary and surface pruning

### Goal

Land the breaking vocabulary together with the transport and isolation semantics those words promise. Do not publish `required | optional | none` while live `none` queries still use an authenticated client or while identity changes can retain local data.

### Files to change

- `src/module.ts`
- `src/module-api-surface.ts`
- `src/runtime/plugin.client.ts`, reduced to the auth-free core client plugin
- `src/runtime/plugin.server.ts`, split so auth code is conditionally registered
- a new auth-enabled-only client plugin
- a new per-Nuxt-app client owner that owns primary-client replacement, the lazy anonymous client, and one stable public handle
- `src/runtime/utils/config-defaults.ts`
- `src/runtime/utils/auth-config.ts`
- `src/runtime/utils/query-execution-gate.ts`
- `src/runtime/utils/identity-key.ts`
- `src/runtime/utils/args-tuple.ts`
- `src/runtime/utils/convex-cache.ts`
- `src/runtime/composables/useConvexQuery.ts`
- `src/runtime/composables/useConvex.ts`
- `src/runtime/composables/useConvexPaginatedQuery.ts`
- `src/runtime/composables/defineSharedConvexQuery.ts`
- `src/runtime/composables/useConvexAuth.ts`
- a new `src/runtime/composables/useConvexConfig.ts`
- `src/runtime/composables/useConvexUser.ts`
- a new `src/runtime/utils/auth-status.ts`
- `src/runtime/components/ConvexAuthenticated.vue`
- `src/runtime/components/ConvexUnauthenticated.vue`
- `src/runtime/components/ConvexAuthLoading.vue`
- `src/runtime/components/ConvexAuthError.vue`
- `src/runtime/composables/useConvexStorageUrl.ts`
- `src/runtime/composables/index.ts`
- `package.json`
- docs, playground, starters, and consumer fixtures containing removed vocabulary

Delete:

- `src/runtime/composables/useConvexCall.ts`
- `src/runtime/composables/usePermissions.ts`
- `src/runtime/utils/auth-unauthorized-core.ts`
- `src/runtime/utils/auth-unauthorized.ts`
- the `skipConvexAuth` page meta and every per-call unauthorized-recovery branch
- tests dedicated only to those deleted APIs

### Implementation checklist

- [ ] Introduce the shared `ConvexAuthMode` type with exactly three literals.
- [ ] Replace the nested `auth.enabled` input with `auth?: false | ConvexAuthOptions`; omitted or object-valued auth installs authentication.
- [ ] Normalize auth to the `false | NormalizedConvexAuthConfig` runtime union and derive any internal `authEnabled` boolean from that value.
- [ ] Move every auth-only build option inside `ConvexAuthOptions`; `auth: false` structurally excludes them.
- [ ] Replace `auth.cache.enabled` with a false-or-options value; delete the configure-without-enabled warning. Delete `auth.unauthorized`, `auth.skipRoutes`, the `skipConvexAuth` page meta, `auth-unauthorized-core.ts`, `auth-unauthorized.ts`, and every per-call unauthorized-recovery branch (§5.1).
- [ ] Delete the old top-level `authRoute`, `trustedOrigins`, `skipAuthRoutes`, `authCache`, `authProxy`, and auth-only `debug` inputs after moving their values under `auth`.
- [ ] Split the core client/server plugins from conditionally registered auth plugins so auth-disabled build graphs contain no Better Auth runtime.
- [ ] Delete the process-global development auth-healthcheck cache in `plugin.server.ts`; diagnostics must not create process-scoped application state.
- [ ] Publish the normalized `useConvexConfig()` contract and the complete two-dimensional auth status contract in §5.3.
- [ ] Register `useConvexAuth()` unconditionally; implement its stable disabled result without importing the auth engine into an auth-disabled build.
- [ ] Add `ConvexIdentityKey` and use the single stable-user-ID extraction function everywhere identity-varying state is keyed.
- [ ] Route live `none` regular and paginated queries through the per-app anonymous client proved in §5.8; reuse the primary client only when auth is disabled.
- [ ] Replace the primary client on every stable identity-key change (anonymous↔user and user↔different user). Keep same-user token rotation on the current client and keep the dedicated `none` anonymous client untouched.
- [ ] Return one stable replacement-safe `ConvexClientHandle` from `useConvex()`; do not expose or re-provide the replaceable raw primary client.
- [ ] Clear all identity-owned state named in §5.4 synchronously on identity change and reject stale-generation commits, including optimistic, mutation/action, upload, callback, and `useConvexUser.seedFromSession` state.
- [ ] Replace client `auto` behavior with `required`.
- [ ] Replace server `auto` behavior with `optional`; the server trio remains temporarily internal until Phase 4 but no public docs should use it.
- [ ] Set the fixed query default to `optional`.
- [ ] Delete `QueryDefaults.auth` and `CONVEX_MODULE_DEFAULTS.defaults.auth`.
- [ ] Update the execution gate so `required` and `optional` wait for initial auth settlement, while `none` does not.
- [ ] Make `'skip'` the only skip sentinel.
- [ ] Make the args position required for all query and paginated-query calls.
- [ ] Require `args` for `defineSharedConvexQuery` and positional args for `useConvexUser`.
- [ ] Tighten no-argument functions to an exact empty object.
- [ ] Preserve query-composable awaitability with the terminal-decision contract in §5.5.
- [ ] Delete the public `getQueryKey` auto-import/export and rename the internal base-key helper to `createConvexQueryKey` so the removed public name cannot drift back into examples.
- [ ] Delete `useConvexCall` and replace internal examples with `useConvex()` or the appropriate stateful composable.
- [ ] Delete `createPermissions`, its module option, auto-import registration, docs API entry, and playground usage.
- [ ] Move the permissions example to a standalone recipe document that imports no permission runtime from the package.
- [ ] Register all four auth rendering components unconditionally; they render from `ConvexAuthStatus`, including `disabled`.
- [ ] Add the removed-vocabulary bans to the table-driven Node vocabulary checker (internal specification §16.3), which replaces the `sh -c '! rg …'` package scripts and must exist before any vocabulary gate is trusted. Each locked name carries its activation phase: Phase 1 activates `auto`, nullable skip, `getQueryKey`, `useConvexCall`, `createPermissions`, and the other Phase 1 deletions; Phase 4 activates `serverConvexQuery`, `serverConvexMutation`, `serverConvexAction`; Phase 6 activates the remainder and freezes the table. Do not add new shell/ripgrep lint scripts in any phase.

### Required execution-gate behavior

Drive the gate from the canonical auth status and stable identity key. `isPending` is deliberately absent because background work must not idle an already usable identity.

```ts
export interface QueryExecutionGateInput {
  authStatus: ConvexAuthStatus
  authMode: ConvexAuthMode
  identityKey: ConvexIdentityKey | null
  skipped: boolean
  subscribe: boolean
}
```

Decision order:

1. Explicit `'skip'` resolves idle.
2. `none` executes without waiting and uses `anonymous` cache dimension.
3. With `disabled`, `required` resolves idle and `optional` executes anonymously without waiting.
4. With `loading`, `required` and `optional` wait.
5. With `error`, `required` and `optional` surface the auth error without a network request. They do not silently downgrade to anonymous.
6. With `anonymous`, `required` resolves idle and `optional` executes anonymously.
7. With `authenticated`, `required` and `optional` require a non-null matching `user:<id>` key and execute with that identity.

In Phase 1, map the existing engine's initial-settlement signal — the engine-private `hasResolvedInitialAuth` flag, observable only through the shared `convex:pending` state — and `awaitAuthReady()` into the canonical status, with SSR state seeded by the server plugin before render. The `convex-auth-ready.ts` mutation/action helper consumes that engine signal but is not itself the source of truth. `identityKey` derives from the existing `convex:user` state through the new extractor. Introduce the two-counter contract now; do not preserve the insufficient single auth-generation model.

`src/runtime/utils/identity-key.ts` and the anonymous-client helper are new files. `query-execution-gate.ts`, `args-tuple.ts`, and `convex-cache.ts` are existing files modified in place.

### Tests

Create or update:

- `test/unit/query-execution-gate.test.ts`
- `test/unit/auth-config.test.ts`
- `test/unit/auth-status.test.ts`
- `test/unit/query-options-types.test.ts`
- `test/fixtures/consumer-smoke/composables/usePublicApiSurfaceContracts.ts`
- `test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts`
- `test/nuxt/useConvexQuery.identity.nuxt.test.ts`
- `test/nuxt/useConvexQuery.anonymous-transport.nuxt.test.ts`
- `test/nuxt/useConvexPaginatedQuery.nuxt.test.ts`
- auth-disabled build-graph and route fixtures
- a source check banning `auto`, nullable skip, `getQueryKey`, `useConvexCall`, and `createPermissions`

Type-contract assertions must include:

```ts
void useConvexQuery(api.tasks.list, {})
void useConvexQuery(api.tasks.list, 'skip')

// @ts-expect-error args are always positional
void useConvexQuery(api.tasks.list)

// @ts-expect-error null is not the skip sentinel
void useConvexQuery(api.tasks.list, null)

// @ts-expect-error options cannot occupy an exact-empty args slot
void useConvexQuery(api.tasks.list, { server: false })

// @ts-expect-error shared queries always declare args
void defineSharedConvexQuery({ key: 'settings', query: api.settings.get })

// @ts-expect-error canonical user queries require positional args
void useConvexUser(api.users.current)
```

Auth-configuration assertions must include:

- omitted auth and `auth: {}` normalize to the same enabled configuration;
- omitted/false cache normalizes disabled, while `{}` enables it with defaults;
- `{ auth: { skipRoutes: [] } }` and `{ auth: { unauthorized: {} } }` fail the module-options typecheck;
- `auth: false` installs no auth runtime, and the type offers no nested auth-only fields in that branch;
- `{ auth: { enabled: false } }` fails the module-options typecheck;
- old top-level `authRoute`, `trustedOrigins`, `skipAuthRoutes`, `authCache`, `authProxy`, and `debug` fields fail module-options typechecks;
- disabled-auth `optional` queries execute anonymously without a loading state;
- disabled-auth `required` queries remain idle.

Runtime assertions must include:

- an authenticated `none` live query observes no Convex identity while `optional` and `required` observe the signed-in subject;
- sign-in, sign-out, and same-user token rotation do not reacquire a mounted `none` subscription;
- anonymous→A and A→anonymous each retire the prior primary client without carrying public/private optimistic state across the boundary;
- direct A→B replacement with `keepPreviousData: true` never exposes A's local data, error, bridge snapshot, or paginated page to B;
- an A-owned optimistic mutation remains in flight during direct A→B; the A client closes, the stable `useConvex()` handle delegates to B, and no A-owned optimistic/call/upload/callback state is observable;
- stale HTTP and WebSocket results captured under A's generation cannot commit after B becomes current;
- awaited settled-anonymous `required` resolves idle without consuming `waitTimeoutMs`;
- awaited `none` reaches its terminal result without reading auth state;
- every allocated Convex client closes on app teardown;
- auth-disabled generated graphs and routes contain no Better Auth client, auth engine, proxy handler, or auth middleware;
- `useConvexAuth()` is auto-imported in auth-disabled builds and returns the exact stable disabled contract;
- `useConvexConfig()` returns the normalized root-exported type and never exposes `auth.client`;
- removed `getQueryKey` imports fail in a packed consumer.

### Phase verification

Run:

```bash
pnpm run lint
pnpm run test:types
pnpm run check:consumer-smoke
pnpm vitest run --project=unit test/unit/auth-config.test.ts test/unit/auth-status.test.ts test/unit/query-execution-gate.test.ts test/unit/query-options-types.test.ts
pnpm vitest run --project=nuxt test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts test/nuxt/useConvexQuery.identity.nuxt.test.ts test/nuxt/useConvexQuery.anonymous-transport.nuxt.test.ts test/nuxt/useConvexPaginatedQuery.nuxt.test.ts
```

Phase 1 is complete only when removed spellings fail source checks, removed imports fail the consumer typecheck, anonymous `none` transport is proven in an authenticated app, and the mounted A→B isolation fixture passes with an in-flight optimistic update, a retained stable handle, and confirmed closure of A's primary client.

## 7. Phase 2 — public error contract

### Goal

Make every throwing and safe call expose one honest error type, and make generic normalization usable outside Nuxt.

### New files

- `src/runtime/errors/index.ts` or a top-level source entry that builds without runtime-framework imports
- a universal Nuxt payload plugin for `ConvexCallError` reduction and revival
- `test/unit/convex-call-error.test.ts`
- `test/unit/errors-subpath-purity.test.ts`
- an SSR hydration test for `ConvexCallError` class identity and redaction
- `test/fixtures/errors-consumer/package.json`
- `test/fixtures/errors-consumer/index.ts`

### Package export

Add:

```json
{
  "./errors": {
    "types": "./dist/runtime/errors/index.d.ts",
    "import": "./dist/runtime/errors/index.js"
  }
}
```

Update `typesVersions`, the packed-entry check's export table (the `check:package-exports` command name is retained, but by this phase its implementation is the AST-plus-packed-probe gate defined in the internal specification §16.2, delivered in Internal Phase 0), the consumer smoke fixture, and the generated API-surface documentation.

### Required class

```ts
export interface ConvexCallErrorInput {
  kind: ConvexCallErrorKind
  message: string
  code?: string
  status?: number
  data?: unknown
  cause?: unknown
}

export class ConvexCallError extends Error {
  readonly kind: ConvexCallErrorKind
  readonly code?: string
  readonly status?: number
  readonly data?: unknown
  override readonly cause?: unknown

  constructor(input: ConvexCallErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = 'ConvexCallError'
    this.kind = input.kind
    this.code = input.code
    this.status = input.status
    this.data = input.data
    this.cause = input.cause
  }

  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      message: this.message,
      code: this.code,
      status: this.status,
      data: this.data,
    }
  }
}
```

`cause` is a runtime-only debugging field and is never serialized. If the TypeScript target rejects assigning it after `super`, use one declaration strategy that preserves the same runtime field without changing the serialized contract.

### Required normalizer behavior

```ts
export function normalizeConvexError(error: unknown): ConvexCallError {
  if (error instanceof ConvexCallError) return error
  if (isConvexApplicationError(error)) {
    return new ConvexCallError({
      kind: 'server',
      message: readErrorMessage(error),
      code: readCode(error),
      status: readStatus(error),
      data: readStructuredData(error),
      cause: error,
    })
  }
  return new ConvexCallError({
    kind: 'unknown',
    message: readErrorMessage(error),
    cause: error,
  })
}
```

Implement every referenced helper in the same framework-free module or an adjacent framework-free file. Tests, not message guessing, define the classification behavior.

The pure normalizer does not classify arbitrary `TypeError` values as `transport`; it cannot know whether user code or a network API created them. Fetch, XHR, timeout, abort, oversized-response, and malformed-response boundaries construct `ConvexCallError({ kind: 'transport', ... })` while the boundary still knows the source. Re-normalizing that instance passes it through unchanged. Convex query subscriptions do not turn a reconnectable socket disconnect into a query failure, so do not invent a WebSocket call error from connection-state changes.

`isConvexApplicationError` accepts `instanceof ConvexError` or exact cross-package marker equality, `error[Symbol.for('ConvexError')] === true`, matching Convex's installed implementation. Mere property presence is insufficient. This keeps structured application errors recognizable when the host and library resolve different physical Convex copies. Preserve `error.data` verbatim.

The pinned Convex 1.32 and 1.38 packages expose no stable argument-validation class or structured marker. Therefore vNext has no `validation` kind and never classifies from message text. Remote failures with `errorData` are `server`; unstructured argument-validation failures are `unknown`. Add a new public kind only if a future pinned Convex release provides a mechanically testable signal.

### Integrate the contract

- [ ] Replace the old serializable `ConvexCallError` interface with the class.
- [ ] Make `CallResult<T>` use the class.
- [ ] Make mutation/action `.safe()` use the same normalization function as the throwing path.
- [ ] Normalize errors at query, paginated query, upload, auth, and server boundaries.
- [ ] Preserve Convex HTTP `errorData` as `data` before normalization.
- [ ] Keep product `data` unchanged.
- [ ] Ensure logs redact or omit raw causes; do not stringify credential-bearing objects.
- [ ] Delete the plain-`Error` `toError` conversion; throwing paths throw `ConvexCallError` directly.
- [ ] Add an unshifted universal Nuxt payload plugin with a `ConvexCallError` reducer and reviver. The framework-free `/errors` entry remains unaware of Nuxt.

Nuxt's `useAsyncData` wraps handler rejections with `createError()`, producing an `H3Error` before the module payload reducer can observe the original class. Query and paginated-query composables therefore must not expose normalized failures through `asyncData.error`:

- catch inside the handler and normalize exactly once;
- store the `ConvexCallError` in library-owned, identity-partitioned payload state;
- make the composable's public `error` ref read that state, never `asyncData.error`;
- resolve the handler with `null` data rather than rejecting, so Nuxt does not manufacture an `H3Error`;
- clear that state synchronously on identity change;
- keep mutation, action, and upload throwing paths direct because they are consumed in context rather than through Nuxt payload `_errors`.

The payload plugin follows Nuxt's installed API and is registered with an explicit negative `order` so revival exists before payload parsing:

```ts
addPlugin({
  src: resolver.resolve('./runtime/plugins/convex-call-error-payload'),
  mode: 'all',
  order: -50,
})
```

```ts
export default definePayloadPlugin(() => {
  definePayloadReducer('ConvexCallError', (value) => {
    if (!(value instanceof ConvexCallError)) return
    return value.toJSON()
  })

  definePayloadReviver('ConvexCallError', (value) => {
    if (!isSerializedConvexCallError(value)) return
    return new ConvexCallError({
      kind: value.kind,
      message: value.message,
      code: value.code,
      status: value.status,
      data: value.data,
    })
  })
})
```

Implement `isSerializedConvexCallError` as strict structural validation of the serialized public fields. It must not revive arbitrary objects solely because they contain a `name` string.

Integrate server-call errors only when `serverConvex` lands in Phase 4. Do not normalize the temporary server trio and replace that integration one phase later.

### Golden fixtures

Cover exactly:

- auth-context-created authentication error;
- unstructured Convex argument-validation failure remaining `unknown`;
- boundary-wrapped fetch rejection, plus a plain application `TypeError` that remains `unknown`;
- timeout or abort;
- unexpected upstream HTTP response;
- Convex application error containing structured data;
- plain `Error`;
- string and object unknown errors;
- an existing `ConvexCallError` passed through unchanged.

For equivalent raw failures, throwing and safe calls must produce equal `toJSON()` results and both values must be `instanceof ConvexCallError`. A real SSR query failure—not a synthetic reducer call—must revive through the composable-owned error state as `instanceof ConvexCallError` with equal `kind`, `message`, `code`, `status`, and `data`, while a secret present only in `cause` is absent from rendered HTML, payload JSON, logs, and `JSON.stringify(error)`.

### Purity guard

Inspect both source and built output. Fail when the errors entry imports:

- `vue`
- `nuxt`
- `@nuxt/*`
- `#imports`
- `#app`
- `nitropack/runtime`
- browser-only or Node-only built-ins

`convex/values` is explicitly allowed because the framework-free normalizer needs `instanceof ConvexError`.

### Phase verification

```bash
pnpm vitest run --project=unit test/unit/convex-call-error.test.ts test/unit/errors-subpath-purity.test.ts
pnpm run check:package-exports
pnpm run check:consumer-smoke
pnpm run test:types
```

## 8. Phase 3 — authentication lifecycle and the typed client

### Goal

Create one typed Better Auth client per Nuxt app, make `useConvexAuth()` stable in enabled and disabled builds, preserve race-safe auth generations, and make sign-in/sign-up atomic with Convex synchronization. Phase 1 already owns anonymous transport and identity-partitioned query state.

### New source boundaries

- `src/runtime/auth-client/index.ts`: framework-free definition helper and types
- extend Phase 1's `useConvexConfig.ts` and `auth-status.ts` only where typed-client integration requires it
- a generated `#convex/auth-client` template created by `src/module.ts`
- generated consumer type augmentation for the resolved auth-client definition

### Package export

Add:

```json
{
  "./auth-client": {
    "types": "./dist/runtime/auth-client/index.d.ts",
    "import": "./dist/runtime/auth-client/index.js"
  }
}
```

Add the matching `typesVersions` entry and package-export checks.

### Module option

Use the build-only field already defined inside `ConvexAuthOptions`:

```ts
export interface ModuleOptions {
  auth?: false | ConvexAuthOptions
}

export interface ConvexAuthOptions {
  client?: string
  // remaining auth options are defined in §5.1
}
```

`auth.client` is a source alias or path to a default-exported definition. Strip it before constructing `runtimeConfig.public.convex`.

Default resolution order:

1. Explicit `auth.client` when provided.
2. `<srcDir>/convex-auth.ts` when that file exists.
3. A built-in empty definition containing no additional plugins.

Path rules are exact:

- resolve explicit `auth.client` with Nuxt Kit `resolvePath` using `cwd: nuxt.options.rootDir` and `alias: nuxt.options.alias`;
- require the resolved file to exist and include the original specifier in configuration errors;
- convention discovery searches only the host application's `srcDir`;
- Nuxt layers and reusable modules provide an already resolved absolute path and are never convention-scanned.

Do not inspect multiple convention filenames. One default filename is enough.

### Framework-free definition helper

The public helper captures type information and does not instantiate a client.

```ts
import type { BetterAuthClientOptions, BetterAuthClientPlugin } from 'better-auth/client'

type AuthClientPlugins = readonly BetterAuthClientPlugin[]

export type ConvexAuthClientDefinitionOptions<Plugins extends AuthClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'basePath' | 'plugins' | 'fetchOptions'
> & {
  plugins?: Plugins
}

export interface ConvexAuthClientDefinition<Plugins extends AuthClientPlugins> {
  readonly options: ConvexAuthClientDefinitionOptions<Plugins>
}

export function defineConvexAuthClient<const Plugins extends AuthClientPlugins = []>(
  options: ConvexAuthClientDefinitionOptions<Plugins> = {},
): ConvexAuthClientDefinition<Plugins> {
  return Object.freeze({ options: Object.freeze(options) })
}
```

The pinned Better Auth type proof compiles with the constraints above. Preserve these rules:

- the consumer cannot set `baseURL` or `basePath`; normalized `auth.route` is the single route source;
- the consumer cannot set `fetchOptions`; the library owns credentials and request transport;
- the consumer supplies additional client plugins only;
- the library prepends exactly one Convex client plugin;
- the definition contains no app or process singleton.

### Example consumer definition

```ts
import { apiKeyClient } from '@better-auth/api-key/client'
import { organizationClient } from 'better-auth/client/plugins'
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

export default defineConvexAuthClient({
  plugins: [organizationClient(), apiKeyClient()],
})
```

### Generated runtime template

During module setup, resolve the definition and generate a virtual module that re-exports it:

```ts
const authClientTemplate = addTemplate({
  filename: 'better-convex-nuxt/auth-client.mjs',
  getContents: () => `export { default } from ${JSON.stringify(resolvedAuthClientDefinitionPath)}`,
})

nuxt.options.alias['#convex/auth-client'] = authClientTemplate.dst
```

Do not use a `#build/*` alias key: Nuxt's built-in `#build` prefix resolves independently of this template destination. `#convex/*` is the module's established namespace. The generated file must be imported only from the auth-enabled client plugin.

### Generated type registry

Define an augmentable registry in the public type surface:

```ts
export interface ConvexAuthClientRegistry {}
```

Generate and register a declaration with Nuxt Kit's installed `addTypeTemplate`; do not rely on an unreferenced `.d.ts` file being discovered:

```ts
addTypeTemplate({
  filename: 'types/better-convex-nuxt-auth-client.d.ts',
  getContents: () => `
    import type definition from ${JSON.stringify(resolvedAuthClientDefinitionPath)}

    declare module 'better-convex-nuxt' {
      interface ConvexAuthClientRegistry {
        definition: typeof definition
      }
    }
  `,
})
```

Implement `InferRegisteredConvexAuthClient` so `useConvexAuth().client` exposes plugin methods when a definition exists and falls back to the base Better Auth client type otherwise.

`InferRegisteredConvexAuthClient` extracts the plugins tuple from the registered definition value. Never reconstruct generic plugin types with `ReturnType<typeof pluginFactory>`; factories such as `organizationClient` lose route inference under that formulation. Pin this with a compile test.

`BaseAuthClient` means the inferred `createAuthClient` return type for the library-owned options with no consumer plugins. Infer it and the registered type from the same Better Auth entry used by runtime instantiation—currently `better-auth/vue`, not `better-auth/client`—so session and plugin shapes cannot drift.

The packed proof in §5.8 is a prerequisite, not a fallback decision inside this phase. If the generated registry stops satisfying that fixture, stop the release. Delete `createBetterConvexAuthClient`; do not retain it or add a second client API.

Module augmentation is TypeScript-program-global. The supported isolation contract is:

- two Nuxt app instances in one process have isolated runtime clients;
- separate generated consumer TypeScript programs infer their own definitions;
- two conflicting auth-client definitions in one TypeScript program are unsupported.

### Client instantiation

In the auth-enabled-only client plugin:

1. Import the definition from `#convex/auth-client`.
2. Runtime-validate the definition for JavaScript/untyped consumers. Reject forbidden own keys `baseURL`, `basePath`, and `fetchOptions`, a non-array `plugins` value, malformed plugins, and an additional plugin whose stable `id` is `convex`.
3. Create one Better Auth client for that Nuxt app.
4. Set the module-owned `baseURL`.
5. Prepend `convexClient()` once.
6. Set `fetchOptions.credentials` to `include`.
7. Provide the instance on `nuxtApp`.
8. Pass the same instance to the auth engine.

Do not create or mutate module-level registration state. A second Nuxt app in the same process receives a separate instance. Store the instance and engine on `nuxtApp`; plugin reevaluation under HMR reuses that app's existing values rather than creating duplicates.

The unconditionally imported `useConvexAuth` composable and auth-status components must not runtime-import Better Auth, the Convex Better Auth plugin, the auth engine, or the generated definition. They read one optional per-app integration slot. Only the auth-enabled plugin imports the auth graph.

### Always-available auth composable

Register `useConvexAuth` unconditionally in `module-api-surface.ts`. Add the expensive auth plugin, proxy route, and engine only when normalized `auth !== false`.

In an auth-disabled build, the composable returns:

```ts
{
  status: computed(() => 'disabled'),
  isPending: computed(() => false),
  isAuthenticated: computed(() => false),
  user: readonly(ref(null)),
  token: readonly(ref(null)),
  error: readonly(ref(null)),
  client: null,
  ready: async () => 'disabled',
  refresh: async () => {
    throw createAuthDisabledError()
  },
  signOut: async () => {
    throw createAuthDisabledError()
  },
  signIn: createDisabledAuthNamespace('signIn'),
  signUp: createDisabledAuthNamespace('signUp'),
}
```

Use stable module-scoped immutable disabled refs if that avoids allocating them per composable call. Those refs may be module-scoped because they contain no app-specific state and never mutate.

### Atomic sign-in/sign-up

Wrap the complete `signIn` and `signUp` namespaces, not only `.email`.

```ts
function createIntegratedAuthNamespace<T extends object>(
  namespace: T,
  synchronizeIdentity: () => Promise<void>,
): T {
  const proxyCache = new WeakMap<object, object>()
  const propertyCache = new WeakMap<object, Map<PropertyKey, unknown>>()

  const wrapObject = <Value extends object>(target: Value): Value => {
    const cached = proxyCache.get(target)
    if (cached) return cached as Value

    const proxy = new Proxy(target, {
      get(currentTarget, property, receiver) {
        const cachedProperties = propertyCache.get(currentTarget) ?? new Map<PropertyKey, unknown>()
        propertyCache.set(currentTarget, cachedProperties)
        if (cachedProperties.has(property)) return cachedProperties.get(property)

        const value = Reflect.get(currentTarget, property, receiver)
        if (typeof value === 'function') {
          const wrapped = async (...args: unknown[]) => {
            const result = await Reflect.apply(value, currentTarget, args)
            const error = readBetterAuthResultError(result)
            if (!error && shouldSynchronizeAfterAuthResult(result)) {
              await synchronizeIdentity()
            }
            return result
          }
          cachedProperties.set(property, wrapped)
          return wrapped
        }
        if (isPlainNamespaceObject(value)) {
          const wrapped = wrapObject(value)
          cachedProperties.set(property, wrapped)
          return wrapped
        }
        return value
      },
    })
    proxyCache.set(target, proxy)
    return proxy
  }

  return wrapObject(namespace)
}
```

`synchronizeIdentity` is not the background `refresh()`. It enqueues the operation's candidate on the per-app serial identity-operation queue and resolves only after Convex confirms the candidate identity under the operation's `authEpoch`. Passing the deduplicated background refresh here is a defect.

The wrapper above applies a method with its containing object as `this` and caches functions as well as nested proxies, so `auth.signIn.email === auth.signIn.email`. Add a test plugin whose method fails when its receiver is lost.

Wrap only callables and plain namespace objects. Arrays, class instances, and store atoms or subscription-bearing values pass through unchanged. Wrapped functions intentionally do not preserve arbitrary own properties of the source function. Pin these boundaries with fixtures; do not turn the wrapper into a generic deep proxy.

`shouldSynchronizeAfterAuthResult` rules:

- no sync after a thrown operation;
- no sync when the returned object has a truthy `error`;
- sync only after a successful Better Auth client result contains a non-empty `result.data.token` string;
- social/redirect operations rely on the return navigation and SSR cookie exchange when the browser leaves the page;
- successful account creation without a session remains successful and does not become a refresh failure;
- token-bearing identity-changing calls enter the serial identity-operation queue and resolve only after their candidate identity is confirmed by Convex;
- background `refresh()` uses its separate per-Nuxt-app deduplication promise.

Do not expose a `runAuthOperation` wrapper.

The pinned Better Auth types confirm email sign-in returns a token, email sign-up returns `token: string | null`, and social sign-in returns either redirect data or token-bearing session data. Implement the predicate directly:

```ts
function shouldSynchronizeAfterAuthResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  const response = result as {
    error?: unknown
    data?: { token?: unknown } | null
  }
  return (
    !response.error && typeof response.data?.token === 'string' && response.data.token.length > 0
  )
}
```

A result that only initiates an external redirect does not prove that a session exists and must not trigger refresh. Add fixtures for email success, email failure, sign-up with `token: null`, social redirect, token-bearing social completion, and `disableRedirect` OAuth initiation.

### Pending-operation tracking

Do not toggle one boolean from nested operations. Integrated sign-in calls `refresh()`, so independent `true`/`false` assignments can clear pending before the outer operation finishes. Track a count or set and derive the public boolean.

```ts
function createPendingOperations() {
  const activeCount = ref(0)
  const isPending = computed(() => activeCount.value > 0)

  async function run<T>(operation: () => Promise<T>): Promise<T> {
    activeCount.value += 1
    try {
      return await operation()
    } finally {
      activeCount.value -= 1
      if (activeCount.value < 0) {
        activeCount.value = 0
        throw new Error('Auth pending-operation count became negative')
      }
    }
  }

  return { isPending, run }
}
```

Use one tracker per Nuxt app auth engine. Deduplicated refresh callers await the same refresh promise; count the underlying refresh operation once, not once per waiter.

### Auth status derivation

Keep underlying refs for token, user, pending work, initial settlement, and last error. Derive public status:

```ts
function deriveAuthStatus(input: {
  authEnabled: boolean
  settled: boolean
  token: string | null
  user: ConvexUser | null
  error: ConvexCallError | null
}): ConvexAuthStatus {
  if (!input.authEnabled) return 'disabled'
  if (!input.settled) return 'loading'
  if (input.token && input.user) return 'authenticated'
  if (input.error) return 'error'
  return 'anonymous'
}
```

During hydration, seed `settled`, token, and user from the SSR snapshot before components observe the composable.

A definitive 401/403 or token revocation clears token, user, and `error` in one synchronous publish, so this derivation returns `anonymous`. A failed initial resolution retains `error` and returns `error`. A failed background refresh over a usable identity retains token/user and therefore remains `authenticated` while exposing the last operation error.

Replace the existing single generation with the `authEpoch` and `identityGeneration` contract in §5.3; a pending counter is not a replacement for stale-result rejection. Stage candidates privately and publish only after Convex confirmation.

### Verify identity-partitioned query integration

Phase 1 already replaces auth-mode-only cache dimensions with mode plus stable identity. Keep the key helper centralized while connecting the new auth lifecycle:

```ts
function withAuthDimension(key: string, mode: ConvexAuthMode, identity: ConvexIdentityKey): string {
  if (mode === 'none') return `${key}:auth:none`
  return `${key}:auth:${mode}:${identity}`
}
```

The `:auth:none` payload/cache key is static. The runtime isolation tag for `none` snapshots additionally carries the stable anonymous-transport dimension defined in the internal specification §7.3; that dimension never varies with auth transitions and is not part of the payload key.

Requirements:

- same user, new token: key unchanged and no query reacquisition;
- different user: different key;
- sign-out: authenticated payload cleanup still runs;
- optional query sign-out: one anonymous execution;
- required query sign-out: subscription releases and query becomes idle;
- SSR payload key equals hydration payload key;
- shared-query and paginated-query caches use the same identity extractor.

### Auth execution-count matrix

Implement tests that spy on HTTP execution and WebSocket subscription acquisition.

| Context                         | `none`                  | `optional`                  | `required`                                     |
| ------------------------------- | ----------------------- | --------------------------- | ---------------------------------------------- |
| SSR                             | one anonymous           | one settled identity        | authenticated: one; anonymous: zero            |
| Hydration                       | payload reuse           | payload reuse               | payload reuse or idle                          |
| Client navigation while loading | one immediate anonymous | wait, then one              | wait, then authenticated one or anonymous zero |
| Sign-in                         | zero auth-driven reruns | one user rerun              | one idle-to-user execution                     |
| Sign-out                        | zero auth-driven reruns | one anonymous rerun         | zero new calls; release to idle                |
| Same-user token rotation        | zero                    | zero                        | zero                                           |
| User A to user B                | zero for `none`         | one per identity transition | one per authenticated identity                 |

### Tests

Add or update:

- `test/unit/auth-status.test.ts`
- `test/unit/auth-generation-races.test.ts`
- `test/unit/identity-key.test.ts`
- `test/unit/integrated-auth-namespace.test.ts`
- `test/unit/auth-client-definition.test.ts`
- `test/nuxt/useConvexAuth.nuxt.test.ts`
- `test/nuxt/client-engine.signout-lifecycle.nuxt.test.ts`
- `test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts`
- `test/nuxt/useConvexQuery.identity.nuxt.test.ts`
- `test/nuxt/useConvexPaginatedQuery.nuxt.test.ts`
- auth-enabled, auth-disabled, base-client, and plugin-typed consumer fixtures

Mandatory scenarios:

- SSR-authenticated hydration never exposes `loading`.
- Authenticated background refresh keeps authenticated subscriptions mounted.
- `ready()` does not chase a refresh that starts after the call.
- `ready()` returns current state after captured rejection, honors one deadline, treats `0` as no timeout, and does not independently await unrelated sign-in/sign-out work.
- Failed sign-in does not refresh.
- Successful email sign-in resolves only after the token is installed.
- Account creation without a session does not refresh or convert success into failure.
- Redirect initiation without a session marker does not refresh.
- A nested plugin auth method preserves its receiver and repeated function reads are referentially stable.
- Deferred refresh→sign-out, sign-out→refresh, concurrent sign-ins, direct A→B, revocation, transport failure, definitive 401, and token-without-user races obey §5.3.
- Two Nuxt apps in one process have isolated runtime instances; separate generated consumer programs infer their own plugin types.
- HMR reevaluation reuses the current Nuxt app's client and engine.
- Auth-disabled output contains no Better Auth engine setup and the composable still typechecks.
- A root type fixture proves `useConvexConfig()` returns `Readonly<ConvexRuntimeConfig>`; runtime fixtures prove auth-disabled config is exactly `false`.
- Built public runtime config contains no `auth.client` path or source string.
- User B cannot read any cache or payload key created for user A.

### Phase verification

```bash
pnpm run check:contracts
pnpm run test:types
pnpm vitest run --project=unit test/unit/auth-status.test.ts test/unit/auth-generation-races.test.ts test/unit/identity-key.test.ts test/unit/integrated-auth-namespace.test.ts test/unit/auth-client-definition.test.ts
pnpm vitest run --project=nuxt test/nuxt/useConvexAuth.nuxt.test.ts test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts test/nuxt/useConvexQuery.identity.nuxt.test.ts
pnpm run test:e2e
```

`test:e2e` is required when the documented playground `.env.local` deployment is configured. Without live deployment credentials, record that it was unavailable and run every unit, Nuxt, packed-consumer, contract, and type gate unconditionally; do not report the live e2e as passed.

## 9. Phase 4 — server caller and credential exchange

### Goal

Replace three standalone server-call functions with one caller that owns a lazy auth snapshot, and expose a safe low-level cookie/bearer exchange primitive.

### Final types

```ts
export type ConvexCredential = { type: 'cookie'; value: string } | { type: 'bearer'; value: string }

export interface ServerConvexOptions {
  auth?: ConvexAuthMode
  authToken?: string
  credential?: ConvexCredential
}

export interface ServerConvexCaller {
  getToken: () => Promise<string | null>
  query: <Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
  ) => Promise<FunctionReturnType<Query>>
  mutation: <Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ) => Promise<FunctionReturnType<Mutation>>
  action: <Action extends FunctionReference<'action'>>(
    action: Action,
    args: FunctionArgs<Action>,
  ) => Promise<FunctionReturnType<Action>>
}
```

Use the same exact-empty tightening for no-argument server calls, requiring `{}`.

Validation rules:

- `authToken` and `credential` are mutually exclusive.
- Providing either changes an omitted `auth` to `required`.
- Explicit `authToken` or `credential` may be combined only with omitted auth or `required`; reject both `optional` and `none` rather than silently downgrading a rejected explicit principal.
- An empty token or credential is a validation error.
- Cookie-based event resolution uses fixed `optional` by default.

### Never-throwing exchange primitive

```ts
export interface ConvexTokenExchangeResult {
  token: string | null
  status: number | undefined
  error: ConvexCallError | null
}

export async function exchangeConvexToken(input: {
  siteUrl: string
  credential: ConvexCredential
  timeoutMs?: number
}): Promise<ConvexTokenExchangeResult> {
  const headers =
    input.credential.type === 'cookie'
      ? { Cookie: input.credential.value }
      : { Authorization: `Bearer ${input.credential.value}` }

  try {
    const response = await fetchWithTimeout(
      `${normalizeSiteUrl(input.siteUrl)}/api/auth/convex/token`,
      {
        method: 'GET',
        headers,
        redirect: 'error',
        timeoutMs: input.timeoutMs ?? 5_000,
      },
    )
    if (!response.ok) {
      return {
        token: null,
        status: response.status,
        error: new ConvexCallError({
          kind: response.status === 401 || response.status === 403 ? 'authentication' : 'transport',
          message: `Convex token exchange failed with HTTP ${response.status}`,
          status: response.status,
        }),
      }
    }

    const body = await readBoundedJson(response, 1_048_576)
    const token = readToken(body)
    if (!token) {
      return {
        token: null,
        status: response.status,
        error: new ConvexCallError({
          kind: 'transport',
          message: 'Convex token exchange response did not include a token',
          status: response.status,
        }),
      }
    }
    return { token, status: response.status, error: null }
  } catch (error) {
    return {
      token: null,
      status: undefined,
      error: new ConvexCallError({
        kind: 'transport',
        message: 'Convex token exchange could not complete',
        cause: error,
      }),
    }
  }
}
```

`siteUrl` means the Convex site origin, such as `https://example.convex.site`, not a URL already ending in `/api/auth`. Implement `normalizeSiteUrl`, `readBoundedJson`, and `readToken` in the server-only source. Never log credential values or the request headers.

The exchange is `GET /api/auth/convex/token`, matching the installed `@convex-dev/better-auth` endpoint and the current internal exchange. Pin method and path in a fixture. `normalizeSiteUrl` rejects credentials, query strings, fragments, and non-root paths. It accepts `http:` only for hostname `localhost`, a `*.localhost` subdomain, IPv4 loopback in `127.0.0.0/8`, or `[::1]`; every other origin requires `https:`. There is no runtime "test fixture" exemption. Cancel or fully drain an oversized response before returning the bounded-response error.

`validateServerConvexOptions` and `exchangeConvexToken` reject credential values containing ASCII control characters, including CR and LF, before network access; that rejection is a synchronous validation error raised before any request. Credential-bearing exchange uses `redirect: 'error'` and never follows a redirect; a `redirect: 'error'` rejection surfaces through the generic exchange catch as `kind: 'transport'` — do not attempt to distinguish it by message text. The security property is that the credential is never sent to the redirect target, not the error label.

### Caller-owned token promise

Use the official HTTP client:

```ts
import { ConvexHttpClient } from 'convex/browser'
```

```ts
export function serverConvex(
  event: H3Event,
  options: ServerConvexOptions = {},
): ServerConvexCaller {
  const normalized = validateServerConvexOptions(options)
  let tokenPromise: Promise<string | null> | null = null
  let clientPromise: Promise<ConvexHttpClient> | null = null

  const getToken = () => {
    tokenPromise ??= resolveServerToken(event, normalized)
    return tokenPromise
  }

  const getClient = () => {
    clientPromise ??= (async () => {
      const client = new ConvexHttpClient(readRequiredConvexUrl(event), {
        fetch: createClassifiedConvexFetch(),
        logger: false,
      })
      const token = await getToken()
      if (token) client.setAuth(token)
      return client
    })()
    return clientPromise
  }

  const call = async <T>(operation: 'query' | 'mutation' | 'action', reference: any, args: any) => {
    const token = await getToken()
    if (normalized.auth === 'required' && !token) {
      throw new ConvexCallError({
        kind: 'authentication',
        message: 'Convex authentication is required for this server call',
        status: 401,
      })
    }
    const client = await getClient()
    try {
      return (await client[operation](reference, args)) as T
    } catch (error) {
      throw normalizeServerConvexBoundaryError(error, normalized)
    }
  }

  return {
    getToken,
    query: (reference, args) => call('query', reference, args),
    mutation: (reference, args) => call('mutation', reference, args),
    action: (reference, args) => call('action', reference, args),
  } as ServerConvexCaller
}
```

`logger: false` is mandatory: without it `ConvexHttpClient` re-emits upstream function `logLines` to the console by default, creating an unsanitized log channel outside the module logger's redaction policy. Use the official `ConvexHttpClient` generic overloads in the real implementation instead of the condensed `any` indexing shown above. One caller owns one lazy token promise and one lazy HTTP client; call `setAuth` at most once. The rejected token or client promise remains rejected for that caller. Retrying requires creating a new caller. Do not store either promise on the event or hash options.

`normalizeServerConvexBoundaryError` passes through existing `ConvexCallError` values, preserves mechanically recognized `ConvexError` values as `server`, constructs `transport` only from failures tagged at a known HTTP boundary, and constructs `authentication` only from missing/rejected credentials during the caller's required token-resolution path. Every other error thrown by `ConvexHttpClient` becomes an opaque safe error:

```ts
new ConvexCallError({
  kind: 'unknown',
  message: 'Convex server call failed',
  cause: error,
})
```

Never copy an unstructured client error's message, code, status, or data into the public error. `ConvexHttpClient` may place an arbitrary non-OK upstream body in `Error.message`. The raw object may exist only as the non-serialized cause and must never be logged. An application `ConvexError` with `data.code === 'UNAUTHORIZED'` remains `server`.

Implement `createClassifiedConvexFetch` so the official client does not erase transport context:

```ts
function createClassifiedConvexFetch(): typeof fetch {
  return async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (cause) {
      throw new ConvexCallError({
        kind: 'transport',
        message: 'Convex HTTP request could not complete',
        cause,
      })
    }
  }
}
```

Do not intercept non-OK responses in this wrapper. Convex uses a private HTTP status/protocol path to reconstruct function failures, and its status constant is not exported from the public `convex/browser` entry. Let `ConvexHttpClient` consume responses. A non-structured error it returns is `unknown`, not a guessed transport or authentication error. An explicit opaque `authToken` is treated as the caller's chosen snapshot; if Convex later rejects it without a public mechanical marker, preserve the resulting `server`/`unknown` classification.

For auth-enabled SSR responses, append `Vary: Cookie`. A request carrying a recognized Better Auth cookie, and any response that serializes a token, receives `Cache-Control: private, no-store`. Pin header merging so existing `Vary` values are preserved.

### Cookie resolution

For an event caller without explicit token or credential:

1. Read the Better Auth session cookie once.
2. Apply the existing cookie filter.
3. Return `null` immediately for `none`.
4. For optional mode, no cookie or an exchange 401/403 resolves to anonymous; transport, 5xx, oversized, and malformed-response failures throw `transport`.
5. For required mode, a missing cookie or exchange 401/403 throws `authentication`; communication failures throw `transport`.
6. Use the existing server auth cache before exchange.
7. Exchange the cookie through the new primitive.
8. Store a successful exchange in the existing cache with an effective TTL of `min(configured cache TTL, remaining JWT lifetime derived from the token's exp claim)`; a token without a readable `exp` is not cached beyond the configured TTL, and a cached token is never returned at or after its expiry.
9. Convert primitive error results into thrown `ConvexCallError` values for caller use.

An explicitly supplied bearer/cookie credential rejected with 401/403 always throws `authentication`. It never falls back to anonymous execution.

### Tests

Add:

- `test/unit/token-exchange.test.ts`
- `test/unit/server-convex-options.test.ts`
- `test/unit/server-convex-caller.test.ts`
- `test/e2e/server-utils-smoke.e2e.test.ts` updates
- a server subpath consumer typecheck fixture

Mandatory tests:

- cookie and bearer exchange;
- exchange method and path are exactly `GET /api/auth/convex/token`;
- 401 and 403 become authentication results;
- timeout, fetch failure, HTTP 500, oversized response, and malformed JSON become transport results;
- site URL validation rejects credentials, query, fragment, and non-root paths and drains/cancels oversized bodies;
- HTTP is accepted only for the exact loopback rules above; control-character credentials and redirects fail before credentials can reach another origin;
- secrets do not appear in captured logs at any level;
- a cached token is never served at or after its `exp`, even when the configured cache TTL is longer;
- sentinel upstream bodies from query, mutation, and action are absent from public messages, JSON, logs, and payloads;
- SSR auth responses merge `Vary: Cookie` and apply the required private/no-store policy;
- multi-call caller creates one token promise, one `ConvexHttpClient`, and calls `setAuth` at most once;
- failed caller does not retry its token promise;
- a new caller can retry;
- explicit token bypasses exchange;
- invalid option combinations fail before network access;
- required anonymous caller throws 401;
- optional anonymous caller executes without auth;
- optional cookie 401/403 executes anonymously, but optional transport/5xx/malformed exchange fails as transport;
- explicit credential rejection never downgrades to anonymous;
- explicit token/credential combined with `optional` or `none` fails before network access;
- old trio imports fail typecheck.

### Phase verification

```bash
pnpm vitest run --project=unit test/unit/token-exchange.test.ts test/unit/server-convex-options.test.ts test/unit/server-convex-caller.test.ts
pnpm run check:consumer-smoke
pnpm run test:e2e
pnpm run check:package-exports
```

As in Phase 3, the live `test:e2e` command is conditional on the documented deployment environment. All unit, type, package, and mocked Nuxt/server gates remain mandatory without credentials.

## 10. Phase 5 — Ginko CMS hard migration

### Goal

Make Ginko CMS consume only the final Better Convex Nuxt API, delete local workarounds now owned by the library, and retain only Ginko-specific Studio and MCP policy.

Work in `/Users/matthias/Git/workspace/ginko-cms` after Phases 1–4 pass Better Convex Nuxt release verification. Use a registry release or an explicitly packed local candidate; do not depend on an undeclared sibling path.

### 10.1 Dependency and compatibility cutover

Update in one commit-sized change:

- root `package.json`
- `packages/cms/package.json`
- `packages/convex/package.json`
- `playground/package.json`
- `packages/cms/compatibility.json`
- `vitest.config.ts`
- `scripts/package-e2e.mjs`
- `pnpm-lock.yaml`
- `MAINTAINING.md`
- `CHANGELOG.md`

Remove the previous Better Convex Nuxt version from the supported matrix. Do not retain parallel ranges for an unreleased integration path.

Add `@better-auth/api-key` to `packages/cms/package.json` runtime dependencies because the shipped Ginko auth-client definition imports it. Add a compatible `better-auth` peer dependency to that package as well; the API-key package requires Better Auth as a peer, and relying on Better Convex Nuxt's transitive installation would make published-consumer resolution package-manager-dependent.

Bump `@convex-dev/better-auth` from `^0.12.2` to exact `0.12.5` in `packages/cms/package.json`, `packages/convex/package.json`, and every release-stack, tracked, and consumer section of `packages/cms/compatibility.json`. Ginko currently resolves both 0.12.2 and 0.12.5 physically; registry verification must recursively assert exactly one 0.12.5 copy and the full pinned tuple from §5.8. Better Auth, `@better-auth/api-key`, Nuxt, and Convex are already at the pinned stack in Ginko's manifests. Raise Better Convex Nuxt's own development dependencies to the same stack before running the proofs.

Correct `packages/convex/test/better-auth-api-key-convex-token.test.ts` to import `getAuthConfigProvider` from the exported `@convex-dev/better-auth/auth-config` subpath, not the package root. Extend ordinary root Vitest inclusion to execute `packages/convex/test/**/*.test.ts`; do not hide this contract behind a release-only command.

### 10.2 Register Ginko's typed Better Auth client

Add a Ginko-owned auth-client definition containing the API-key client plugin.

Suggested file:

```ts
// packages/cms/src/runtime/convex-auth.ts
import { apiKeyClient } from '@better-auth/api-key/client'
import { defineConvexAuthClient } from 'better-convex-nuxt/auth-client'

export default defineConvexAuthClient({
  plugins: [apiKeyClient()],
})
```

Delete the current `auth: { enabled: true }` and `permissions: false` dependency defaults in `packages/cms/src/module.ts`; both are removed vocabulary.

The host application owns the single auth-client definition. Ginko supplies its definition only as a fallback when all of these are true:

1. the effective host `convex.auth` is not `false`;
2. the host did not configure `convex.auth.client`;
3. the host has no `<srcDir>/convex-auth.ts` convention file.

Compute that fallback before returning `moduleDependencies`; do not rely on `defu` to detect a convention file:

```ts
const hostConvex = nuxt.options.convex
const hostAuth = hostConvex && typeof hostConvex === 'object' ? hostConvex.auth : undefined
const authDisabled = hostConvex === false || hostAuth === false
const hasExplicitClient =
  hostAuth !== null &&
  typeof hostAuth === 'object' &&
  typeof hostAuth.client === 'string' &&
  hostAuth.client.length > 0
const hasHostConvention = existsSync(resolve(nuxt.options.srcDir, 'convex-auth.ts'))
const useGinkoClientFallback = !authDisabled && !hasExplicitClient && !hasHostConvention
```

Nuxt 4.4 applies module-dependency defaults after user config with `defu`; an explicit nested `auth: false` remains `false`.

When `hostConvex === false`, Ginko must return no `better-convex-nuxt` entry containing `defaults` or `overrides` at all. Nuxt merges dependency defaults with `defu(...overrides, nuxt.options.convex, ...defaults)`; a top-level `convex: false` is a primitive and is replaced by any defaults object, which then defeats the module's `=== false` disable check and installs the module against the host's explicit off switch. The required executable merge check must pin both cases: nested `auth: false` survives the merge, and top-level `convex: false` survives only when Ginko supplies no defaults.

The `routeProtection.redirectTo` default is independent of the client fallback: provide it whenever auth is not disabled, including when the host supplies its own auth-client definition. Only the `auth.client` default is gated on the three fallback conditions.

When those conditions hold, provide the resolved Ginko definition path and route protection through Better Convex Nuxt module-dependency defaults:

```ts
{
  'better-convex-nuxt': {
    defaults: {
      auth: {
        client: resolver.resolve('./runtime/convex-auth'),
        routeProtection: {
          redirectTo: `${studioRoute}/auth/signin`,
        },
      },
    },
  },
}
```

If Nuxt module dependencies cannot safely pass a resolved build-only path, generate a Ginko template and pass that template destination instead. Do not create another Better Auth client in `studio-host.vue`.

Explicit host configuration and the host convention always beat Ginko's fallback. Therefore the Studio must check that `auth.client` exposes the API-key plugin surface before rendering API-key management. If missing, fail with this actionable message:

> Ginko CMS requires `apiKeyClient()` from `@better-auth/api-key/client`. Add it to your `convex-auth.ts` client definition.

Better Convex Nuxt alone resolves and imports the definition. Ginko must not implement a second path/convention/layer loader for build or doctor. At browser runtime, verify the required method surface before use. Packed fixtures cover: no host definition uses Ginko's fallback; a host definition with `apiKeyClient()` works; a host definition without it reports the exact actionable error; and `auth: false` loads no definition. If the installed API-key package changes its stable ID, update the pinned dependency and proof fixture deliberately.

Ginko runtime code must not access `.apiKey` before narrowing the possibly host-defined base client. Implement one Ginko-owned `requireGinkoApiKeyClient(client: unknown)` capability guard that validates the exact methods Ginko calls and returns a narrow type derived from the installed API-key client typings. Do not cast the global client or duplicate the entire Better Auth client type.

When the host sets `auth: false`, Ginko injects no auth definition or route protection. The Studio follows its disabled-auth rendering path, and doctor reports that Studio sign-in and API-key management are unavailable rather than failing the package build.

### 10.3 Simplify Ginko auth components

Update:

- `packages/cms/src/auth/components/CmsAuthSignIn.vue`
- `packages/cms/src/auth/components/CmsAuthSignUp.vue`
- `packages/cms/src/public/composables/useCmsAuthState.ts`
- `packages/cms/src/runtime/pages/studio-host.vue`
- `packages/cms/src/public/types.ts`

Use `useConvexAuth()` unconditionally. Delete raw runtime-config checks for auth enabled and delete manual `refreshAuth()` calls. Replace `awaitAuthReady()` gates in `studio-host.vue` (bridge population and the sign-in redirect decision) with `auth.ready()`, and delete the sign-in/sign-up `watch`-based redirects that duplicate the post-submit redirect once sign-in resolves atomically.

Sign-in becomes:

```ts
const auth = useConvexAuth()

async function submitSignIn() {
  const result = await auth.signIn.email({
    email: email.value,
    password: password.value,
  })
  if (result.error) {
    error.value = result.error.message ?? t('ginkoCms.auth.signIn.errorFallback')
    return
  }
  await navigateTo(getRedirectTarget(), { replace: true })
}
```

The exact Better Auth result type controls the error access. Preserve the behavior while removing structural `unknown` parsing when the typed client already supplies the result.

Replace the hand-maintained `GinkoCmsHostAuthEngine` shape with a `Pick` from the exported `UseConvexAuthReturn` where a bridge-specific subset is still necessary.

### 10.4 Use normalized config

Replace component-side casts of `runtimeConfig.public.convex` with:

```ts
const convexConfig = useConvexConfig()
```

Use it for:

- auth status;
- auth route;
- Convex URL;
- site URL;
- normalized defaults.

Server code that moves entirely to `serverConvex` should not read Convex URL or auth config itself. Ginko-only Better Auth base URL overrides may remain in Ginko private runtime config because they are product deployment policy.

### 10.5 Replace browser API-key HTTP calls

In `studio-host.vue`, delete:

- `getAuthRoute`;
- `readAuthApiKeyPayload`;
- `postAuthApiKey`;
- manual API-key response parsing.

Use the single typed client exposed by `useConvexAuth()`:

```ts
const auth = useConvexAuth()

async function createMcpApiKey(input: GinkoCmsStudioMcpApiKeyCreateInput) {
  const client = requireGinkoApiKeyClient(auth.client)
  const result = await client.apiKey.create({
    name: input.name,
    expiresIn: input.expiresIn,
    metadata: input.metadata,
  })
  if (result.error) {
    throw new Error(result.error.message ?? 'Better Auth API-key creation failed')
  }
  if (!result.data?.id || !result.data.key) {
    throw new Error('Better Auth API-key creation returned an incomplete result')
  }
  return result.data
}
```

Use the plugin's actual generated type and method names. The compile-time fixture is authoritative when a property differs from this example.

### 10.6 Narrow the Studio bridge

Current behavior passes `nuxtApp` so the SPA can read `$convex`. Replace it with the exact client:

```ts
export interface GinkoCmsStudioHostBridge {
  convexClient?: ConvexClientHandle
  config: GinkoCmsPublicConfig
  api?: GinkoCmsStudioHostApi
  auth?: Pick<UseConvexAuthReturn, 'status' | 'isPending' | 'isAuthenticated' | 'user'> | null
  mcpApiKeys?: GinkoCmsStudioMcpApiKeys
  onSignOut: () => void | Promise<void>
}
```

Delete:

- `nuxtApp` from the bridge;
- unused `convexUrl`;
- `getAuthToken`, the raw token ref, and the Studio `getJwt()` method; no Studio consumer should receive the Convex JWT;
- `isAnonymous` when it is derivable from status.

The Studio host context reads `bridge.convexClient` directly. It retains the stable replacement-safe handle, never the current raw primary client.

### 10.7 Make the Studio API allowlist real

The current `buildStudioHostApi` verifies that groups exist and then returns the entire API object. That is not a runtime allowlist.

Create one canonical descriptor that lists every allowed group, function name, and operation kind. Constrain it so a misspelled operation kind fails locally:

```ts
type StudioOperationKind = 'query' | 'mutation'
type StudioApiSurface = Record<string, Record<string, StudioOperationKind>>

export const studioApiSurface = {
  assets: {
    getAsset: 'query',
    updateAsset: 'mutation',
    generateUploadUrl: 'mutation',
  },
  editor: {
    getEntry: 'query',
    saveEntryDraft: 'mutation',
    publishEntry: 'mutation',
  },
} as const satisfies StudioApiSurface
```

This is only a shape example. The real descriptor must include every currently allowed operation from `GinkoCmsStudioHostApi`; do not silently omit existing Studio behavior during the migration.

Derive the generic bridge type from the descriptor:

```ts
type RefForKind<Kind extends 'query' | 'mutation'> = FunctionReference<Kind>

type StudioApiFromSurface<Surface> = {
  ginkoCms: {
    [Group in keyof Surface]: {
      [Name in keyof Surface[Group]]: Surface[Group][Name] extends 'query'
        ? RefForKind<'query'>
        : RefForKind<'mutation'>
    }
  }
}
```

Construct a picked runtime object rather than returning the source API:

```ts
export function buildStudioHostApi(source: unknown): GinkoCmsStudioHostApi {
  const apiRoot = requireRecord(source, 'api')
  const cmsRoot = requireRecord(apiRoot.ginkoCms, 'api.ginkoCms')
  const picked: Record<string, Record<string, unknown>> = {}

  for (const [groupName, functions] of Object.entries(studioApiSurface)) {
    const sourceGroup = requireRecord(cmsRoot[groupName], `api.ginkoCms.${groupName}`)
    const pickedGroup: Record<string, unknown> = {}
    for (const functionName of Object.keys(functions)) {
      const reference = sourceGroup[functionName]
      if (!reference) {
        throw new TypeError(`Ginko Studio API is missing ${groupName}.${functionName}`)
      }
      pickedGroup[functionName] = reference
    }
    picked[groupName] = pickedGroup
  }

  return { ginkoCms: picked } as GinkoCmsStudioHostApi
}
```

Add a consumer-build type test against `#convex/api` that verifies every descriptor entry exists and has the declared operation kind. A backend function absent from the descriptor must not appear in the constructed bridge.

### 10.8 Use shared generic error normalization in Studio

In the standalone Studio, import:

```ts
import { normalizeConvexError } from 'better-convex-nuxt/errors'
import { getFunctionName } from 'convex/server'
```

Delete manual transport-envelope parsing and `Symbol.for('functionName')` access.

Keep Ginko's product mapping on top:

```ts
const normalized = normalizeConvexError(error)
const category = categoryFromGinkoCode(normalized.data)
```

The library determines transport/server/unknown shape. Ginko determines conflict, not-found, rate-limit, authorization, and workflow-specific meaning. Apply this boundary in `packages/cms/studio-app/src/composables/useCmsStudioQuery.ts`, `useCmsStudioPaginatedQuery.ts`, and the mutation/action/upload wrappers in `useStudioConvex.ts`. Delete embedded-JSON and message-substring classification.

### 10.9 Collapse MCP token exchange and use the server caller

Update both `packages/cms/src/server/middleware/mcp-auth.ts` and `packages/cms/src/server/mcp/_shared/request-auth.ts`:

```ts
export interface ExchangedMcpCredential {
  apiKeyId: string
  ownerUserId: string
  caller: Pick<ServerConvexCaller, 'query' | 'mutation' | 'action'>
}

export interface AuthenticateDeps {
  exchangeCredential: (credential: string) => Promise<ExchangedMcpCredential | null>
  resolveCredentialAccess: (
    apiKeyId: string,
    caller: ExchangedMcpCredential['caller'],
  ) => Promise<ResolvedMcpCredentialAccess | null>
  // existing failure-budget, storage, clock, and error dependencies remain
}
```

`null` means a definitive invalid credential and consumes the failure budget. A thrown `transport` failure means authentication infrastructure is unavailable and does not count as a bad-secret attempt. Do not collapse those outcomes into one `catch` branch.

1. Parse the bearer API key and apply Ginko's failure budget.
2. Replace the `verifyApiKey` plus `getConvexAuthToken` dependency pair with one `exchangeCredential` callback.
3. Call `exchangeConvexToken` once.
4. Use status 401/403 to record an invalid credential.
5. Use transport errors to return service unavailable without recording a bad-secret failure.
6. Decode the returned JWT claims once inside the exchange dependency to obtain API-key ID and user subject. A malformed JWT or missing/non-string `sessionId` or `sub` is infrastructure failure: return 503 and do not charge the failure budget.
7. Construct one `serverConvex(event, { authToken: result.token })`, narrow it to the allowed MCP operations, and return that caller—not the JWT—from `exchangeCredential`.
8. Resolve Ginko credential settings through the returned caller. Require resolved `apiKeyId` and `ownerUserId` to equal the decoded claims; null or mismatch records exactly one failure and returns 401.
9. Store validated claims and the narrow caller in request context. Never store the raw JWT.

Delete `packages/cms/src/server/mcp/_shared/convex-caller.ts` after every MCP tool uses the Ginko-owned narrow caller alias. Delete obsolete API-key verifier helpers in `_shared/better-auth-api-key.ts` after the single exchange owns validation; keep only the small bearer parser private to `request-auth.ts` if it is still needed. Update `_shared/agent-tools.ts` to use `/errors` and remove embedded-JSON/message guessing.

Replace Ginko's Better Auth base-path helper with a site-origin helper. An input ending in exactly `/api/auth` may normalize to its origin for the current deployment contract; reject every other non-root path before calling `exchangeConvexToken`.

Migrate `packages/cms/src/server/routes/public-api.ts` to `serverConvex(event, { auth: 'none' })`. Thread the existing H3 event through event-backed calls in `packages/cms/src/nuxt-provider.mjs` and use `serverConvex(event, { auth: 'none' })`; its current provider methods receive an event but discard it before constructing raw clients. Genuinely eventless prerender/build and CLI paths keep constructing direct anonymous `ConvexHttpClient` instances.

Keep in Ginko:

- request failure budgets;
- secret hashing and redaction;
- API-key claim interpretation;
- credential-settings lookup;
- capabilities;
- product authorization.

### Ginko tests

Update or add:

- module dependency wiring test for `auth.client`;
- host-definition precedence and API-key capability-check fixtures;
- auth-enabled and auth-disabled package consumer builds;
- sign-in and sign-up tests proving no manual refresh call;
- typed API-key client test;
- Studio bridge test proving no `nuxtApp`, `convexUrl`, or unlisted API functions cross the bridge;
- Studio error mapping tests using `ConvexCallError`;
- MCP tests proving exactly one `/convex/token` request for valid, invalid, and unavailable-service outcomes;
- MCP tests proving request context contains no JWT, malformed claims produce 503 without failure-budget charge, and claim/access mismatch produces one 401 charge;
- MCP fixtures updated for the single `exchangeCredential` dependency in `request-auth.ts`;
- MCP invalid-credential versus unavailable-service tests;
- event-backed `nuxt-provider.mjs` tests proving the supplied H3 event reaches one anonymous `serverConvex` caller, while eventless build/CLI fixtures retain direct clients;
- package boundary test banning deleted Better Convex Nuxt imports and old names;
- registry package e2e against the released Better Convex Nuxt version.

Phase 5's explicit search-and-update scope includes:

- `packages/cms/src/module.ts`;
- `packages/cms/src/runtime/pages/studio-host.vue`;
- every Studio bridge consumer;
- `packages/cms/studio-app/src/composables/useStudioConvex.ts`;
- `packages/cms/studio-app/src/composables/useCmsStudioQuery.ts`;
- `packages/cms/studio-app/src/composables/useCmsStudioPaginatedQuery.ts`;
- `packages/cms/src/server/middleware/mcp-auth.ts`;
- `packages/cms/src/server/mcp/_shared/request-auth.ts` and its tests;
- `packages/cms/src/server/mcp/_shared/agent-tools.ts`;
- `packages/cms/src/server/mcp/_shared/better-auth-api-key.ts`;
- `packages/cms/src/server/routes/public-api.ts`;
- `packages/cms/src/nuxt-provider.mjs` event-backed paths;
- `scripts/package-e2e.mjs`, whose generated consumer still imports `serverConvexQuery` and `serverConvexMutation` from `#convex/server`;
- `packages/convex/package.json`, `vitest.config.ts`, docs, package READMEs, and `scripts/check-docs-install-story.mjs` inputs;
- every mock of `createConvexAuthCaller`, `verifyApiKey`, or `getConvexAuthToken`, and `test/module/module-bridge.test.ts`, which mocks `ConvexHttpClient` for `nuxt-provider.mjs`.

### Ginko verification

```bash
pnpm run check
pnpm run package:e2e:registry
pnpm run audit:prod
```

Run live smoke tests only when the required deployment credentials are explicitly available. Never publish from the agent session.

## 11. Phase 6 — documentation, lint locks, release verification, and cleanup

### Goal

Make the new API the only documented and testable API, prevent removed concepts from returning, and prove clean-consumer behavior.

### Documentation rewrite

Update all guides and examples to teach these rules:

1. Queries always receive an explicit args object or `'skip'`.
2. The default auth mode is `optional`.
3. Private queries declare `auth: 'required'`.
4. Strictly public queries declare `auth: 'none'` when they must never vary by identity.
5. `signIn` and `signUp` synchronize Convex automatically.
6. `refresh()` is only for advanced raw-client or claim-change flows.
7. `useConvexAuth()` exists when auth is disabled and reports `disabled`.
8. `serverConvex` is the only server call API.
9. Better Auth client plugins are registered in `convex-auth.ts` through `defineConvexAuthClient`.
10. Permission rules remain application and Convex policy.
11. `useConvex()` returns a stable replacement-safe handle; transport auth and client lifecycle remain library-owned.

### Source locks

Add checks that fail on active-source or documentation references to:

- `auth: 'auto'`
- `defaults.auth`
- `refreshAuth`
- `awaitAuthReady`
- `serverConvexQuery`
- `serverConvexMutation`
- `serverConvexAction`
- `useConvexCall`
- `createPermissions`
- the removed `permissions` module option in either boolean state
- `better-convex-nuxt/composables`
- `getQueryKey`
- nullable query skip examples
- omitted query args examples
- `createBetterConvexAuthClient`
- `resolveBetterConvexAuthBaseURL`
- `BetterConvexAuthClientOptions`
- `BetterConvexAuthClientPluginList`
- `auth.enabled`
- `auth.cache.enabled`
- `auth.unauthorized.enabled`

Exclude historical changelog entries and this unreleased implementation decision record while the cutover is active. Before release, move this file to a clearly non-published architecture archive or delete it. Do not exclude active recipes, starters, fixtures, generated API docs, or source.

### Package checks

Verify:

- root type exports resolve;
- `/auth-client`, `/errors`, and `/server` resolve from a packed consumer;
- `/auth-client` and `/errors` are framework-free in built output;
- `/server` has no Vue client-runtime dependency or browser globals; the official isomorphic `ConvexHttpClient` import from `convex/browser` is explicitly allowed;
- the old subpaths and named exports fail resolution;
- `files: ["dist"]` includes every export target;
- `typesVersions` matches `exports`;
- generated API-surface docs match the package.

### Full Better Convex Nuxt gate

Run:

```bash
pnpm run format:check
pnpm run lint
pnpm run test:types
pnpm run check:contracts
pnpm run test
pnpm run prepack
```

Then inspect the packed tarball and run a clean external consumer install. Do not accept a workspace-only pass.

### Full coordinated Ginko gate

After Better Convex Nuxt is published or available as an intentionally packed release candidate:

```bash
cd /Users/matthias/Git/workspace/ginko-cms
pnpm run release:verify:registry
```

The consumer output must show the intended Better Convex Nuxt version and must complete Nuxt prepare, typecheck, Convex codegen, Ginko doctor, and package import smoke tests.

## 12. Implementation order and commit boundaries

Before commit 1, a senior implements the smallest disposable/permanent proof owner required by §5.8, passes all eleven gates, and records commands and evidence; the targeted `ConvexClientHandle` API review is complete and its outcome is the §5.4 contract. Only then assign implementation phases to a junior. Test files named in any phase-verification block that do not yet exist are deliverables of that phase; the phase is incomplete until each listed file exists and passes. Use these commit boundaries unless a failing test requires an even smaller change:

1. `refactor!: simplify auth installation, normalized config, status, and runtime topology`
2. `refactor!: unify query auth modes with anonymous transport and identity isolation`
3. `refactor!: require explicit query arguments and remove duplicate public surfaces`
4. `feat!: publish the ConvexCallError contract`
5. `feat!: register one typed Better Auth client per Nuxt app`
6. `feat!: make sign-in and sign-up synchronize Convex atomically`
7. `feat!: replace server call helpers with serverConvex and bounded token exchange`
8. `docs!: hard-cut documentation and lock removed vocabulary`
9. Ginko: `refactor!: consume Better Convex Nuxt vNext`
10. Ginko: `refactor!: narrow and enforce the Studio host bridge`
11. Ginko: `refactor!: use one MCP token exchange and server caller`

Do not mix unrelated starter product changes, dependency upgrades, visual redesign, or Convex schema changes into these commits.

## 13. Definition of done

The entire vNext program is complete only when every statement below is true.

### Better Convex Nuxt

- [ ] `auto` no longer exists in active API, source, fixtures, starters, or docs.
- [ ] Client and server use `required | optional | none` with identical meaning.
- [ ] Optional and required queries wait for initial auth settlement.
- [ ] Authenticated live `none` queries use anonymous transport and never observe a Convex identity.
- [ ] Same-user token rotation causes no query reacquisition.
- [ ] Every stable identity-key change retires the old primary client while the public handle and dedicated anonymous client remain stable.
- [ ] Cross-user payload reuse is structurally impossible, and no query, paginated, optimistic, mutation/action, upload, callback, bridge, or seeded-profile state crosses an identity generation.
- [ ] Stale auth, HTTP, subscription, callback, and locally optimistic work cannot mutate or overlay a newer identity generation.
- [ ] Query args are always explicit and `'skip'` is the sole skip sentinel.
- [ ] `useConvexAuth()` is available with auth enabled and disabled.
- [ ] `auth.enabled` is deleted; omitted/options-object auth installs authentication and `auth: false` is the only off switch.
- [ ] The auth cache uses a false-or-options input with no nested `enabled` boolean, and `auth.unauthorized`/unauthorized recovery no longer exist in options, runtime config, or source.
- [ ] Integrated sign-in/sign-up resolves only after Convex synchronization.
- [ ] The packed typed-client proof passes and one typed Better Auth client is created per Nuxt app; no fallback factory or second client API exists.
- [ ] Public runtime config contains no `auth.client` path.
- [ ] Public types import from the root.
- [ ] `/auth-client` and `/errors` have no framework dependencies.
- [ ] `ConvexCallError` is used by throwing and safe paths.
- [ ] SSR error hydration preserves `ConvexCallError` identity and public fields without serializing `cause`.
- [ ] Unstructured upstream response bodies cannot appear in public errors, logs, or payloads.
- [ ] `serverConvex` is the only public server caller.
- [ ] Cookie and bearer token exchanges are bounded and never log secrets.
- [ ] `useConvexCall` and permissions runtime are deleted.
- [ ] Upload responsibilities remain working and unchanged in purpose.
- [ ] Packed consumer verification passes.

### Ginko CMS

- [ ] No manual post-sign-in or post-sign-up Convex refresh remains.
- [ ] No raw browser API-key HTTP implementation remains.
- [ ] Ginko declares `@better-auth/api-key` and verifies the host API-key client capability with an actionable error.
- [ ] No `runtimeConfig.public.convex` structural casts remain in client components.
- [ ] The Studio bridge passes a replacement-safe Convex handle, not the Nuxt app or a raw client.
- [ ] Unused `convexUrl`, raw token/JWT access, redundant token getter, and duplicated auth booleans are deleted from the bridge.
- [ ] The Studio runtime API contains only explicitly listed functions.
- [ ] Generic error normalization comes from `/errors`; product classification remains Ginko-owned.
- [ ] MCP performs one credential-to-token exchange per authentication attempt.
- [ ] MCP request context stores no raw JWT; it stores validated claims and one narrow server caller.
- [ ] `request-auth.ts` exposes one credential-exchange dependency rather than separate verification and token callbacks.
- [ ] The custom MCP Convex transport wrapper is deleted.
- [ ] Failure budgets, redaction, claims, capability, and product authorization remain Ginko-owned.
- [ ] Registry package e2e and production audit pass.

## 14. Stop conditions

Stop the current subtask and document the evidence before proceeding when any of these occur:

1. Packed plugin inference cannot flow from the convention definition into consumer `useConvexAuth().client` typing.
2. A live authenticated application cannot provide genuinely anonymous `none` subscriptions without disturbing authenticated subscriptions.
3. A mounted A→B flow can expose any A-owned local, optimistic, call, upload, callback, bridge, seeded-profile, HTTP, WebSocket, or raw-client observation after `identityGeneration` changes.
4. Optional auth cannot avoid anonymous-first execution during hydration.
5. Same-user token refresh necessarily forces query reacquisition in Convex's client.
6. `ConvexCallError` cannot cross Nitro serialization without losing required public fields or exposing `cause`.
7. Bearer exchange behavior differs from cookie exchange in the installed `@convex-dev/better-auth` endpoint.
8. Exact-empty query args cannot reject options-shaped objects without breaking valid optional or union args.
9. Ginko cannot supply its auth-client fallback without overriding a host-owned definition or breaking an auth-disabled consumer.
10. The installed Convex Better Auth client plugin no longer exposes the pinned stable `convex` plugin ID.
11. A replacement-safe `useConvex()` handle cannot preserve active consumer subscriptions across primary-client retirement without exposing the raw client or importing Convex private modules. Reducing the handle below `query | mutation | action | onUpdate` invalidates Phase 5 §10.6 (Ginko's standalone Studio subscribes through `bridge.convexClient.onUpdate` with no composable alternative) and requires the funded Studio-migration decision in §5.8 proof 11, not a silent surface reduction.
12. An unstructured non-OK upstream response body cannot be prevented from reaching public errors, logs, or payloads.
13. Credential-bearing exchange follows a redirect or sends credentials outside the validated origin.
14. Concurrent token-bearing identity operations cannot be serialized and confirmed deterministically.

For a stop condition, capture:

- the smallest failing fixture;
- the exact command and error;
- the violated acceptance criterion;
- the simplest alternative;
- which agreed API decision would change.

Do not add a compatibility layer or second public API to work around a failed experiment.

## 15. Maintainer review checklist

Before merging the final release candidate, a maintainer must answer yes to each question:

1. Does every common task have one obvious API?
2. Are the advanced subpaths separated by environment rather than convenience preference?
3. Can an anonymous public page render once without auth flicker?
4. Can a private page sign in and navigate immediately without manual synchronization?
5. Can a signed-in `none` query ever reach Convex with the user's identity?
6. Can user B ever observe user A's cache, local settled data, error, page, or stale update?
7. Can auth-disabled downstream modules compile without conditional imports?
8. Can a server handler make several calls under one explicit token snapshot?
9. Can a bearer credential be exchanged without exposing it to logs?
10. Can an application inspect product `ConvexError.data` without library reinterpretation?
11. Does the Ginko Studio receive only its explicit function allowlist?
12. Did the cutover delete more concepts than it added?
13. Did packed, registry-style consumer verification pass?

If any answer is no, the release is not feature-complete.
