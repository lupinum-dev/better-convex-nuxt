# Better Convex Nuxt vNext — Internal Architecture and Maintenance Specification

## Status and authority

This document is the implementation specification for the internal cleanup that accompanies the breaking vNext release.

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

## 3. Non-negotiable internal principles

### 3.1 One owner for every important concept

| Concept                                                    | Sole owner after vNext                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Effective build configuration                              | Pure module build-plan resolver                                |
| Browser-safe runtime configuration                         | Per-Nuxt-app runtime context                                   |
| Server secrets and server-only limits                      | Nitro private runtime config                                   |
| Auth identity and identity generation                      | Per-app auth context                                           |
| Auth operation progress                                    | Per-app pending-operation tracker                              |
| Query wire deduplication and Convex local cache            | `ConvexClient`                                                 |
| SSR payload reuse                                          | Nuxt payload and async-data key                                |
| Mounted query result and transform                         | Individual composable instance                                 |
| Explicit Vue state sharing                                 | One `defineSharedConvexQuery` definition instance per Nuxt app |
| Pagination page and cursor generation                      | One pagination controller per composable instance              |
| Server credential snapshot                                 | One `ServerConvexCaller` instance                              |
| Generic call-error representation                          | Framework-free `/errors` entry                                 |
| Product authorization interpretation                       | Consumer application                                           |
| DevTools state                                             | Per-app DevTools store                                         |
| Clients, listeners, scopes, timers, and transports cleanup | Per-app disposer stack                                         |

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
  readonly config: ConvexRuntimeConfig;
  readonly auth: ConvexAuthContext<Client>;
  readonly clients: {
    readonly primary: ConvexClient | null;
    getAnonymous(): ConvexClient | null;
  };
  readonly logger: Logger;
  readonly devtools: DevtoolsSink | null;
  readonly sharedQueries: SharedQueryStore;
  addDisposer(dispose: () => void | Promise<void>): void;
  dispose(): Promise<void>;
}
```

Required constraints:

- The runtime context is private and is not a public service locator.
- The auth context is the sole owner of identity generation.
- The anonymous client is created lazily.
- In an auth-enabled browser application, `auth: 'none'` uses a client that has never received an auth token.
- In an auth-disabled application, the primary anonymous client may be reused.
- Server rendering must not allocate WebSocket clients.
- The documented `$convex` exposure may remain if required by the public contract. All other private application state must collapse into one private runtime attachment.
- Mutable application state must never be module-global.
- A frozen module-level disabled-auth value is allowed because it contains no application state.
- Initialization is HMR guarded and teardown is explicit.

Delete scattered ownership through `$convexAuthEngine`, `_bcnUnauthorizedRecoveryState`, `_convexRefreshAuthPromise`, module-global DevTools registries, and equivalent private fields.

### 4.2 Lifecycle and disposal

Register runtime teardown through Vue application unmount using `vueApp.onUnmount`. Do not assume a Nuxt `app:beforeUnmount` hook that is absent from the installed Nuxt hook contract.

The disposer must be idempotent and must:

1. Stop auth/session listeners.
2. Unsubscribe all composable-owned query listeners.
3. Stop shared-query effect scopes.
4. Stop connection listeners.
5. Close primary and anonymous `ConvexClient` instances by awaiting `close()`.
6. Disconnect DevTools transports.
7. Clear timers and pending retry work.
8. Mark the runtime disposed so stale async completions cannot mutate it.

HMR replacement must dispose the previous runtime before installing a new one. Teardown errors are collected and logged safely; one failed disposer must not prevent later disposers from running.

### 4.3 Intended directory ownership

The following is a destination map, not authorization for a mass move:

```text
src/
  module.ts
  module/
    build-plan.ts
    registration.ts
    templates.ts
    api-surface.ts
  auth-client/
    index.ts
  errors/
    index.ts
    ConvexCallError.ts
    normalize.ts
  runtime/
    app/
      context.ts
      dispose.ts
    auth/
      context.ts
      identity.ts
      transitions.ts
      integrated-client.ts
      pending.ts
    queries/
      execution-plan.ts
      identity-key.ts
      key.ts
      pagination-controller.ts
    calls/
      callable.ts
      state.ts
    uploads/
      core.ts
      queue-state.ts
    composables/
    plugins/
    server/
      caller.ts
      exchange.ts
      auth-snapshot.ts
      proxy/
    devtools/
      store.ts
      bridge.ts
      transport.ts
```

Do not create `utils/core`. Pure helpers live beside the domain invariant they implement. A remaining `utils` directory is reserved for genuinely cross-domain, stateless primitives.

## 5. Configuration and module construction

### 5.1 One build-time resolver

Replace the interleaved defaulting and registration logic in `module.ts` with one pure resolver:

```ts
interface ModuleBuildPlan {
  readonly registration: {
    readonly coreClientPlugin: true;
    readonly clientAuthPlugin: boolean;
    readonly serverAuthPlugin: boolean;
    readonly authProxy: boolean;
    readonly routeMiddleware: boolean;
  };
  readonly publicRuntime: ConvexPublicRuntimeConfig;
  readonly privateRuntime: ConvexPrivateRuntimeConfig;
  readonly authClientDefinition: ResolvedBuildOnlyDefinition | null;
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

Public runtime configuration may contain only values required in browser code:

- Convex deployment URL;
- the local auth proxy route;
- query and upload client defaults;
- client log level and non-sensitive diagnostics switches.

Private runtime configuration owns:

- Convex site origin;
- trusted origins;
- exchange timeout and response-size limits;
- proxy request and response limits;
- server tracing;
- retained server cache settings, only if the cache passes its deletion gate.

Build-only filesystem paths, including the typed Better Auth definition path, must never appear in runtime configuration, built browser chunks, SSR payloads, or generated public types.

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
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "anonymous" }
  | {
      status: "authenticated";
      token: string;
      user: ConvexUser;
      key: `user:${string}`;
    }
  | {
      status: "error";
      error: ConvexCallError;
    };
```

Do not represent identity through independent booleans for token, user, authentication, and loading. Do not manufacture empty strings for absent Better Auth user fields. The public `ConvexUser` contract must model actual optionality, or decoding must reject values that fail its required schema.

Stable cache identity is Better Auth `user.id`, never a JWT and never a token hash.

### 6.2 Independent operation progress

Authentication operations remain independent from usable identity:

```ts
interface AuthOperations {
  readonly activeCount: Readonly<Ref<number>>;
  readonly isPending: ComputedRef<boolean>;
  readonly lastError: Readonly<Ref<ConvexCallError | null>>;
}
```

This allows an authenticated identity to remain usable after a failed background refresh. It also makes concurrent sign-in, sign-up, sign-out, and refresh operations deterministic through a count rather than a lossy boolean.

### 6.3 One effect coordinator

The per-app auth context owns:

- the single Better Auth client;
- identity state and generation;
- the initial-settlement promise;
- one single-flight refresh promise;
- pending-operation accounting;
- `ready()`;
- integrated sign-in and sign-up wrapping;
- sign-out and revocation transitions;
- Convex `setAuth` coordination.

Pure transition functions calculate next state. One coordinator performs effects. Do not add a generic state-machine dependency.

Delete the Nuxt hook command bus for auth refresh. Internal callers invoke context methods directly.

### 6.4 `ready()` implementation rule

Implement the exact semantics locked in `vNext.md` as a snapshot operation:

- A call observes the current identity generation.
- If that generation is already settled, it resolves immediately.
- If it is loading, it waits for that generation's initial settlement.
- A later background refresh must not retroactively keep an already waiting `ready()` call pending.
- A generation replacement caused by sign-out or user switch must settle or invalidate waiters deterministically; no waiter may hang.
- In an auth-disabled build, `ready()` resolves immediately with disabled state.
- Concurrent callers for the same generation share one promise.

The implementation may not redefine `ready()` to mean “no auth operation is active.” Identity settlement and operation progress are separate contracts.

### 6.5 Auth race invariants

Every async auth effect captures a generation. A completion may commit only if its generation remains current.

Required transitions include:

- SSR anonymous → hydrated anonymous without authenticated UI flicker;
- SSR authenticated → hydrated authenticated without anonymous execution;
- loading → anonymous;
- loading → authenticated;
- loading → error;
- anonymous → authenticated through integrated sign-in/sign-up;
- authenticated user A → same user A with rotated token;
- authenticated user A → authenticated user B;
- authenticated → anonymous through sign-out;
- authenticated → anonymous through definitive session revocation;
- authenticated → authenticated plus background refresh error;
- concurrent operations completing out of order;
- teardown while an operation is pending;
- two Nuxt applications in one process.

Integrated sign-in and sign-up resolve only after the auth context has synchronized the resulting Convex identity. Proxy wrappers must preserve method receivers by applying original methods to their owning client object.

### 6.6 Delete route-dependent identity and product policy

Delete route-dependent auth settlement options and branches such as `skipAuthRoutes` and `skipConvexAuth`. An auth-enabled application has one identity regardless of the current route. Public operations use query-level `none`; a Convex-only application uses module-level `auth: false`.

Delete automatic recovery that infers product authorization from ordinary Convex function errors:

- unauthorized module options;
- `auth-unauthorized-core.ts`;
- `auth-unauthorized.ts`;
- automatic redirect and sign-out timers;
- per-call recovery hooks and private recovery state.

Definitive auth-engine token rejection or session revocation may clear identity. Application authorization errors remain application errors.

## 7. Query architecture

### 7.1 Prove Convex ownership before deletion

The installed Convex client documents that `BaseConvexClient` deduplicates identical query subscriptions. Before deleting the current custom manager, add an instrumentation fixture that proves:

1. Two `onUpdate()` listeners for the same function and arguments on one client produce one wire subscription.
2. Both listeners receive updates.
3. Removing one listener leaves the other active.
4. Removing both listeners releases the wire subscription.
5. A later listener receives the client's locally cached result.
6. A same-user auth-token rotation produces zero query reacquisitions.

If the fixture passes, delete:

- `subscriptionRegistry` and `SubscriptionEntry`;
- reference counts;
- query bridges and bridge listeners;
- `acquireQuerySubscription` and `releaseSubscription`;
- `clearSubscriptionCache` and `clearAuthSubscriptions`;
- payload-key registries and counts;
- public-only payload discovery and purge orchestration whose only purpose was the custom registry.

If any proof fails, stop. A senior must document the exact missing Convex behavior and approve the smallest compensating owner. The junior must not preserve the entire existing cache speculatively.

### 7.2 Small query execution plan

Extract only the invariants shared by regular and paginated queries:

```ts
interface QueryExecutionPlan {
  readonly state: "idle" | "waiting" | "execute";
  readonly client: "primary" | "anonymous" | "server";
  readonly identityKey: ConvexIdentityKey;
  readonly payloadKey: string;
  readonly generation: number;
}
```

The shared query foundation may own:

- normalized explicit arguments or `'skip'`;
- auth-mode execution gating;
- selected transport/client;
- stable identity-aware key construction;
- captured generation;
- stale-commit predicate;
- common Nuxt async-data error adaptation;
- common transform fallback typing when it is genuinely identical.

It must not own mounted result state, subscription registries, pagination state, callbacks, or a second cache. Do not create a universal query engine.

### 7.3 Regular-query ownership

Each mounted regular-query composable owns one `ConvexClient.onUpdate()` listener and its unsubscribe function. It owns its Vue-visible data, error, pending state, transform, and callback lifecycle. Nuxt owns SSR payload reuse. Convex owns wire deduplication.

### 7.4 Structural cross-user isolation

Every identity-varying holder uses the same stable identity dimension:

- Nuxt payload and async-data key;
- live listener generation;
- shared-query instance;
- pagination generation and page collection;
- retained previous-data snapshot.

On user A → user B:

1. Synchronously clear visible data, error, pages, cursors, and previous-data snapshots.
2. Advance the generation.
3. Select B's execution plan and transport.
4. Reject every callback and promise captured under an older generation.

`keepPreviousData` must never cross an identity boundary. At no observable point may A's payload, error, pagination page, or transformed result become visible under B.

A same-user token rotation keeps the same identity key and does not reacquire queries.

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

### 7.7 Shared queries

Retain `defineSharedConvexQuery` only as an explicit Vue-state sharing primitive, not a wire-deduplication feature.

The definition closure owns a `WeakMap<NuxtApp, SharedState>`. Remove caller-selected string keys, duplicate-key collision checks, query/options fingerprinting, and private registry mutation on the Nuxt application when the closure identity can be the canonical definition identity.

Register every shared-query effect scope with the application disposer.

## 8. Mutations and actions

Create one private callable lifecycle used by mutations and actions only. It owns:

- latest-call generation;
- pending, data, and error state;
- callbacks;
- logging and DevTools events;
- error normalization;
- throwing and `.safe()` result paths.

Inject only the operation-specific behavior:

- mutation invocation and optional optimistic update;
- action invocation.

Do not include queries, pagination, uploads, or server calls in this abstraction. Do not export it. The lifecycle abstraction is accepted only if the final mutation and action composables no longer contain separate copies of the same pending, normalization, callback, and `.safe()` algorithm.

## 9. Errors

### 9.1 Framework-free boundary

The `/errors` entry contains no Nuxt, Vue, Nitro, Better Auth, Convex runtime, DOM, or Node-only import. It owns:

- `ConvexCallError`;
- mechanically safe normalization;
- serialization and deserialization helpers;
- public error kinds locked by `vNext.md`.

### 9.2 Classification ownership

Pure normalization classifies only values that carry reliable evidence. It must not infer transport failure from every `TypeError` or infer application authorization from message strings.

Environment boundaries add known context:

- fetch, XHR, WebSocket, and timeout boundaries create `transport` errors;
- required identity absence and token exchange 401/403 create `authentication` errors;
- exact Convex argument validation creates `validation` errors;
- Convex application errors preserve application data as `server` errors;
- unrecognized values remain `unknown`.

Throwing calls and `.safe()` must pass through the same normalizer. Delete conversion back into plain `Error`.

### 9.3 Serialization and redaction

Add a Nuxt payload reducer/reviver so hydrated errors retain `instanceof ConvexCallError` and their public fields.

`cause` is runtime-only. It must not appear in `toJSON()`, SSR HTML, payload JSON, DevTools serialization, or logs. Credentials, tokens, cookies, and authorization headers must not be embedded in public error data.

## 10. Server runtime

### 10.1 Official Convex primitives

Implement `serverConvex()` with one lazy `ConvexHttpClient` per caller:

- validate option combinations synchronously;
- own one lazy authentication snapshot/token promise;
- own one lazy HTTP client;
- apply authentication once when a token exists;
- use official `query`, `mutation`, and `action` methods.

Delete manual `/api/query`, `/api/mutation`, and `/api/action` construction, manual Convex response parsing, manual function-name reflection, and the old server call trio. Use Convex's official function-name utility wherever a name is required.

### 10.2 One request-scoped identity source

Each caller owns one lazy authentication snapshot. It may use the explicitly selected cookie or bearer exchange path. It must not silently fall back to a second `/get-session` identity source when exchange fails.

Retries of an operation may reuse the caller's settled snapshot. Creating a new caller creates a new snapshot. Failed token exchange must not become a process-global rejected promise.

### 10.3 Exchange result

Use a discriminated result for the never-throwing exchange primitive:

```ts
type ConvexTokenExchangeResult =
  | { ok: true; token: string; status: number }
  | { ok: false; error: ConvexCallError; status?: number };
```

The exchange boundary enforces timeout, request/response size, content type, credential redaction, cookie/bearer exclusivity, and exact authentication-versus-transport classification.

### 10.4 SSR auth-cache deletion gate

The current cross-request auth-token cache is disabled by default and has no repository application consumer. Retain it only if all of the following exist before implementation:

1. A reproducible production-shaped benchmark.
2. An agreed TTFB or upstream-load threshold that fails without the cache.
3. A real consumer requiring cross-request token reuse.
4. An explicit accepted session-revocation window.
5. One server-only owner with no public client configuration.

If any item is absent, delete auth-cache options, storage, hashing, invalidation coupling, `serverConvexClearAuthCache`, tests, and docs. Caller-local token reuse remains.

### 10.5 Server type program

The root TypeScript configuration currently excludes `src/runtime/server`. Add explicit scripts:

```json
{
  "typecheck:module": "vue-tsc --noEmit",
  "typecheck:server": "vue-tsc -p src/runtime/server/tsconfig.json --noEmit",
  "typecheck:fixtures": "node scripts/check-packed-type-fixtures.mjs",
  "typecheck": "pnpm run typecheck:module && pnpm run typecheck:server && pnpm run typecheck:fixtures"
}
```

Names may be adjusted once, but the three distinct programs and aggregate gate are required.

## 11. Uploads

Keep the existing architecture:

- `upload-core.ts` owns upload URL acquisition, XHR transport, abort, progress, and response validation.
- `useConvexFileUpload` owns one upload's reactive state.
- `useConvexUploadQueue` owns scheduling and queue-item state.

vNext work is limited to shared `ConvexCallError` boundaries, runtime-context access, teardown, and invariant tests. Do not create another upload service, generic request engine, or transport adapter hierarchy.

## 12. DevTools, logging, and diagnostics

### 12.1 Per-app DevTools

Replace mutable module-global query and mutation registries with a per-app store or sink attached to the runtime context.

Required properties:

- every event includes an application instance identifier;
- mutation and call history is bounded;
- subscriptions and transports are disposed with the app;
- HMR produces no ghost state;
- two Nuxt applications in one process cannot observe each other's events;
- DevTools absence does not create a second execution path.

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

Retain distinct browser and server presentation only where the sink requires it. Remove duplicated normalization and redaction logic.

### 12.3 Build workaround

Keep the current `build.config.ts` DevTools pruning behavior until a supported module-builder mechanism or a source/output relocation demonstrably removes it. Any replacement must prove the packed tarball contains the intended runtime files and excludes raw DevTools source/output debris. Do not refactor this hook for aesthetics.

## 13. Public-wrapper retention decisions

The public surface locked in `vNext.md` remains authoritative. Internal cleanup must not silently introduce a new public abstraction.

Apply these deletion decisions:

- Delete `useConvexCall` as already locked.
- Delete `createPermissions` and permission configuration as already locked.
- Delete `createBetterConvexAuthClient` as already locked.
- Delete the old standalone server trio as already locked.
- Keep `useConvexStorageUrl` only as a thin query convenience with no separate cache or policy.
- Keep `createUserSyncTriggers`; it belongs to a distinct Convex server environment.
- Simplify `defineSharedConvexQuery` as described in section 7.7.

`useConvexUser` is a senior proof-phase decision. Retain it only if a current consumer demonstrates a stable requirement that cannot be expressed clearly through `useConvexAuth().user` plus `useConvexQuery`. If no such requirement is recorded, delete it in the breaking release rather than preserving projection provenance policy in the integration library.

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

Delete step narration and comments that restate code. Replace every opaque `F-##` marker with a self-contained invariant comment that references a named test or ADR. Do not create a permanent registry solely to preserve external issue archaeology.

### 14.3 Architecture document and ADRs

Create `src/ARCHITECTURE.md` containing:

- the canonical ownership table;
- dependency direction rules;
- per-app runtime lifecycle;
- auth identity and operation separation;
- query identity-isolation rules;
- server/client/framework-free entry boundaries;
- comment and ADR policy.

Create short ADRs only for durable choices that future maintainers might otherwise reverse:

1. Stable user identity key versus token identity.
2. Dedicated anonymous client for `auth: 'none'`.
3. Auth-disabled build topology.
4. Framework-free entry purity.
5. Error serialization and cause redaction.
6. Convex-owned subscription deduplication, after the proof fixture passes.

Each ADR contains status, context, decision, consequences, and the test that guards it.

## 15. Historical material, starters, and repository classification

### 15.1 Historical research

Do not move `research/` and `experiments/` into another in-tree archive. That preserves search noise and creates a false maintenance obligation.

Classify every file as one of:

- an active design input that must be distilled into `vNext.md`, this document, or an ADR;
- a currently executed verification script that must move into maintained `scripts/` with a named CI owner;
- concluded research or proof material that must be deleted and retained only in Git history.

After distillation, delete concluded research, proof scripts, and the monolithic experiment file. Update all references in TypeScript configuration, architecture docs, starter docs, and research cross-links. No maintained build or documentation path may reference deleted historical material.

### 15.2 Changelog repair

Reconstruct the missing `v0.4.0` changelog section from the tagged Git range and published package evidence. Do not invent release notes. If a fact cannot be reconstructed, document the release link and the limitation explicitly.

### 15.3 Repository-root classification

Classify every install root as exactly one of:

- authoritative package development root;
- packed consumer fixture;
- documentation application;
- deployed demo;
- supported starter;
- historical material scheduled for deletion.

Each retained root needs an owner, dependency-update policy, lockfile policy, and CI command. Unowned roots are deleted.

Do not blindly align every version. Deliberate compatibility fixtures may pin older versions, but their purpose and tested range must be explicit. Accidental drift is not allowed.

### 15.4 Starter policy

Before rewriting starter content, publish the supported starter matrix. Every supported starter must have:

- a clear use case distinct from the other starters;
- a README and complete application structure;
- a maintained dependency policy;
- build and typecheck coverage in CI;
- no committed generated output;
- a test proving the vNext integration path it demonstrates.

Convert `starters/research` to maintained documentation or delete it. Convert `platform-auth` into a named proof fixture if its code remains needed; otherwise complete it as a real supported starter or delete it. Do not retain six independently drifting starter lockfiles without an explicit reason. Prefer a managed workspace/catalog or packed-fixture install flow.

## 16. Static analysis, package boundaries, and CI

### 16.1 Dependency-direction gate

Add an AST-based source boundary check. Regex is insufficient for semantic imports and exports.

Enforce:

- `/errors` imports only its framework-free error implementation and platform-neutral language primitives;
- `/auth-client` may import Better Auth and Convex auth client packages, but never Nuxt, `#app`, Vue, Nitro, Node-only modules, or server runtime;
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

Use bundle metafiles or equivalent graph evidence to prove `/errors` has no Nuxt, Vue, Better Auth, or Convex runtime dependency and `/auth-client` has no Nuxt or server code.

Source tests with mocked `#imports` are not sufficient package evidence.

### 16.3 Vocabulary checker

Replace the inline `sh -c '! rg …'` package scripts with one table-driven Node script. It may enforce forbidden words, old API spellings, and documentation vocabulary. It must not enforce semantic import/export architecture; the AST gate owns that.

This removes an undeclared ripgrep dependency and shell escaping from the portable release gate.

### 16.4 One authoritative check command

Create one `pnpm check` command that is run in pull requests and is a subset of `release:verify`. It must include:

1. formatting check;
2. ESLint;
3. vocabulary locks;
4. module typecheck;
5. server typecheck;
6. source dependency boundaries;
7. unit tests;
8. deterministic Nuxt tests;
9. packed type fixtures;
10. package export and purity probes;
11. docs/API freshness and link checks;
12. supported starter checks;
13. artifact and generated-output checks.

Critical auth, SSR, identity isolation, error serialization, and auth-disabled tests must not be skipped because an external `CONVEX_URL` is absent. Use deterministic fixtures for pull requests. Broad real-service E2E may remain scheduled and pre-release.

### 16.5 Deterministic CI and release

- Use Corepack with the repository's pinned pnpm version.
- Install through `pnpm install --frozen-lockfile`.
- Do not use unpinned `npx TOOL@latest` invocations in CI.
- Declare the supported Node engine and test the minimum supported version plus current LTS.
- Make `release:verify` a reproducible superset of the exact pull-request gates.
- Keep publication human-controlled and separate from verification.
- Publish only an already verified tarball.
- Assert a tarball allowlist and reject DevTools raw output, generated build debris, historical research, local absolute paths, and unplanned source files.

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

Run repeated HMR-style initialization/disposal cycles and assert live resource counts return to zero after every cycle.

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

- no production orchestration function may exceed 150 lines or cyclomatic complexity 20 without a local, senior-approved lint exception;
- every exception must state the invariant that prevents decomposition and name its guarding test;
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
- Old standalone server call helpers and their exports.
- Old auth vocabulary, old skip dialects, and compatibility aliases.
- Plain-error conversion paths replaced by `ConvexCallError`.
- Stale `useConvexRpc` and `useAuthClient` documentation/lint references.

### 19.2 Proof-gated deletions

- Custom subscription registry, bridges, refcounts, and payload registry after Convex deduplication proof.
- Route-dependent auth skipping after final module-option inventory.
- Automatic unauthorized product-policy recovery after auth revocation tests exist.
- SSR auth-token cache and invalidation API unless every retention criterion passes.
- `useConvexUser` unless a concrete consumer requirement is recorded.
- Shared-query string keys and fingerprinting after closure identity tests.
- Module-global DevTools registries after per-app fixture passes.
- Global development auth health-check cache.
- Manual Convex function-name and HTTP protocol helpers after official-client tests pass.
- Concluded research and experiment artifacts after decisions are distilled.
- Unsupported or unowned starters/install roots.

### 19.3 Explicitly retained structures

- Domain-local pure-core pattern, renamed and colocated as files are touched.
- Existing upload core layering.
- Test helpers that expose mechanics rather than policy.
- `release.mjs` safety discipline, while separating verify from publish.
- DevTools packaging workaround until an evidence-backed replacement exists.
- Explicit pagination orchestration while Convex's alternative remains experimental.

## 20. Workstreams and mapping to `vNext.md`

The public six-phase order remains authoritative. Internal work is woven into the owning phase so two teams do not rewrite the same hotspot concurrently.

### Internal Phase 0 — senior proofs and baseline gates

Complete before assigning broad implementation:

- packed typed Better Auth client inference fixture;
- Convex native subscription deduplication fixture;
- anonymous-client isolation fixture;
- same-user token rotation fixture;
- `ConvexCallError` reducer/reviver fixture;
- user A → user B mounted-query isolation fixture;
- SSR auth-cache retention decision;
- `useConvexUser` retention decision;
- repository install-root and starter classification;
- baseline AST boundary and aggregate typecheck commands.

These are decisions and proof programs, not production rewrites.

### Public Phase 1 — foundations and pruning

Include:

- pure module build plan and public/private runtime split;
- runtime context and disposer foundation;
- deletion of locked public surfaces and stale generated metadata;
- query execution plan and native-dedup decision;
- route-dependent auth and unauthorized-policy deletion if approved in Phase 0;
- vocabulary checker foundation;
- architecture ownership document.

Implement foundations and their consumers atomically inside Phase 1. Branch-local scaffolding may exist while a commit is being assembled, but no phase-boundary commit or packed artifact may contain old and new internal paths side by side.

### Public Phase 2 — errors

Include:

- framework-free error implementation;
- boundary-owned classification;
- payload reducer/reviver;
- cause redaction;
- throwing/`.safe()` equivalence;
- packed `/errors` purity proof;
- logger safe serializer shared only as a platform-neutral primitive where appropriate.

### Public Phase 3 — auth lifecycle, typed client, and queries

Include:

- per-app auth context and pure transitions;
- integrated client and receiver-preserving proxy logic;
- exact `ready()` semantics;
- pending-operation counter;
- removal of auth hook command bus;
- regular query decomposition;
- pagination controller;
- structural identity isolation;
- anonymous-client routing;
- shared-query simplification;
- custom subscription manager deletion after proof;
- per-app teardown and HMR tests;
- split invariant-oriented auth/query test suites.

Assign one owner to `client-engine.ts`, one owner to regular query, and one owner to paginated query. Changes to their shared foundation require coordinated review, not simultaneous competing edits.

### Public Phase 4 — server caller

Include:

- official `ConvexHttpClient` implementation;
- caller-owned lazy snapshot and client;
- discriminated exchange result;
- server type program;
- packed `/server` purity fixture;
- SSR auth-cache deletion or isolated retained implementation;
- mutation/action callable factory where it can proceed independently;
- upload error integration without upload redesign.

### Public Phase 5 — Ginko hard migration

Begin only after the exact package tarball required by Ginko passes packed fixtures. Migrate Ginko directly to final APIs. Do not use Ginko to preserve an obsolete library path.

Confirm that:

- manual login refreshes are removed only after integrated auth synchronization passes;
- raw API-key browser HTTP is replaced by the final typed client method;
- runtime config casts disappear because normalized public types exist;
- Studio bridge/API exports are a real allowlist;
- Ginko authorization and MCP failure budgets remain in Ginko;
- generated Convex API files are regenerated, not edited;
- package compatibility metadata and registry verification use the new breaking range.

### Public Phase 6 — docs, hygiene, and release hardening

Include:

- public JSDoc and compile-checked examples;
- removal of all `F-##` comments;
- research/experiment distillation and deletion;
- starter rationalization and CI coverage;
- changelog `v0.4.0` reconstruction;
- final vocabulary locks;
- deterministic CI and canonical `pnpm check`;
- packed entry matrix and tarball allowlist;
- final architecture and ADR review;
- removal of temporary proof fixtures that are superseded by permanent acceptance fixtures.

## 21. Parallelization rules

A large team should parallelize independent domains, not the same hotspot.

Safe concurrent ownership after foundations are fixed:

- errors and payload serialization;
- typed Better Auth definition fixture;
- server caller and exchange;
- mutation/action callable lifecycle;
- DevTools/logging;
- tooling, package-boundary gates, and docs;
- Ginko inventory before migration begins.

Serial or tightly coordinated ownership:

- module build plan before plugin/template registration changes;
- auth context before auth-dependent query integration;
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
- Repeated HMR cycles do not increase live resource counts.

### 22.2 Configuration and bundles

- No composable imports or invokes `useRuntimeConfig()`.
- Build-only definition paths do not enter runtime output.
- Server-only configuration does not enter `runtimeConfig.public`, HTML, payload JSON, or browser chunks.
- Auth-disabled output contains no Better Auth client, auth engine, proxy, middleware, or conditional dormant implementation.
- Invalid auth-only options with `auth: false` fail at build time with exact messages.

### 22.3 Auth

- SSR-provided anonymous and authenticated identity hydrate directly into the same settled state.
- Optional queries never execute anonymous-first while auth-enabled identity is unsettled.
- Integrated sign-in/sign-up resolve only after Convex synchronization.
- Concurrent operations keep `isPending` true until the final operation settles.
- Same-user refresh changes token without changing identity key or reacquiring queries.
- User switching rejects all stale generations.
- Definitive revocation clears identity; background refresh failure may preserve usable identity.
- `ready()` passes the generation snapshot matrix and never hangs.
- Proxy-wrapped Better Auth plugin methods preserve `this`.

### 22.4 Queries

- N identical listeners on one client produce one wire subscription.
- Each listener may transform independently.
- Removing one listener does not release another listener's subscription.
- Removing the last listener releases the subscription.
- `none` uses the never-authenticated transport in auth-enabled applications.
- User A → user B exposes no A result, error, previous data, page, or cursor at any observation point.
- Same-user token rotation causes zero listener reacquisitions.
- `'skip'` is the sole skip sentinel.
- Exact empty arguments reject options-shaped objects while allowing legitimate Convex argument types.
- Pagination rejects stale page completions after identity, arguments, skip, or refresh generation changes.

### 22.5 Errors, calls, and uploads

- Throwing and `.safe()` paths return equivalent normalized errors.
- SSR hydration preserves `ConvexCallError` identity and public data.
- Cause and credentials never serialize or log.
- Mutation and action share one private lifecycle.
- Optimistic update remains mutation-only.
- Upload abort, progress, queue concurrency, and response validation retain existing behavior.
- Logging hostile values never throws.

### 22.6 Server and package boundaries

- `ServerConvexCaller` performs at most one exchange/snapshot resolution per caller.
- It owns one lazy `ConvexHttpClient`.
- Cookie and bearer exchange are mutually exclusive and correctly classified.
- Timeouts and size limits have deterministic tests.
- No manual Convex endpoint construction remains.
- `/errors` and `/auth-client` are framework-free.
- `/server` has no Vue or browser dependency.
- Root, server, and packed-fixture type programs pass.
- Packed exports match the exact vNext allowlist.

### 22.7 Maintenance and release

- No explicit unsafe production types, opaque `F-##` comments, stale old API names, or tracked historical proof scripts remain.
- Every retained install root has an owner and CI gate.
- Every supported starter builds and typechecks.
- `pnpm check` passes from a clean checkout with a frozen lockfile.
- `release:verify` is a deterministic superset of pull-request checks.
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

The junior may choose local names and file splits within the ownership rules. The junior must not improvise identity semantics, auth settlement, cache ownership, error classification, retry policy, package exports, server credential precedence, or deletion retention decisions.

## 24. Definition of done

The internal cleanup is complete only when all of the following are true:

- The public vNext contract is implemented with no compatibility layer.
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
