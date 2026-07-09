# Better Convex Nuxt vNext

## Hard-cutover implementation specification for Better Auth, Convex, Nuxt, and Ginko CMS

Status: approved design and implementation plan, ready for execution

Target: the next unreleased Better Convex Nuxt release and the matching Ginko CMS migration

Compatibility policy: hard cutover; do not retain aliases, shims, deprecated overloads, or dual APIs for the removed surfaces

This document is the implementation authority for the vNext cutover. It is intentionally detailed enough for an engineer who is new to the repositories to work phase by phase without inventing missing behavior.

## 1. Outcome

After this cutover, Better Convex Nuxt has one normal application path and a small set of environment-specific advanced paths.

The normal application path is Nuxt auto-imports:

```ts
const auth = useConvexAuth()
const profile = useConvexQuery(api.users.profile, {}, { auth: 'required' })
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
  ConvexAuthMode,
  ConvexAuthStatus,
  ConvexCallErrorKind,
  ConvexRuntimeConfig,
  ModuleOptions,
  ServerConvexOptions,
  UseConvexAuthReturn,
  UseConvexMutationOptions,
  UseConvexPaginatedQueryOptions,
  UseConvexQueryOptions,
} from 'better-convex-nuxt'
```

Do not export the raw `ConvexPublicRuntimeConfig`. Consumers read the normalized config returned by `useConvexConfig()`.

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

Delete:

- `useConvexCall`
- `createPermissions`
- the `permissions` module option
- `createBetterConvexAuthClient`

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
  routeProtection?: Partial<ConvexRouteProtectionConfig>
  unauthorized?: Partial<ConvexUnauthorizedConfig>
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
      routeProtection: ConvexRouteProtectionConfig
      unauthorized: ConvexUnauthorizedConfig
    }
```

Internal code derives `const authEnabled = config.auth !== false`. It may pass that derived boolean to low-level helpers, but `enabled` is not a module option and is not another source of truth.

When `auth: false`:

- `useConvexAuth()` remains auto-imported and returns the stable `disabled` state;
- `optional` queries execute anonymously without waiting;
- `required` queries remain idle;
- `none` queries execute anonymously immediately;
- no auth proxy route, Better Auth client, auth middleware, or auth engine is added to the build;
- auth-only options such as an auth-client definition are rejected with a clear build-time configuration error rather than silently ignored.

This explicit off switch is necessary for genuinely public Convex applications. The false-or-options shape makes contradictory states such as `{ enabled: false, routeProtection: ... }` impossible.

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

For a truly empty Convex argument object, tighten the public argument type to an exact empty type such as `Record<string, never>`. The compile-fail tests are authoritative if a different TypeScript formulation is needed.

### 5.6 Error contract

```ts
export type ConvexCallErrorKind =
  | 'authentication'
  | 'validation'
  | 'transport'
  | 'server'
  | 'unknown'
```

Detection table:

| Kind             | Only valid sources                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `authentication` | Required identity missing, token exchange 401/403, explicit auth-engine classification                            |
| `validation`     | Exact structured or exact-name Convex argument-validation signal; otherwise use `server`                          |
| `transport`      | Fetch/XHR failure, timeout, abort, unusable response, unexpected upstream HTTP response, WebSocket transport loss |
| `server`         | Convex application/function error with `data` preserved verbatim                                                  |
| `unknown`        | Anything not mechanically classifiable above                                                                      |

The pure normalizer never guesses `authentication`. A product `ConvexError` with `data.code === 'UNAUTHORIZED'` remains `server`.

## 6. Phase 1 — foundation vocabulary and surface pruning

### Goal

Land the breaking vocabulary and remove duplicate APIs before building new behavior on top of them.

### Files to change

- `src/module.ts`
- `src/module-api-surface.ts`
- `src/runtime/utils/config-defaults.ts`
- `src/runtime/utils/auth-config.ts`
- `src/runtime/utils/query-execution-gate.ts`
- `src/runtime/utils/identity-key.ts`
- `src/runtime/utils/args-tuple.ts`
- `src/runtime/composables/useConvexQuery.ts`
- `src/runtime/composables/useConvexPaginatedQuery.ts`
- `src/runtime/composables/defineSharedConvexQuery.ts`
- `src/runtime/composables/useConvexStorageUrl.ts`
- `src/runtime/composables/index.ts`
- `package.json`
- docs, playground, starters, and consumer fixtures containing removed vocabulary

Delete:

- `src/runtime/composables/useConvexCall.ts`
- `src/runtime/composables/usePermissions.ts`
- tests dedicated only to those deleted APIs

### Implementation checklist

- [ ] Introduce the shared `ConvexAuthMode` type with exactly three literals.
- [ ] Replace the nested `auth.enabled` input with `auth?: false | ConvexAuthOptions`; omitted or object-valued auth installs authentication.
- [ ] Normalize auth to the `false | NormalizedConvexAuthOptions` runtime union and derive any internal `authEnabled` boolean from that value.
- [ ] Reject auth-only build options when `auth: false` instead of silently ignoring them.
- [ ] Add `ConvexIdentityKey` and the single stable-user-ID extraction function; cache integration lands in Phase 3.
- [ ] Replace client `auto` behavior with `required`.
- [ ] Replace server `auto` behavior with `optional`; the server trio remains temporarily internal until Phase 4 but no public docs should use it.
- [ ] Set the fixed query default to `optional`.
- [ ] Delete `QueryDefaults.auth` and `CONVEX_MODULE_DEFAULTS.defaults.auth`.
- [ ] Update the execution gate so `required` and `optional` wait for initial auth settlement, while `none` does not.
- [ ] Make `'skip'` the only skip sentinel.
- [ ] Make the args position required for all query and paginated-query calls.
- [ ] Tighten no-argument functions to an exact empty object.
- [ ] Delete `useConvexCall` and replace internal examples with `useConvex()` or the appropriate stateful composable.
- [ ] Delete `createPermissions`, its module option, auto-import registration, docs API entry, and playground usage.
- [ ] Move the permissions example to a standalone recipe document that imports no permission runtime from the package.
- [ ] Add lint checks banning removed vocabulary in `src`, docs, playground, starters, and consumer fixtures.

### Required execution-gate behavior

Extend the gate input so it knows whether identity has settled and whether a stable identity key exists.

```ts
export interface QueryExecutionGateInput {
  authEnabled: boolean
  authMode: ConvexAuthMode
  authPending: boolean
  authSettled: boolean
  identityKey: ConvexIdentityKey | null
  skipped: boolean
  subscribe: boolean
}
```

Decision order:

1. Explicit `'skip'` resolves idle.
2. `none` executes without waiting and uses `anonymous` cache dimension.
3. With auth disabled, `required` resolves idle and `optional` executes anonymously without waiting.
4. An auth-enabled `required` or `optional` query waits while identity is unsettled.
5. Settled `required` without an identity resolves idle.
6. Settled `optional` without an identity executes anonymously.
7. Settled `required` or `optional` with an identity executes with `user:<id>`.

### Tests

Create or update:

- `test/unit/query-execution-gate.test.ts`
- `test/unit/auth-config.test.ts`
- `test/unit/query-options-types.test.ts`
- `test/fixtures/consumer-smoke/composables/usePublicApiSurfaceContracts.ts`
- `test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts`
- `test/nuxt/useConvexPaginatedQuery.nuxt.test.ts`
- a source check banning `auto`, nullable skip, `useConvexCall`, and `createPermissions`

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
```

Auth-configuration assertions must include:

- omitted auth and `auth: {}` normalize to the same enabled configuration;
- `auth: false` installs no auth runtime and cannot be combined with `authClient`;
- `{ auth: { enabled: false } }` fails the module-options typecheck;
- disabled-auth `optional` queries execute anonymously without a loading state;
- disabled-auth `required` queries remain idle.

### Phase verification

Run:

```bash
pnpm run lint
pnpm run test:types
pnpm run check:consumer-smoke
pnpm vitest run --project=unit test/unit/auth-config.test.ts test/unit/query-execution-gate.test.ts test/unit/query-options-types.test.ts
pnpm vitest run --project=nuxt test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts test/nuxt/useConvexPaginatedQuery.nuxt.test.ts
```

Phase 1 is complete only when removed spellings fail source checks and removed imports fail the consumer typecheck.

## 7. Phase 2 — public error contract

### Goal

Make every throwing and safe call expose one honest error type, and make generic normalization usable outside Nuxt.

### New files

- `src/runtime/errors/index.ts` or a top-level source entry that builds without runtime-framework imports
- `test/unit/convex-call-error.test.ts`
- `test/unit/errors-subpath-purity.test.ts`
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

Update `typesVersions`, `scripts/check-package-exports.mjs`, the consumer smoke fixture, and the generated API-surface documentation.

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
      cause: this.cause instanceof Error ? this.cause.message : undefined,
    }
  }
}
```

If the TypeScript target rejects assigning `cause` after `super`, use one declaration strategy that preserves the same public fields. Do not change the contract to satisfy an implementation detail.

### Required normalizer behavior

```ts
export function normalizeConvexError(error: unknown): ConvexCallError {
  if (error instanceof ConvexCallError) return error
  if (isExactArgumentValidationError(error)) {
    return new ConvexCallError({
      kind: 'validation',
      message: readErrorMessage(error),
      data: readStructuredData(error),
      cause: error,
    })
  }
  if (isTransportFailure(error)) {
    return new ConvexCallError({
      kind: 'transport',
      message: readErrorMessage(error),
      status: readStatus(error),
      cause: error,
    })
  }
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

### Integrate the contract

- [ ] Replace the old serializable `ConvexCallError` interface with the class.
- [ ] Make `CallResult<T>` use the class.
- [ ] Make mutation/action `.safe()` use the same normalization function as the throwing path.
- [ ] Normalize errors at query, paginated query, upload, auth, and server boundaries.
- [ ] Keep product `data` unchanged.
- [ ] Ensure logs redact or omit raw causes; do not stringify credential-bearing objects.

### Golden fixtures

Cover exactly:

- auth-context-created authentication error;
- exact Convex argument-validation error;
- fetch rejection;
- timeout or abort;
- unexpected upstream HTTP response;
- Convex application error containing structured data;
- plain `Error`;
- string and object unknown errors;
- an existing `ConvexCallError` passed through unchanged.

For equivalent raw failures, throwing and safe calls must produce equal `toJSON()` results and both values must be `instanceof ConvexCallError`.

### Purity guard

Inspect both source and built output. Fail when the errors entry imports:

- `vue`
- `nuxt`
- `@nuxt/*`
- `#imports`
- `#app`
- `nitropack/runtime`
- browser-only or Node-only built-ins

### Phase verification

```bash
pnpm vitest run --project=unit test/unit/convex-call-error.test.ts test/unit/errors-subpath-purity.test.ts
pnpm run check:package-exports
pnpm run check:consumer-smoke
pnpm run test:types
```

## 8. Phase 3 — authentication lifecycle, typed client, and identity isolation

### Goal

Create one Better Auth client per Nuxt app, make `useConvexAuth()` stable in enabled and disabled builds, make sign-in/sign-up atomic with Convex synchronization, and partition query state by stable user ID.

### New source boundaries

- `src/runtime/auth-client/index.ts`: framework-free definition helper and types
- `src/runtime/composables/useConvexConfig.ts`: normalized read-only config accessor
- `src/runtime/utils/auth-status.ts`: pure status derivation and transition helpers
- `src/runtime/utils/identity-key.ts`: extend the Phase 1 extractor into every cache and subscription path
- a generated `#build/convex-auth-client` template created by `src/module.ts`
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

Add a build-only top-level module option:

```ts
export interface ModuleOptions {
  auth?: ConvexAuthConfigInput
  authClient?: string
}
```

`authClient` is a source alias or path to a default-exported definition. It must be removed before constructing `runtimeConfig.public.convex`.

Default resolution order:

1. `options.authClient` when provided.
2. `<srcDir>/convex-auth.ts` when that file exists.
3. A built-in empty definition containing no additional plugins.

Do not inspect multiple convention filenames. One default filename is enough.

### Framework-free definition helper

The public helper captures type information and does not instantiate a client.

```ts
import type { BetterAuthClientOptions } from 'better-auth/client'

type AuthClientPlugins = readonly unknown[]

export type ConvexAuthClientDefinitionOptions<Plugins extends AuthClientPlugins> = Omit<
  BetterAuthClientOptions,
  'baseURL' | 'plugins' | 'fetchOptions'
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

The final type may need the existing Better Auth plugin generic constraints. Preserve these rules regardless of the exact generic syntax:

- the consumer cannot set `baseURL`;
- the consumer cannot set `fetchOptions.credentials`;
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

nuxt.options.alias['#build/convex-auth-client'] = authClientTemplate.dst
```

Use Nuxt kit utilities appropriate to the installed Nuxt version when a direct alias assignment is insufficient. The generated file must be imported only from `plugin.client.ts`.

### Generated type registry

Define an augmentable registry in the public type surface:

```ts
export interface ConvexAuthClientRegistry {}
```

Generate a declaration referencing the resolved definition:

```ts
import type definition from '#build/convex-auth-client'

declare module 'better-convex-nuxt' {
  interface ConvexAuthClientRegistry {
    definition: typeof definition
  }
}
```

Implement `InferRegisteredConvexAuthClient` so `useConvexAuth().client` exposes plugin methods when a definition exists and falls back to the base Better Auth client type otherwise.

If consumer-side inference cannot be made reliable after a focused implementation attempt, stop this subtask and retain the existing separate advanced client factory. Do not ship a partially typed single-client design. Record the failed type fixture and the reason before choosing the fallback.

### Client instantiation

In `plugin.client.ts`:

1. Import the definition from `#build/convex-auth-client`.
2. Validate that additional plugins do not already include the Convex plugin ID.
3. Create one Better Auth client for that Nuxt app.
4. Set the module-owned `baseURL`.
5. Prepend `convexClient()` once.
6. Set `fetchOptions.credentials` to `include`.
7. Provide the instance on `nuxtApp`.
8. Pass the same instance to the auth engine.

Do not create or mutate module-level registration state. A second Nuxt app in the same process must receive a separate instance.

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
  refresh: () => Promise<void>,
): T {
  const proxyCache = new WeakMap<object, object>()

  const wrapObject = <Value extends object>(target: Value): Value => {
    const cached = proxyCache.get(target)
    if (cached) return cached as Value

    const proxy = new Proxy(target, {
      get(currentTarget, property, receiver) {
        const value = Reflect.get(currentTarget, property, receiver)
        if (typeof value === 'function') {
          return async (...args: unknown[]) => {
            const result = await Reflect.apply(value, currentTarget, args)
            const error = readBetterAuthResultError(result)
            if (!error && shouldSynchronizeAfterAuthResult(result)) {
              await refresh()
            }
            return result
          }
        }
        if (value && typeof value === 'object') return wrapObject(value)
        return value
      },
    })
    proxyCache.set(target, proxy)
    return proxy
  }

  return wrapObject(namespace)
}
```

The wrapper above applies a method with its containing object as `this` and caches nested proxies so property reads remain stable. Add a test plugin whose method fails when its receiver is lost.

`shouldSynchronizeAfterAuthResult` rules:

- no sync after a thrown operation;
- no sync when the returned object has a truthy `error`;
- sync after successful non-redirect session-creating operations;
- social/redirect operations rely on the return navigation and SSR cookie exchange when the browser leaves the page;
- an extra refresh is preferable to resolving before a newly created session is synchronized;
- `refresh()` uses the existing per-Nuxt-app deduplication promise.

Do not expose a `runAuthOperation` wrapper.

Implement `shouldSynchronizeAfterAuthResult` against documented Better Auth result fields. A result that only initiates an external redirect does not prove that a session exists and must not trigger refresh. Add fixtures for email success, email failure, social redirect, and `disableRedirect` OAuth initiation before finalizing this predicate.

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

### Identity-partitioned query state

Replace auth-mode-only cache dimensions with mode plus stable identity:

```ts
function withAuthDimension(key: string, mode: ConvexAuthMode, identity: ConvexIdentityKey): string {
  if (mode === 'none') return `${key}:auth:none`
  return `${key}:auth:${mode}:${identity}`
}
```

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
- Failed sign-in does not refresh.
- Successful email sign-in resolves only after the token is installed.
- A nested plugin auth method preserves its receiver.
- Two Nuxt apps in one process have isolated client plugin types and instances.
- Auth-disabled output contains no Better Auth engine setup and the composable still typechecks.
- Built public runtime config contains no auth-client path.
- User B cannot read any cache or payload key created for user A.

### Phase verification

```bash
pnpm run check:contracts
pnpm run test:types
pnpm vitest run --project=unit test/unit/auth-status.test.ts test/unit/identity-key.test.ts test/unit/integrated-auth-namespace.test.ts test/unit/auth-client-definition.test.ts
pnpm vitest run --project=nuxt test/nuxt/useConvexAuth.nuxt.test.ts test/nuxt/useConvexQuery.auth-gate.nuxt.test.ts test/nuxt/useConvexQuery.identity.nuxt.test.ts
pnpm run test:e2e
```

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
- `none` cannot be combined with `authToken` or `credential`.
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
        headers,
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

### Caller-owned token promise

```ts
export function serverConvex(
  event: H3Event,
  options: ServerConvexOptions = {},
): ServerConvexCaller {
  const normalized = validateServerConvexOptions(options)
  let tokenPromise: Promise<string | null> | null = null

  const getToken = () => {
    tokenPromise ??= resolveServerToken(event, normalized)
    return tokenPromise
  }

  const call = async <T>(
    operation: 'query' | 'mutation' | 'action',
    reference: FunctionReference<'query' | 'mutation' | 'action'>,
    args: Record<string, unknown>,
  ): Promise<T> => {
    const token = await getToken()
    if (normalized.auth === 'required' && !token) {
      throw new ConvexCallError({
        kind: 'authentication',
        message: 'Convex authentication is required for this server call',
        status: 401,
      })
    }
    return executeServerConvexOperation<T>({ event, operation, reference, args, token })
  }

  return {
    getToken,
    query: (reference, args) => call('query', reference, args),
    mutation: (reference, args) => call('mutation', reference, args),
    action: (reference, args) => call('action', reference, args),
  } as ServerConvexCaller
}
```

The rejected token promise remains rejected for that caller. Retrying requires creating a new caller. Do not store the promise on the event or hash options.

### Cookie resolution

For an event caller without explicit token or credential:

1. Read the Better Auth session cookie once.
2. Apply the existing cookie filter.
3. Return `null` immediately for `none`.
4. Return `null` for optional anonymous requests.
5. Throw an authentication error for required anonymous requests.
6. Use the existing server auth cache before exchange.
7. Exchange the cookie through the new primitive.
8. Store a successful exchange in the existing cache.
9. Convert primitive error results into thrown `ConvexCallError` values for caller use.

### Tests

Add:

- `test/unit/token-exchange.test.ts`
- `test/unit/server-convex-options.test.ts`
- `test/unit/server-convex-caller.test.ts`
- `test/e2e/server-utils-smoke.e2e.test.ts` updates
- a server subpath consumer typecheck fixture

Mandatory tests:

- cookie and bearer exchange;
- 401 and 403 become authentication results;
- timeout, fetch failure, HTTP 500, oversized response, and malformed JSON become transport results;
- secrets do not appear in captured logs at any level;
- multi-call caller exchanges exactly once;
- failed caller does not retry its token promise;
- a new caller can retry;
- explicit token bypasses exchange;
- invalid option combinations fail before network access;
- required anonymous caller throws 401;
- optional anonymous caller executes without auth;
- old trio imports fail typecheck.

### Phase verification

```bash
pnpm vitest run --project=unit test/unit/token-exchange.test.ts test/unit/server-convex-options.test.ts test/unit/server-convex-caller.test.ts
pnpm run check:consumer-smoke
pnpm run test:e2e
pnpm run check:package-exports
```

## 10. Phase 5 — Ginko CMS hard migration

### Goal

Make Ginko CMS consume only the final Better Convex Nuxt API, delete local workarounds now owned by the library, and retain only Ginko-specific Studio and MCP policy.

Work in `/Users/matthias/Git/workspace/ginko-cms` after Phases 1–4 pass Better Convex Nuxt release verification. Use a registry release or an explicitly packed local candidate; do not depend on an undeclared sibling path.

### 10.1 Dependency and compatibility cutover

Update in one commit-sized change:

- root `package.json`
- `packages/cms/package.json`
- `playground/package.json`
- `packages/cms/compatibility.json`
- `pnpm-lock.yaml`
- `MAINTAINING.md`
- `CHANGELOG.md`

Remove the previous Better Convex Nuxt version from the supported matrix. Do not retain parallel ranges for an unreleased integration path.

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

During Ginko module setup, provide the resolved built/runtime path through the Better Convex Nuxt module dependency defaults:

```ts
{
  'better-convex-nuxt': {
    defaults: {
      authClient: resolver.resolve('./runtime/convex-auth'),
      auth: {
        routeProtection: {
          redirectTo: `${studioRoute}/auth/signin`,
        },
      },
    },
  },
}
```

If Nuxt module dependencies cannot safely pass a resolved build-only path, generate a Ginko template and pass that template destination instead. Do not create another Better Auth client in `studio-host.vue`.

### 10.3 Simplify Ginko auth components

Update:

- `packages/cms/src/auth/components/CmsAuthSignIn.vue`
- `packages/cms/src/auth/components/CmsAuthSignUp.vue`
- `packages/cms/src/public/composables/useCmsAuthState.ts`
- `packages/cms/src/runtime/pages/studio-host.vue`
- `packages/cms/src/public/types.ts`

Use `useConvexAuth()` unconditionally. Delete raw runtime-config checks for auth enabled and delete manual `refreshAuth()` calls.

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
  if (!auth.client) {
    throw new Error('Better Auth client is unavailable in the browser')
  }
  const result = await auth.client.apiKey.create({
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
  convexClient?: ConvexClient
  config: GinkoCmsPublicConfig
  api?: GinkoCmsStudioHostApi
  auth?: Pick<
    UseConvexAuthReturn,
    'status' | 'isPending' | 'isAuthenticated' | 'token' | 'user'
  > | null
  mcpApiKeys?: GinkoCmsStudioMcpApiKeys
  onSignOut: () => void | Promise<void>
}
```

Delete:

- `nuxtApp` from the bridge;
- unused `convexUrl`;
- redundant `getAuthToken` when the live token ref already crosses the same-context bridge;
- `isAnonymous` when it is derivable from status.

The Studio host context reads `bridge.convexClient` directly.

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

The library determines transport/validation/server shape. Ginko determines conflict, not-found, rate-limit, authorization, and workflow-specific meaning.

### 10.9 Collapse MCP token exchange and use the server caller

In `packages/cms/src/server/middleware/mcp-auth.ts`:

1. Parse the bearer API key and apply Ginko's failure budget.
2. Call `exchangeConvexToken` once.
3. Use status 401/403 to record an invalid credential.
4. Use transport errors to return service unavailable without recording a bad-secret failure.
5. Decode the returned JWT claims in Ginko to obtain API-key ID and user subject.
6. Construct `serverConvex(event, { authToken: result.token })`.
7. Resolve Ginko credential settings through the caller.
8. Store the verified token and caller identity in request context.

Delete `packages/cms/src/server/mcp/_shared/convex-caller.ts` after every MCP tool uses `ServerConvexCaller` or a Ginko-owned narrow alias of it.

Keep in Ginko:

- request failure budgets;
- secret hashing and redaction;
- API-key claim interpretation;
- credential-settings lookup;
- capabilities;
- product authorization.

### Ginko tests

Update or add:

- module dependency wiring test for `authClient`;
- auth-enabled and auth-disabled package consumer builds;
- sign-in and sign-up tests proving no manual refresh call;
- typed API-key client test;
- Studio bridge test proving no `nuxtApp`, `convexUrl`, or unlisted API functions cross the bridge;
- Studio error mapping tests using `ConvexCallError`;
- MCP test proving exactly one token exchange;
- MCP invalid-credential versus unavailable-service tests;
- package boundary test banning deleted Better Convex Nuxt imports and old names;
- registry package e2e against the released Better Convex Nuxt version.

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
- `permissions: true`
- `better-convex-nuxt/composables`
- nullable query skip examples
- omitted query args examples
- `createBetterConvexAuthClient`
- `auth.enabled`

Exclude historical changelog entries only when the check targets documentation prose and the historical record is clearly labeled. Do not exclude active recipes, starters, fixtures, or source.

### Package checks

Verify:

- root type exports resolve;
- `/auth-client`, `/errors`, and `/server` resolve from a packed consumer;
- `/auth-client` and `/errors` are framework-free in built output;
- `/server` has no browser or Vue dependency;
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

Use these commit boundaries unless a failing test requires an even smaller change:

1. `refactor!: unify auth modes and query skip grammar`
2. `refactor!: remove duplicate call and permission surfaces`
3. `feat!: publish the ConvexCallError contract`
4. `feat!: add normalized config and stable auth state`
5. `feat!: register one typed Better Auth client per Nuxt app`
6. `feat!: make sign-in and sign-up synchronize Convex atomically`
7. `fix!: partition query state by stable Better Auth user id`
8. `feat!: replace server call helpers with serverConvex`
9. `feat!: add cookie and bearer token exchange`
10. `docs!: hard-cut documentation and lock removed vocabulary`
11. Ginko: `refactor!: consume Better Convex Nuxt vNext`
12. Ginko: `refactor!: narrow and enforce the Studio host bridge`
13. Ginko: `refactor!: use one MCP token exchange and server caller`

Do not mix unrelated starter product changes, dependency upgrades, visual redesign, or Convex schema changes into these commits.

## 13. Definition of done

The entire vNext program is complete only when every statement below is true.

### Better Convex Nuxt

- [ ] `auto` no longer exists in active API, source, fixtures, starters, or docs.
- [ ] Client and server use `required | optional | none` with identical meaning.
- [ ] Optional and required queries wait for initial auth settlement.
- [ ] Same-user token rotation causes no query reacquisition.
- [ ] Cross-user payload reuse is structurally impossible by key.
- [ ] Query args are always explicit and `'skip'` is the sole skip sentinel.
- [ ] `useConvexAuth()` is available with auth enabled and disabled.
- [ ] `auth.enabled` is deleted; omitted/options-object auth installs authentication and `auth: false` is the only off switch.
- [ ] Integrated sign-in/sign-up resolves only after Convex synchronization.
- [ ] One typed Better Auth client is created per Nuxt app, or the documented fallback decision is recorded because consumer inference proved impossible.
- [ ] Public runtime config contains no auth-client path.
- [ ] Public types import from the root.
- [ ] `/auth-client` and `/errors` have no framework dependencies.
- [ ] `ConvexCallError` is used by throwing and safe paths.
- [ ] `serverConvex` is the only public server caller.
- [ ] Cookie and bearer token exchanges are bounded and never log secrets.
- [ ] `useConvexCall` and permissions runtime are deleted.
- [ ] Upload responsibilities remain working and unchanged in purpose.
- [ ] Packed consumer verification passes.

### Ginko CMS

- [ ] No manual post-sign-in or post-sign-up Convex refresh remains.
- [ ] No raw browser API-key HTTP implementation remains.
- [ ] No `runtimeConfig.public.convex` structural casts remain in client components.
- [ ] The Studio bridge passes a Convex client, not the Nuxt app.
- [ ] Unused `convexUrl`, redundant token getter, and duplicated auth booleans are deleted from the bridge.
- [ ] The Studio runtime API contains only explicitly listed functions.
- [ ] Generic error normalization comes from `/errors`; product classification remains Ginko-owned.
- [ ] MCP performs one credential-to-token exchange per authentication attempt.
- [ ] The custom MCP Convex transport wrapper is deleted.
- [ ] Failure budgets, redaction, claims, capability, and product authorization remain Ginko-owned.
- [ ] Registry package e2e and production audit pass.

## 14. Stop conditions

Stop the current subtask and document the evidence before proceeding when any of these occur:

1. Better Auth plugin inference cannot flow from the convention definition into the consumer `useConvexAuth().client` type.
2. Optional auth cannot avoid anonymous-first execution during hydration.
3. Same-user token refresh necessarily forces query reacquisition in Convex's client.
4. `ConvexCallError` cannot cross Nitro serialization without losing required public fields.
5. Bearer exchange behavior differs from cookie exchange in the installed `@convex-dev/better-auth` endpoint.
6. Exact-empty query args cannot reject options-shaped objects without breaking valid optional or union args.
7. A Ginko module dependency cannot provide the build-only auth-client definition to the host Nuxt build.

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
5. Can two users on the same browser ever share an authenticated cache key?
6. Can auth-disabled downstream modules compile without conditional imports?
7. Can a server handler make several calls under one explicit token snapshot?
8. Can a bearer credential be exchanged without exposing it to logs?
9. Can an application inspect product `ConvexError.data` without library reinterpretation?
10. Does the Ginko Studio receive only its explicit function allowlist?
11. Did the cutover delete more concepts than it added?
12. Did packed, registry-style consumer verification pass?

If any answer is no, the release is not feature-complete.
