# RFC: Agent-First Runtime For Trellis

Status: Proposed  
Owner: Trellis  
Audience: Trellis maintainers, downstream package authors, app teams using Trellis with Convex and MCP

---

## 1. Summary

This RFC defines the next architecture for Trellis:

- `Principal` becomes a first-class runtime seam.
- `Actor` remains app-owned and is derived from the principal.
- `createApp(...)` grows to own internal builders through the same structural auth pipeline.
- `defineOperation(...)` remains the desired protected business definition, but it is not the first release gate.
- MCP tools project existing Convex operations instead of duplicating business logic.
- Trusted caller is demoted from architecture to transport detail.
- Actor-level capability snapshots and resource-level `_can` become explicitly separate concepts.
- Trellis owns secure component-bridge primitives, while apps/packages own their bridge inventory.
- `defineTool()` remains a first-class API for standalone Nitro-native tools.

This RFC is informed by the current Trellis codebase and by the real downstream evolution of
`ginko-cms`, which independently converged toward explicit principal forwarding and away from
trusted-caller-centric architecture.

---

## 2. Problem Statement

Trellis already has strong backend primitives:

- structural guards
- `guard/load/authorize/handler`
- shared schema DX
- MCP tooling

But the current system still has an architectural mismatch:

1. **Agents are not first-class callers.** MCP identity is still modeled in user-shaped terms.
2. **There are two authorization mental models.**
   - Convex handlers use `guard/load/authorize`
   - MCP tools use `auth/check/scoped/resolveAuth`
3. **Trusted caller transport does too much architectural work.**
4. **Convex component boundaries force repetitive principal-forwarding boilerplate in downstream packages.**

The result is visible in the current `ginko-cms` integration:

- Trellis MCP auth is bypassed in favor of package-local auth/runtime wrappers.
- MCP uses a deploy-key admin client and app-owned principal forwarding.
- Component bridging required a generated `_principal.ts` helper and a large `ginkoCmsMcp.ts` mapping file.
- Those bridge files are duplicated again in `consumer-site`, which means the framework cost is
  being paid by every downstream, not just by the package author.

The system works, but the framework is no longer owning the right seams.

Important nuance:

- the current Trellis MCP model is still ergonomic for non-component apps and for Nitro-native tools
- the architectural mismatch becomes severe once Convex components and package-owned principal
  forwarding enter the picture

This RFC should fix the component-heavy path without making the simple `defineTool()` path worse.

---

## 3. Goals

- Make browser users, services, and agents first-class callers.
- Unify business authorization around one backend model.
- Make MCP a projection layer, not a second business-logic surface.
- Keep business auth out of transport adapters.
- Support Convex components without every downstream reinventing principal forwarding.
- Improve conceptual simplicity even when the number of files does not materially decrease.
- Remove duplicated downstream glue that Trellis should own, especially bridge helpers and
  package-local MCP auth wrappers.

---

## 4. Non-Goals

- Do not build a full workflow engine.
- Do not build a generic agent orchestration framework.
- Do not preserve long-term dual APIs for the same concept.
- Do not make Trellis own app-specific authorization policy.
- Do not try to make one handler body run in both Nitro and Convex contexts.
- Do not require a framework-owned canonical principal union for every app.

---

## 5. Current System: What Exists Today

## 5.1 Trellis today

Current Trellis backend auth is centered on `createApp(...)`, structured handlers, and optional
trusted-caller transport. Public/query/mutation builder support is strong. Internal builders are not
owned by the same abstraction yet.

Current MCP support centers on `defineTool()`, which owns:

- auth resolution
- visibility
- confirmation
- rate limiting
- schema conversion
- result envelopes
- Convex call helpers

This made sense when MCP was treated as a standalone surface. It is the wrong shape once MCP becomes
a projection of existing business operations.

## 5.2 ginko-cms today

`ginko-cms` already evolved past the current Trellis architecture:

- It defines an explicit principal union.
- It resolves actor from principal in the Convex component.
- It disables Trellis trusted-caller on the component path.
- It uses a deploy-key-based Nitro admin caller for MCP → Convex internal calls.
- It wraps Trellis `defineTool()` with package-local helpers because the built-in MCP auth model is
  no longer the right one for the package.
- It code-generates bridge files because Trellis does not own the component boundary primitive.

This is the most important signal in this RFC:

**the downstream independently built the architecture Trellis should provide.**

The strongest single indicator is the `defineCmsMcpTool()` pattern:

- it takes Trellis `defineTool()`
- disables Trellis auth/scoping behavior
- replaces the Convex call path with a package-owned admin client

When a downstream has to nullify most of a framework primitive to get the right architecture, the
framework is centered on the wrong seam.

---

## 6. Core Design

### 6.1 Principal

`Principal` is transport-level caller identity.

The shape is **app-owned**.

Trellis should provide:

- `definePrincipal(...)`
- principal-aware runtime plumbing
- helpers for browser/server/component forwarding

Trellis should **not** require one canonical global principal union.

Illustrative example only:

```ts
type Principal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; sessionId?: string }
  | { kind: 'service'; service: string }
  | {
      kind: 'agent'
      agent: string
      credentialId: string
      sessionId?: string
      runId?: string
      onBehalfOf?: { kind: 'user'; userId: string } | { kind: 'tenant'; tenantId: string }
    }
```

`ginko-cms` already proves that downstreams may want a different shape such as:

```ts
type CmsPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'mcp'; mcpKeyId: string }
```

### 6.2 Actor

`Actor` is the app-owned authorization projection derived from the principal.

Examples:

- role
- tenant membership
- plan entitlements
- domain-specific flags

Trellis must never require apps to adopt one actor model.

### 6.3 Operation

`defineOperation(...)` is the desired source of truth for protected business behavior.

It owns:

- args
- guard
- load
- authorize
- preview
- handler

The handler runs in Convex.

Important implementation note:

- Trellis already has a structured `guard/load/authorize/handler` shape today
- the first high-value move is to extend that model across internal builders and component bridges
- `defineOperation(...)` should be introduced only if it is a clear simplification over the existing
  structured handler shape, not just a rename

### 6.4 Projection

MCP is a projection of an existing registered Convex function.

It owns:

- principal resolution from MCP auth
- capability-based visibility
- optional extra `enabled` checks
- confirmation gate
- rate limiting
- MCP schema conversion and result envelope

It does **not** own business logic.

This projection model is the right center of gravity for Convex-backed MCP tools.

It does **not** replace `defineTool()` for standalone Nitro-native tools.

---

## 7. Locked Decisions

## Decision 1: MCP projection API

### Decision

Trellis will introduce a dedicated MCP projection primitive for Convex-backed operations.

Recommended name in this RFC:

```ts
projectTool(...)
```

The exact final public name may be:

- `projectTool(...)`
- `mcp.project(...)`
- or a nearby equivalent

But it is **not** `defineTool()` and does **not** require both operation and function ref.

### Why

The stable execution input on the Nitro side is the registered Convex function reference.
Nitro does not need the operation object at runtime.

Passing both:

- duplicates the source of truth
- invites drift
- makes the architecture look more coupled than it is

### v1 shape

```ts
export default projectTool({
  call: internal.posts.publish,
  preview: internal.posts.previewPublish,
  schema: publishPostArgs,
  capability: 'publishPost',
  meta: {
    name: 'publish-post',
    description: 'Publish a post',
    destructive: true,
  },
})
```

### Important v1 constraint

There is **no manifest-dependent magic in v1**.

Projection metadata is explicit at the tool site:

- schema
- name
- description
- destructive flag
- capability key
- preview ref

Build-time manifest/codegen may be added later as an optimization or ergonomics layer, but it must
not be required for correctness.

### Why not a manifest in v1

Nitro and Convex do not share runtime memory. Anything auto-derived across that boundary requires:

- build-time codegen
- or runtime Convex discovery queries

Neither should be load-bearing in v1.

### Why not `defineTool()` for projections

`defineTool()` today is a standalone tool-definition API. It still assumes the tool owns behavior.
That is the wrong center of gravity for Convex-backed business operations.

### Why not `mcp.project(operation, functionRef, ...)`

Because Nitro does not need the operation object at runtime. Requiring both is redundant.

### Important boundary

`defineTool()` remains first-class and is **not** deprecated by this RFC.

Use:

- `projectTool(...)` for Convex-backed MCP projections
- `defineTool(...)` for Nitro-native standalone tools

---

## Decision 2: one execution ref per operation

### Decision

Default rule:

- one operation
- one registered Convex execution ref
- one MCP projection pointing at that ref

Do not require dual registration by default.

### Default example

```ts
export const publishPostOp = defineOperation({ ... })
export const publishPost = app.internal.mutation(publishPostOp)

export default projectTool({
  call: internal.posts.publishPost,
  schema: publishPostArgs,
  capability: 'publishPost',
  meta: { name: 'publish-post', destructive: true },
  preview: internal.posts.previewPublishPost,
})
```

### When a second ref is allowed

Only when the app intentionally wants a separate callable surface:

- public browser ref
- internal MCP/server ref
- read-only preview ref

This must remain explicit.

### Why

The point of the new architecture is conceptual simplification, not magical file count reduction.
Dual registration by default would add noise back into the center of the API.

---

## Decision 3: `createApp(...)` owns internal builders

### Decision

`createApp(...)` will grow to accept internal builders and return them through the same structural
auth pipeline.

New shape:

```ts
const { app, raw } = createApp(
  {
    query,
    mutation,
    internalQuery,
    internalMutation,
  },
  {
    principal,
    actor,
    tenantIsolation,
    rls,
  },
)
```

Returned shape:

```ts
app.query(...)
app.mutation(...)
app.internal.query(...)
app.internal.mutation(...)

raw.query(...)
raw.mutation(...)
raw.internal.query(...)
raw.internal.mutation(...)
```

### Why

MCP and server-side projections should target internal functions by default.

Those internal functions still need:

- principal resolution
- actor derivation
- tenant isolation
- RLS
- trigger support
- structured guard/load/authorize behavior

If Trellis does not own that surface, every downstream will hand-roll the security-sensitive path.

### Why the extra surface area is justified

This is not adding a second auth model. It is extending the same model across function visibility.

That is the correct framework move.

### Priority

This is one of the highest-value changes in the RFC.

Without it:

- MCP projections still need custom internal builder glue
- component bridges still bypass the main structured pipeline
- downstreams keep hand-rolling sensitive transport code

---

## Decision 4: component bridge ownership

### Decision

Trellis owns the **component bridge primitives**.  
Apps and packages own their **bridge inventory**.

### What Trellis owns

- principal-forwarding helpers for root app → component calls
- internal/public/browser component bridge builders
- optional codegen support for bridge inventories later

### What apps/packages own

- which component functions are exposed
- exported names
- bridge file organization
- package surface

### Why

Convex component constraints are generic framework constraints:

- components cannot access `process.env`
- components do not have `ctx.auth`
- the root app must bridge explicit identity

That means the secure principal-forwarding pattern is not app-specific enough to leave entirely to
downstreams.

### What Trellis should not own

Trellis should not attempt to auto-own every bridge map for every downstream package in v1.
That would hide too much and make review harder.

### Success criterion

The bridge primitive must be strictly better than the current downstream state.

At minimum it should:

- remove the need for hand-rolled `_principal.ts`-style wrappers
- reduce per-operation bridge boilerplate compared with today’s generated bridge files
- keep the forwarded principal path explicit in review

---

## Decision 5: principal forwarding boundary

### Decision

Principal is resolved **once** at the Nitro → root Convex boundary.

The component bridge forwards the same principal unchanged at the root Convex → component boundary.

### Boundary split

**`projectTool` / MCP projection owns:**

- resolve principal from MCP auth
- call root Convex function with `{ ...args, principal }`

**component bridge owns:**

- forward `{ ...args, principal }` into `ctx.runQuery` / `ctx.runMutation`

It does not:

- reconstruct principal
- resolve auth
- inspect shared secrets
- reinterpret `mcpKeyId`

### Why

If both layers interpret auth, the architecture is wrong.

Principal transport should be normalized once, then forwarded.

---

## Decision 6: preview belongs in Convex

### Decision

Preview is part of the operation. Nitro only orchestrates preview-vs-execute.

Preferred eventual extraction primitive:

```ts
previewOf(operation)
```

### v1 constraint

`previewOf(...)` is **not** load-bearing for the first release.

The architectural requirement is:

- preview logic belongs in Convex-side business code
- Nitro should call an explicit preview ref when one exists

Whether v1 uses:

- `previewOf(operation)`
- a manually registered preview function
- or another equivalent extraction helper

should remain open until the typing story is proven.

### Semantics of `previewOf()`

`previewOf(operation)` runs:

- guard
- load
- authorize
- preview

It does **not** run:

- handler

### Duplicate work

Yes, preview and execute may duplicate `load`.
That is accepted in v1.

Correctness is more important than speculative cross-request caching.

### Why

Useful previews often need real data:

- titles
- counts
- consequences
- affected resources

That belongs in Convex-side business logic, not Nitro-side callbacks.

### Open technical risk

If `previewOf(operation)` turns out to be awkward because a mutation-shaped business definition must
produce a query-shaped registration target, Trellis should ship the architecture first and the
convenience extractor later.

---

## Decision 7: actor-level vs resource-level capabilities are separate

### Decision

Trellis will distinguish:

- actor-level capability snapshots for MCP visibility/discoverability
- resource-level capabilities for `_can` attachment in queries

These are separate primitives.

### v1 guidance

Prefer clarifying and reusing existing Trellis patterns first:

- actor-level permission snapshots / permission context for discoverability
- resource-level `defineCapabilities(...).attach(...)` for `_can`

Do not introduce a second parallel capability API in v1 unless the existing primitives prove
insufficient.

### Actor-level capability snapshot

```ts
const actorCapabilities = defineActorCapabilitySet({
  publishPost: (actor) => actor.role === 'editor' || actor.role === 'admin',
  deletePost: (actor) => actor.role === 'admin',
})
```

This is used for:

- MCP tool visibility
- high-level discoverability
- “what can I do?” responses

### Resource-level `_can`

```ts
const postCapabilities = defineCapabilities<Post>()({
  publish: (actor, post) =>
    actorCapabilities.check(actor, 'publishPost') && post.status === 'draft',
  delete: (actor, post) =>
    actorCapabilities.check(actor, 'deletePost') || post.authorId === actor.userId,
})
```

This is used for:

- UI button affordances on concrete records
- response decoration

### Why

Tool visibility is decided before a resource is loaded.
Resource-level `_can` is decided after a resource is loaded.

These are different questions.

---

## Decision 8: capability vs enabled

### Decision

`capability` is the common-case visibility gate.
`enabled` is the escape hatch.

If both are present, both must pass.

Semantics:

```ts
visible =
  capabilityCheck &&
  enabledCheck
```

### `capability`

Shorthand for actor-level capability snapshot visibility.

Example:

```ts
capability: 'publishEntry'
```

### `enabled`

Escape hatch for logic that is not authorization:

- feature flags
- environment modes
- deployment configuration
- temporary kill switches
- provider availability

Example:

```ts
enabled: ({ runtime }) =>
  runtime.flags.contentPublishing !== false &&
  runtime.mcpMode !== 'readOnly'
```

### Why

`capability` should stay ergonomic for the common case.
`enabled` should stay available for non-permission logic.

---

## Decision 9: capability snapshot resolution

### Decision

Capability snapshots are resolved **once per principal/session/request context**, not per tool.

The MCP runtime owns this.

### Runtime shape

```ts
export default defineMcpRuntime({
  resolvePrincipal,
  callConvex,
  resolveCapabilities: async ({ principal, convex }) => {
    return await convex.query(internal.permissions.getActorCapabilities, { principal })
  },
})
```

Then `projectTool({ capability: 'publishEntry' })` checks the resolved snapshot locally.

### Why

This avoids per-tool roundtrips while preserving a single source of truth for actor-level visibility.

### Important rule

Capability snapshots are **advisory for visibility only**.
Execution is still enforced by the operation’s `guard/load/authorize` path in Convex.

### Freshness tradeoff

Snapshots may become stale across a long session after role or membership changes.

That is acceptable only because:

- they are advisory for visibility
- execution is still re-checked in Convex

If snapshot invalidation becomes expensive or confusing in real apps, the runtime must bias toward
freshness over fewer roundtrips.

---

## 8. API Shapes

## 8.1 Backend runtime

```ts
const principal = definePrincipal({
  resolve: async (ctx, args) => {
    // Browser root path: derive from ctx.auth
    // Server/MCP/component path: read args.principal
  },
})

const actor = defineActor({
  fromPrincipal: async (ctx, principal) => {
    // app-owned actor derivation
  },
})

const { app, raw } = createApp(
  {
    query,
    mutation,
    internalQuery,
    internalMutation,
  },
  {
    principal,
    actor,
    tenantIsolation: { tables: ['posts', 'comments'] },
  },
)
```

`Principal` here is app-defined. The example shape is illustrative, not mandated by Trellis.

## 8.2 Operation definition

```ts
export const publishPostOp = defineOperation({
  args: publishPostArgs,
  guard: canPublishPost,
  load: async (ctx, args) => {
    const post = await ctx.db.get(args.postId)
    return { post }
  },
  authorize: {
    check: (actor, loaded) => actor.tenantId === loaded.post.workspaceId,
  },
  preview: async (_ctx, _args, { post }) => ({
    summary: `Publish "${post.title}"`,
  }),
  handler: async (ctx, _args, { post }) => {
    // business logic
    return { postId: post._id, published: true }
  },
})
```

## 8.3 Convex registration

```ts
export const publishPost = app.internal.mutation(publishPostOp)
export const previewPublishPost = app.internal.query(previewOf(publishPostOp))
```

If `previewOf(...)` is not ready in the first release, `previewPublishPost` may be an explicitly
registered internal query with equivalent semantics.

## 8.4 MCP runtime

```ts
export default defineMcpRuntime({
  callConvex: createDeployKeyConvexCaller(),

  resolvePrincipal: async (event) => {
    const auth = await consumeMcpBearerToken(event)
    return {
      kind: 'agent',
      agent: 'mcp',
      credentialId: auth.mcpKeyId,
      sessionId: getMcpSessionId(event),
    }
  },

  resolveCapabilities: async ({ principal, convex }) => {
    return await convex.query(internal.permissions.getActorCapabilities, { principal })
  },

  runtime: async () => ({
    flags: {
      contentPublishing: true,
    },
    mcpMode: 'readWrite',
  }),
})
```

The deploy-key admin client pattern is already proven in `ginko-cms`.

## 8.5 MCP projection

```ts
export default projectTool({
  call: internal.posts.publishPost,
  preview: internal.posts.previewPublishPost,
  schema: publishPostArgs,
  capability: 'publishPost',
  enabled: ({ runtime }) =>
    runtime.flags.contentPublishing !== false &&
    runtime.mcpMode !== 'readOnly',
  meta: {
    name: 'publish-post',
    description: 'Publish a post',
    destructive: true,
  },
  rateLimit: { max: 5, window: '1m' },
})
```

## 8.6 Non-Convex standalone MCP tool

```ts
export default defineTool({
  name: 'check-dns',
  schema: checkDnsSchema,
  handler: async (args, ctx) => {
    // Nitro-native business logic
  },
})
```

This remains an important first-class path. The RFC is not trying to force every MCP tool through a
Convex projection abstraction.

## 8.7 Component bridge

```ts
const component = createComponentBridge({
  query,
  mutation,
  internalQuery,
  internalMutation,
})

export const publishEntry = component.internalMutation({
  component: components.ginkoCms.entries.publishEntry,
  args: publishEntryArgs.args,
  returns: publishResultValidator,
})

export const previewPublishEntry = component.internalQuery({
  component: components.ginkoCms.entries.previewPublishEntry,
  args: publishEntryArgs.args,
  returns: previewResultValidator,
})
```

Bridge invariant:

- whatever `principal` arrives from the root function is forwarded unchanged to the component call

---

## 9. Before / After

## 9.1 Before: current Trellis MCP model

```ts
export default defineTool({
  schema: publishEntryArgs,
  auth: 'required',
  scoped: true,
  check: (actor) => actor.role === 'editor',
  handler: async (args, ctx) => {
    return await ctx.mutation(api.entries.publish, args)
  },
})
```

Problems:

- MCP owns a second auth model
- tool and backend auth drift
- trusted-caller transport leaks into architecture
- component-based downstreams bypass this entirely

## 9.2 After: projection model

```ts
// Convex
export const publishEntryOp = defineOperation({ ... })
export const publishEntry = app.internal.mutation(publishEntryOp)
export const previewPublishEntry = app.internal.query(previewOf(publishEntryOp))

// MCP
export default projectTool({
  call: internal.entries.publishEntry,
  preview: internal.entries.previewPublishEntry,
  schema: publishEntryArgs,
  capability: 'publishEntry',
  meta: { name: 'publish-entry', destructive: true },
})
```

Benefits:

- one business auth model
- MCP does not duplicate behavior
- preview stays with business logic
- visibility is explicit and cheap

Non-goal:

- this does not necessarily reduce the number of files involved in a feature
- the win is that each file has a cleaner responsibility boundary

---

## 10. End-to-End Example: ginko-cms-style publish entry

This is the canonical test flow.

## Files

1. shared schema
2. component operation
3. root bridge entry
4. MCP projection
5. MCP runtime

### 10.1 Shared schema

```ts
// shared/schemas/editor.ts
export const publishEntryArgs = defineArgs({
  description: 'Publish a CMS entry',
  args: {
    entryId: v.string(),
  },
})
```

### 10.2 Component operation

```ts
// src/component/entries/publish.ts
export const publishEntryOp = defineOperation({
  args: publishEntryArgs,
  guard: canPublishEntry,
  load: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId)
    requireRecord(entry, 'Entry')
    return { entry }
  },
  authorize: {
    check: (actor, loaded) => actor.tenantId === loaded.entry.workspaceId,
  },
  preview: async (_ctx, _args, { entry }) => ({
    summary: `Publish "${entry.title}"`,
  }),
  handler: async (ctx, _args, { entry }) => {
    return { entryId: entry._id, published: true }
  },
})

export const publishEntry = principalApp.mutation(publishEntryOp)
export const previewPublishEntry = principalApp.query(previewOf(publishEntryOp))
```

As above, `previewPublishEntry` may be an explicitly registered preview query in the first release if
`previewOf(...)` is not yet finalized.

### 10.3 Root bridge entry

```ts
// convex/ginkoCmsMcp.ts
export const publishEntry = component.internalMutation({
  component: components.ginkoCms.entries.publishEntry,
  args: publishEntryArgs.args,
  returns: publishResultValidator,
})

export const previewPublishEntry = component.internalQuery({
  component: components.ginkoCms.entries.previewPublishEntry,
  args: publishEntryArgs.args,
  returns: previewResultValidator,
})
```

### 10.4 MCP projection

```ts
// server/mcp/tools/publish-entry.ts
export default projectTool({
  call: internal.ginkoCmsMcp.publishEntry,
  preview: internal.ginkoCmsMcp.previewPublishEntry,
  schema: publishEntryArgs,
  capability: 'publishEntry',
  meta: {
    name: 'publish-entry',
    description: 'Publish a CMS entry',
    destructive: true,
  },
})
```

### 10.5 MCP runtime

```ts
// server/trellis/mcp-runtime.ts
export default defineMcpRuntime({
  callConvex: createDeployKeyConvexCaller(),
  resolvePrincipal: async (event) => {
    const auth = await consumeMcpBearerToken(event)
    return {
      kind: 'mcp',
      mcpKeyId: auth.mcpKeyId,
    }
  },
  resolveCapabilities: async ({ principal, convex }) =>
    await convex.query(internal.permissions.getActorCapabilities, { principal }),
})
```

## Runtime flow

### Preview

1. MCP client calls `publish-entry`
2. Nitro runtime resolves principal
3. Nitro runtime resolves actor-level capability snapshot once
4. `projectTool` checks `capability` + `enabled`
5. tool is destructive and unconfirmed, so projection calls preview ref
6. root internal query receives `{ entryId, principal }`
7. component bridge forwards `{ entryId, principal }` unchanged
8. component query runs `guard -> load -> authorize -> preview`
9. Nitro wraps preview result as MCP confirmation response

### Execute

1. MCP client confirms `publish-entry`
2. Nitro runtime resolves the same principal shape
3. projection calls execution ref
4. root internal mutation receives `{ entryId, principal }`
5. component bridge forwards `{ entryId, principal }`
6. component mutation runs `guard -> load -> authorize -> handler`
7. Nitro wraps success result as MCP output

This is the intended final separation of concerns.

Developer-experience expectation:

- file count may stay similar
- duplicate auth logic should disappear
- bridge files should become smaller and more mechanical
- downstream packages should stop needing to replace Trellis MCP auth with local wrappers

---

## 11. Feature Map

## Operation owns meaning

- args
- guard
- load
- authorize
- preview
- handler

## Projection owns MCP transport

- rate limiting
- confirmation gate
- result envelope
- schema conversion for MCP
- capability visibility
- `enabled` escape hatch
- tool metadata

## Projection deliberately does not own

- arbitrary business middleware
- DB access for business preview
- app-domain authorization logic

Standalone `defineTool()` remains available for tools that are not projections of Convex operations.

---

## 12. Migration Plan

## Phase 1

- introduce `Principal`
- extend `createApp(...)` to own internal builders
- add `definePrincipal(...)`
- keep current public handler path working

## Phase 2

- introduce `createComponentBridge(...)`
- move component principal forwarding into Trellis-owned primitives
- validate the new bridge against `ginko-cms` and `consumer-site`

## Phase 3

- introduce `defineMcpRuntime(...)`
- introduce `projectTool(...)`
- keep `defineTool()` as the first-class standalone Nitro-native path
- document migration from existing Convex-backed `defineTool()` usage to `projectTool(...)`

## Phase 4

- introduce `defineOperation(...)` if it is a clear simplification over the existing structured
  handler object
- prototype `previewOf(...)`
- register operations through `app.query/mutation/internal.query/internal.mutation`

## Phase 5

- add actor-level capability snapshots
- clarify separation from resource-level `_can`
- prefer reuse of existing permission-context and `defineCapabilities(...)` patterns before adding
  new capability APIs

## Deferred

- `AgentRun`
- storage-backed policy interfaces beyond the initial MCP runtime configuration seam
- build-time MCP manifest/codegen

---

## 13. Risks

These are real risks, not blockers.

### Risk 1: bridge completeness

If bridge inventory remains app-owned, packages with many MCP tools may still want codegen support to
avoid missing bridge entries.

Related risk:

- if `createComponentBridge(...)` is not materially better than today’s generated bridge files, the
  RFC has not moved the developer experience forward enough

### Risk 2: file count

The number of files per operation may not decrease much.
The win is conceptual:

- no auth logic in projection
- no auth logic in bridge
- preview in Convex
- one business-auth model

### Risk 3: `previewOf()` typing

`previewOf(operation)` must produce a query-shaped registration target from an operation that may
otherwise be executed as a mutation. This needs explicit type design.

Mitigation:

- treat `previewOf(...)` as a spike/prototype item before locking the public API
- do not block the rest of the architecture on this helper

### Risk 4: projection API naming

The exact public API name (`projectTool`, `mcp.project`, etc.) still needs product judgment.

### Risk 5: capability snapshot staleness

Actor-level visibility snapshots may go stale after role changes, membership changes, or policy
updates during a long-lived session.

This is acceptable only if:

- execution remains fully enforced in Convex
- stale visibility is documented as advisory behavior

### Risk 6: migration clarity

Existing `defineTool()` users need a clear migration story for Convex-backed tools.

Without that:

- the architecture stays conceptually split on paper
- downstreams will continue mixing old and new patterns indefinitely

---

## 14. Rejection Criteria

Reject this RFC if implementation proves any of the following:

- MCP projection ends up reintroducing a second business-logic surface.
- Internal builders in `createApp(...)` significantly increase maintenance complexity without reducing downstream auth glue.
- Component bridge primitives cannot stay transport-only.
- Actor-level capability snapshots become too expensive or too stale to be useful.
- The architecture adds more custom app code than it removes in real downstreams.
- `createComponentBridge(...)` is not materially better than today’s `_principal.ts` plus generated
  bridge-file approach.
- Non-component `defineTool()` usage becomes less ergonomic or harder to explain.

---

## 15. Why This Is The Right Direction

Because it matches all the real learnings:

- `ginko-cms` already proved principal-first transport is better than trusted-caller-centric business interfaces.
- `ginko-cms` already proved MCP should be a thin execution layer over Convex business logic.
- Convex component constraints force explicit bridging, so the framework should own the secure primitive.
- Preview belongs with business meaning.
- Capability visibility and `_can` are different runtime concerns and should stop being conflated.
- the current `defineTool()` path already works well for standalone tools, so Trellis can narrow the
  change to the part of the architecture that is actually under strain

The result is not “an agent framework.”

It is a cleaner Trellis:

- browser users and agents are both first-class callers
- Convex remains the business-logic execution environment
- Nitro remains the transport/projection environment
- the framework owns the hard boundary mechanics
- apps still own their domain model

That is the right level of ambition.
