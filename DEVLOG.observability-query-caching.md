# Dev Log: Observability Under Convex Query Caching

Date: 2026-04-18

## Summary

Trellis observability needs a harder split between:

- mutation/action/MCP semantic observability
- query transport/runtime observability

The reason is simple:

- Convex reactive query identity is keyed by function path plus args.
- Trellis currently injects request-scoped observability metadata into some server-side query args via `__trellis`.
- Convex maintainers explicitly do not want request-scoped runtime metadata exposed in queries because it conflicts with caching semantics.

That means our current query-lane observability model is too optimistic.

## Confirmed findings

### 1. Convex reactive query identity includes args

In the local Convex client:

- [`npm-packages/convex/src/browser/sync/udf_path_utils.ts`](</Users/matthias/Git/external/convex-backend/npm-packages/convex/src/browser/sync/udf_path_utils.ts>) defines `serializePathAndArgs(...)`
- the query token is:
  - canonicalized function path
  - plus serialized args

So changing args changes query identity by design.

Trellis mirrors that locally in its Nuxt query cache:

- [`src/runtime/utils/convex-shared.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/utils/convex-shared.ts) defines `getQueryKey(...)`
- the key is `convex:${fnName}:${hashArgs(args)}`

So if `__trellis` ever leaks into reactive/browser query args, Trellis itself will also treat it as a distinct query identity.

### 2. Trellis injects observability metadata into server-side Convex query args

In [`src/runtime/server/utils/convex.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/utils/convex.ts), `executeConvexOperation(...)`:

- generates `correlationId`
- generates `requestId`
- calls `withObservationEnvelope(...)`

That means one-shot server query calls currently send request-scoped metadata inside args.

### 3. Trellis query runtime reads query args for observability

In [`src/runtime/functions/index.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts), `createContextWithRuntime(...)`:

- strips `__trellis` from app args
- reads `getObservationEnvelope(args)`
- seeds `createObservationEmitter(...)` from that envelope

So query semantic events can depend on request-scoped metadata when the query was invoked through a path that injected it.

### 3a. Focused tests now prove the current boundary

Added:

- [`test/unit/query-observability-cache-boundary.test.ts`](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/query-observability-cache-boundary.test.ts)
- updated [`test/unit/server-convex-utils.test.ts`](/Users/matthias/Git/0_libs/WORK/trellis/test/unit/server-convex-utils.test.ts)

What they prove:

- changing only `__trellis` changes Trellis local query keys
- two identical business `serverConvexQuery(...)` calls currently send different query args because `__trellis.requestId` is request-scoped

### 4. Trellis query observability is already inconsistent by lane

Browser query/runtime logging uses outer runtime observers like:

- [`src/runtime/composables/internal/query-runtime.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/internal/query-runtime.ts)
- [`src/runtime/utils/runtime-observer.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/utils/runtime-observer.ts)

Those do not rely on `__trellis` inside query args.

Server-side query calls do rely on `__trellis`.

So query observability is already split:

- browser/reactive query activity is transport/runtime-level
- some server query activity is semantic/query-runtime-level

That inconsistency is a warning sign, not a feature.

### 5. Convex maintainers consider query runtime metadata dangerous for caching

Convex feedback on issue/PR #446:

- request/global metadata accessible in queries makes caching hard to do correctly
- preferred direction is logging-layer enrichment instead of query-runtime metadata

This matches the technical structure above.

## What this means for Trellis

The current assumption:

- one correlation model should flow uniformly through query, mutation, action, MCP

is probably wrong.

A better model is:

- mutations/actions/MCP keep rich semantic observability
- queries use outer transport/runtime observability
- query semantic events inside Convex runtime are not treated as a reliable per-request contract

## Likely unsafe parts of the current design

These are now suspect:

- `__trellis` injection into query args
- request-scoped `correlationId` / `requestId` inside query runtime
- treating query-emitted semantic events as reliable proof of user-visible fetches
- assuming one logical request can always be reconstructed through query runtime execution

## Safer parts of the current design

These still look right:

- mutation/action/MCP semantic events
- token-bound destructive confirmation
- operation-id-bound MCP safety
- outer browser/runtime query logging via `runtime-observer`
- `transport` vs `originTransport` on non-query semantic flows

## Research questions to settle before code changes

### 1. Which query lanes are actually affected?

We need a precise table for:

- browser reactive subscriptions
- browser one-shot HTTP queries
- Nuxt/server one-shot queries
- nested `runQuery(...)`
- query-based destructive previews via `previewOf(...)`

### 2. Does `__trellis` materially change query sharing or caching in practice?

We should prove this with a small harness:

- same business args, different `correlationId`
- same business args, different `requestId`
- same business args, no envelope vs envelope

The expected result is that reactive identity changes when args change.

### 3. Which query observability signals must survive cache hits?

We need to separate:

- must-survive transport/runtime signals
- best-effort semantic signals
- signals that should be deleted instead of preserved

### 4. What should happen to destructive preview observability?

`previewOf(...)` is query-lane.

We need to decide whether preview should:

- keep only outer transport logging
- keep limited semantic events without per-request guarantees
- or move more meaningful proof to execute-time

## Candidate hard cuts

### Option A: Keep current query envelope propagation

Not recommended.

Why:

- continues mixing request-scoped metadata into query args
- pushes us further against Convex caching direction
- keeps query observability semantically overclaimed

### Option B: Remove `__trellis` from query args, keep it for mutation/action

Strong candidate.

Effects:

- server-side query calls stop carrying request-scoped metadata into Convex query runtime
- query semantic events lose per-request correlation
- mutation/action/MCP semantics stay rich

### Option C: Keep only stable metadata in query args

Possible, but suspicious.

If the metadata changes identity, it is still dangerous.
If it never changes identity, it may not be worth carrying in args at all.

### Option D: Move query correlation entirely to outer runtime/logging layers

Also a strong candidate.

This likely pairs with Option B:

- no request metadata in query args
- browser/server/MCP transport layers own query correlation and request logging
- query runtime itself is no longer the contract boundary for per-request observability

## Current recommendation

Do not patch this with more envelope tricks.

The likely right direction is:

- remove `__trellis` from query-lane propagation
- keep `__trellis` for mutation/action while Convex lacks a real metadata channel
- treat query observability as transport/runtime-level by default
- stop documenting query semantic events as guaranteed per request

## Next steps

1. Build one focused harness proving whether query identity changes with `__trellis`.
2. Audit every query call path in Trellis that currently uses `withObservationEnvelope(...)`.
3. Produce a lane-by-lane matrix of:
   - cache-safe
   - best-effort only
   - delete
4. Only then cut runtime behavior and docs.

## Query lane matrix

### Browser reactive queries via `useConvexQuery` / pagination

Path:

- [`src/runtime/composables/internal/query-runtime.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/internal/query-runtime.ts)
- [`src/runtime/composables/internal/pagination-runtime.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/internal/pagination-runtime.ts)

Current behavior:

- uses outer `runtime-observer`
- does not inject `__trellis` into Convex query args
- logs subscribe/share/update/error at the transport/runtime layer

Assessment:

- cache-safe
- already aligned with the likely future model

Recommendation:

- keep
- treat this as the canonical query observability shape

### Browser one-shot query helpers

Path:

- [`src/runtime/composables/internal/query-runtime.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/internal/query-runtime.ts)
- [`src/runtime/composables/internal/live-query-resource.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/internal/live-query-resource.ts)

Current behavior:

- still observed from the outer runtime layer
- no evidence of `__trellis` injection into business args

Assessment:

- likely cache-safe
- still worth one explicit verification pass

Recommendation:

- keep outer runtime correlation/logging only

### Nuxt/server one-shot `serverConvexQuery(...)`

Path:

- [`src/runtime/server/utils/convex.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/utils/convex.ts)

Current behavior:

- generates `correlationId`
- generates `requestId`
- injects `__trellis` into args through `withObservationEnvelope(...)`
- query runtime then reads the envelope in [`src/runtime/functions/index.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts)

Assessment:

- not cache-safe in spirit
- mixes transport correlation with query identity
- causes query semantic observability to depend on an unsafe lane

Recommendation:

- strong delete candidate for query-lane envelope propagation
- keep outer request/runtime logging

### MCP -> Convex query calls

Path:

- [`src/runtime/mcp/define-mcp-app.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)
- usually through [`src/runtime/server/index.ts`](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/index.ts)
- example runtime: [`examples-next/01-kanban-workspace/server/mcp/runtime.ts`](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/01-kanban-workspace/server/mcp/runtime.ts)

Current behavior:

- MCP request owns correlation at the transport edge
- MCP query calls typically go through `createServerConvexCaller(...)`
- that means query args inherit the same `__trellis` injection as server queries

Assessment:

- same risk as server one-shot queries
- especially relevant for MCP query tools and capability-resolution queries

Recommendation:

- remove query-lane envelope propagation here too
- preserve MCP request correlation at the MCP/runtime log layer

### Destructive previews via `previewOf(operation)`

Path:

- operation preview query in app code, for example [`examples-next/01-kanban-workspace/convex/boards.ts`](/Users/matthias/Git/0_libs/WORK/trellis/examples-next/01-kanban-workspace/convex/boards.ts)

Current behavior:

- preview is query-lane
- if reached through server/MCP query helpers, preview can currently see `__trellis`
- if reached through browser subscription-style paths, it does not

Assessment:

- best-effort only
- currently inconsistent by transport

Recommendation:

- do not treat preview semantic observability as a guaranteed per-request contract
- prefer outer preview request logging plus execute-time semantic proof

### Nested `ctx.runQuery(...)` inside Convex runtime

Path:

- Convex nested runtime, reached from Trellis handlers/tools/components

Current behavior:

- no direct evidence of Trellis adding a second envelope here
- still conceptually query-lane and subject to the same caching direction from Convex

Assessment:

- should not become the new place we hide request-scoped query metadata

Recommendation:

- keep out of the request-correlation contract unless Convex explicitly provides a cache-safe primitive

## Convex watchlist

These are the Convex platform changes that matter most for Trellis observability now.

### 1. `ctx.setLogAttributes(...)`

Why it matters:

- this is the most promising substrate for attaching structured observability context to Convex execution logs
- it can help with cost attribution, filtering, and correlation without polluting function args

What Trellis should do when it lands:

- use it in mutation/action/MCP execute lanes to attach stable facets such as:
  - `service`
  - `tenant_id`
  - `principal_kind`
  - `actor_kind`
  - `operation`
  - `tool`
- do not treat it as a replacement for Trellis semantic events
- do not force it into query runtime as a workaround for missing query semantics

What not to do:

- do not redesign Trellis around platform logs alone
- do not collapse semantic events into raw log attributes

### 2. `ctx.meta.getDeploymentMetadata()`

Why it matters:

- deployment-level facts belong to the platform, not framework glue
- this can remove some Trellis-local inference and make log/event tagging cleaner

What Trellis should do when it lands:

- use deployment metadata only as optional enrichment
- prefer it for service/deployment tagging on semantic events and summaries

### 3. `ctx.meta.getFunctionMetadata()`

Why it matters:

- function/component metadata is useful for tagging and correlation without leaking implementation assumptions through user code

What Trellis should do when it lands:

- use it to enrich semantic events and wide summaries where helpful
- prefer platform-supplied function identity over re-deriving names when that reduces drift

### 4. `ctx.meta.getTransactionMetrics()`

Why it matters:

- metrics like bytes/documents read can improve operator understanding and cost attribution

What Trellis should do when it lands:

- treat this as enrichment, not as core semantic state
- use it in mutation/action/MCP execute lanes first
- avoid making Trellis semantic event contracts depend on unstable metric shapes

### 5. `ctx.meta.getRequestMetadata()`

Why it matters:

- request metadata is useful in explicit request-bound lanes
- Convex maintainers already signaled this should likely remain mutation/action-scoped, not query-runtime scoped

What Trellis should do when it lands:

- use it for mutation/action/MCP execute correlation tagging
- keep queries out of this contract unless Convex explicitly documents a cache-safe query behavior

What not to do:

- do not rebuild query-lane request correlation inside Convex runtime just because a metadata API exists

### 6. Logging-layer enrichment on cache hits

Why it matters:

- this is the real missing piece for query observability
- if Convex enriches logs even when cached query results are reused, Trellis gets the query-side visibility it actually needs without fighting caching

What Trellis should do when it lands:

- keep query observability outer-runtime / log-driven
- stop looking for ways to reintroduce request-scoped query-runtime metadata
- document platform logs plus Trellis browser/runtime observers as the canonical query observability story

## Trellis follow-up triggers

If Convex ships any of the watchlist items above, Trellis should do a small focused follow-up instead of a broad redesign.

### Trigger A: `ctx.setLogAttributes(...)` ships

Do:

- add a Trellis internal helper for mutation/action/MCP execute lanes only
- map a small stable set of Trellis semantics into log attributes
- add tests proving business behavior is unchanged when log enrichment is unavailable or throws

Do not:

- expose a new public Trellis logging surface
- make semantic events depend on attribute support

### Trigger B: `ctx.meta.*` platform metadata ships

Do:

- replace local derivation where the platform source is clearly better
- enrich semantic events and summaries conservatively

Do not:

- widen Trellis event contracts casually
- make cache-sensitive lanes depend on unstable runtime metadata

### Trigger C: Convex documents cache-safe query log enrichment

Do:

- update Trellis docs to point query observability at platform log enrichment plus runtime observers
- consider reducing Trellis query-lane debug/event duplication if the platform logs become strong enough

Do not:

- restore query-lane `__trellis`
- re-open request-scoped query-runtime metadata unless Convex explicitly solves that boundary

## Current recommendation

Until Convex ships those pieces, Trellis should hold the current line:

- queries stay outer-runtime/log-observed
- mutations/actions/MCP execute keep semantic correlation
- `__trellis` stays out of query args
- future Convex observability primitives are integration opportunities, not reasons to reopen the old generic metadata design
