# Trellis Dream Spec

## Agent-First Runtime, Without Becoming "An Agent Framework"

Status: Draft  
Scope: Trellis vNext architecture  
Audience: Trellis maintainers, app authors, downstream packages like `ginko-cms`

---

## 1. Why This Spec Exists

Trellis already has the right instinct:

- structural auth
- composable backend primitives
- shared schema DX
- MCP as a first-class integration point

But after building a real MCP-heavy system across `trellis`, `ginko-cms`, and a consumer app, one limitation is now clear:

**Trellis still treats agents as a special transport around a user-centric core, instead of treating agents as first-class principals in the runtime model.**

That shows up in three places:

1. MCP identity is still mostly represented as `{ userId, role, tenantId }`.
2. MCP tool auth and Convex handler auth use different mental models.
3. Trusted-caller transport is doing too much architectural work.

This spec proposes a hard-cut redesign that keeps Trellis small and composable while making agentic workflows a native concept.

---

## 2. Design Thesis

### Core claim

Trellis should model:

- **principal**: who or what is making the call
- **actor**: the app-domain projection of that principal
- **operation**: the protected unit of business behavior

Everything else is an adapter:

- browser auth
- MCP auth
- trusted caller transport
- cron jobs
- webhooks
- internal server calls

### Short version

- `principal` becomes the runtime truth
- `actor` becomes a derived app concept
- `operation` becomes the shared access model for browser, server, and MCP
- trusted caller becomes a transport detail, not a foundational identity concept

### Product philosophy

The right Trellis move is not to add "agent subsystems."

It is to make the existing primitives:

- more explicit
- more uniform
- more orthogonal

That is the Vite/Vue/Nuxt version of this design:

- one obvious center of gravity
- thin adapters
- no duplicated conceptual surface

---

## 3. Goals

- Make agent callers first-class, not disguised users.
- Unify browser/server/MCP/backend access control around one operation model.
- Eliminate hidden auth transport from app-domain business logic.
- Preserve Trellis's structural safety and composable-primitives philosophy.
- Support real multi-step agent workflows without introducing a giant orchestration framework.
- Make downstream packages like `ginko-cms` simpler, not more abstract.

---

## 4. Non-Goals

- Do not build a full agent orchestration engine.
- Do not add a generic workflow DAG framework.
- Do not preserve backward compatibility through dual paths unless explicitly required.
- Do not make Trellis own app-specific authorization policy.
- Do not make MCP-specific APIs the center of the runtime.

---

## 5. Learnings From The Current System

### What worked

- `createApp(...)` and structured handlers are the right backend center.
- `guard/load/authorize` is a strong model for app-domain authorization.
- shared schemas across browser/backend/MCP are a real advantage.
- capabilities and redaction are the right shape for visibility.
- `ginko-cms` improved materially when it moved from ambient auth and shared-secret assumptions toward explicit principal forwarding.
- `ginko-cms` independently evolved toward the principal model this spec proposes. `CmsPrincipal = CmsAnonymousPrincipal | CmsUserPrincipal | CmsMcpPrincipal` emerged organically in `shared/principal.ts`, with `getBrowserPrincipal()` and `getMcpPrincipal()` in the Convex bridge. The downstream built what Trellis should have provided.

### What broke down

- MCP identity was too user-shaped. `McpAuthIdentity` is `{ role, userId, tenantId? }` — there is no way to represent a non-user caller.
- trusted-caller transport leaked into architecture. `_trustedCallerKey`, `_trustedCaller`, and `_trustedCallerExpectedKey` appear in Convex function args. Business handlers touch shared secrets.
- MCP tools had their own access-control DSL (`auth`, `check`, `scoped`, `resolveAuth`) separate from handler auth (`guard/load/authorize`). Two mental models for the same problem.
- `ginko-cms` bypassed Trellis's MCP auth entirely — `defineCmsMcpTool` sets `auth: 'none'` and `scoped: false`, does its own auth via `requireMcpAuth()`, and uses a deploy-key admin client to call internal Convex functions. The framework's MCP auth was not usable for its primary downstream.
- The Convex component boundary forced a 470-line auto-generated bridge file (`ginkoCmsMcp.ts`) that wraps every component function with `mcpKeyId` injection. This is the largest source of MCP boilerplate in `ginko-cms`, and the spec must address it.
- workflow state existed only as low-level session KV, not as a modeled run identity.
- agent permissions were executable, but not easily discoverable.

---

## 6. Proposed Changes

## Change 1: Make `principal` the core runtime concept

### Spec

Introduce a first-class principal model in Trellis:

```ts
type Principal =
  | { kind: 'anonymous' }
  | { kind: 'user', userId: string, sessionId?: string }
  | { kind: 'service', service: string }
  | {
      kind: 'agent',
      agent: string,
      credentialId: string,
      sessionId?: string,
      runId?: string,
      onBehalfOf?: { kind: 'user', userId: string } | { kind: 'tenant', tenantId: string },
    }
```

Runtime context becomes:

```ts
ctx.principal(): Promise<Principal>
ctx.actor(): Promise<TActor | null>
```

Rules:

- `principal` is transport-level identity.
- `actor` is the app's authorization model derived from the principal.
- actor resolution must be app-owned.
- no caller supplies a final actor directly.

### Design constraint: Convex delivers principal via args

Convex handlers receive `(ctx, args)`. The only information channels are `ctx.auth` (browser sessions) and function arguments. There is no ambient request context, no HTTP headers, no middleware chain inside Convex.

This means:

- In **root-app Convex functions**: principal can come from `ctx.auth` (browser) or from args (server/MCP calls). `definePrincipal.resolve(ctx, args)` unifies both paths.
- In **component Convex functions**: principal always comes from args, because components cannot access `ctx.auth` or `process.env`. The root app must bridge.
- `definePrincipal` is not a transport layer — it is the app's contract for **interpreting what transport delivered** into args. The transport populates `args.principal`; the resolver reads it.

This is not an open question. It is a constraint of the Convex runtime. `ginko-cms` already works this way: `contextArgs: cmsPrincipalValidators` injects the principal field, and `getActor(ctx, args)` reads `args.principal`.

### Hypothesis

If Trellis models `principal` explicitly, then:

- browser, MCP, internal server, webhook, and cron calls can share one runtime contract
- agent access can be reasoned about without pretending every caller is a user
- downstream packages will delete auth wrappers instead of adding them

### Gains

- explicit trust boundaries
- less auth ambiguity
- better auditability
- easier support for future principals without redesign

### Tradeoffs

- introduces one more concept for app authors
- actor builders become slightly more advanced
- hard-cut migration for any code that assumes "actor is always user-shaped"

### Rejection criteria

Reject this change if:

- principal and actor cannot be kept cleanly separate in real apps
- app authors end up passing actor-like data back into principal APIs
- the model creates more ceremony than deleted code

### Proof requirements

- one browser flow, one MCP flow, one internal server flow, and one cron/webhook flow all resolve through the same principal contract
- no auth path requires pretending an agent is a user
- a downstream app can derive app actor from `principal.kind === 'agent'` without custom Trellis patches

---

## Change 2: Unify handlers and MCP tools under one `operation` model

### The hard design question

Convex handlers get `ctx.db` — direct database access. MCP tool handlers get `ctx.query()/ctx.mutation()` — remote function calls over HTTP. These are fundamentally different execution contexts.

A `defineOperation` that contains a single `handler` body cannot serve both without forcing apps into a repository pattern they don't want. This was the missing piece in the initial draft.

### Resolution: the operation IS the Convex definition; MCP is a projection

The operation contains the full Convex-side definition: args, guard, load, authorize, handler. The handler runs in Convex with DB access. `mcp.tool()` creates a thin projection that calls the registered Convex function and formats the response.

This matches what `ginko-cms` already does organically: the Convex component handler has the full `guard/load/authorize/handler` pipeline, and MCP tools are thin wrappers that call the Convex function and format responses. The MCP tool does not duplicate business logic — it delegates.

### Spec

Define the operation as a Convex-side unit:

```ts
const publishPost = defineOperation({
  args: publishPostArgs,
  guard: canPublishPost,
  load: async (ctx, args) => { ... },
  authorize: { check: (actor, loaded) => ... },
  handler: async (ctx, args, loaded) => { ... },
})
```

Register it as a Convex function:

```ts
export const publish = app.mutation(publishPost)
```

Project it as an MCP tool — the adapter calls the registered Convex function, no handler body needed:

```ts
export default mcp.tool(publish, {
  name: 'publish-post',
  destructive: true,
  preview: async (args, ctx) => `Publish "${args.title}"`,
})
```

For public/read operations with no guard:

```ts
const listPosts = defineOperation({
  args: listPostsArgs,
  guard: open,
  handler: async (ctx, args) => { ... },
})

export const list = app.query(listPosts)
export default mcp.tool(list, { name: 'list-posts' })
```

This spec intentionally does **not** lock in `mcp.tool(functionRef)` as the only valid public API.
The important requirement is architectural:

- the MCP surface projects an existing protected Convex operation
- the MCP surface does not duplicate business handler bodies
- metadata stays explicit enough to review and debug

The final API might be:

- `mcp.tool(functionRef, metadata)`
- `mcp.project(operation, functionRef, metadata)`
- or another thin projection helper

The MCP adapter's responsibilities:

- resolve principal from MCP auth, forward to Convex function via principal args
- wrap response in structured envelope (`ok/error`)
- add confirmation gate for destructive tools
- derive tool visibility from operation's guard metadata
- add tool-specific metadata (name, annotations, input examples)

What disappears:

- separate MCP auth DSL (`auth`, `check`, `scoped`, `resolveAuth`) for the same business operation
- duplicated safety concepts expressed differently in handlers vs tools
- hand-written MCP handler bodies that just call Convex functions
- in `ginko-cms`: much of the 470-line auto-generated `ginkoCmsMcp.ts` bridge file and the `defineCmsMcpTool` wrapper

### Non-Convex MCP tools

Tools that are not Convex-backed (filesystem operations, external API calls, MCP-native functionality) cannot use `defineOperation`. A standalone tool definition API remains necessary for these. The current `defineTool()` shape is appropriate here — it just stops being the primary path for Convex-backed business operations.

### Hypothesis

If Trellis uses one operation model, then:

- app and MCP access control become the same design problem
- MCP tools become generated projections, not hand-written wrappers
- permission bugs caused by drift between handler and tool definitions decrease
- the largest boilerplate in downstream packages (MCP bridge files) can shrink dramatically

### Gains

- one mental model
- one review surface
- MCP tools as thin metadata/projection, not duplicated business code
- smaller downstream packages

### Tradeoffs

- some existing `defineTool()` ergonomics will need rethinking
- non-Convex MCP tools use a separate path
- migration will be a hard cut for current MCP helper APIs
- the final MCP projection API must resolve principal and call Convex functions — this transport work needs to be correct and debuggable

### Rejection criteria

Reject if:

- the shared operation abstraction becomes too generic and loses clarity
- non-Convex MCP tools become awkward or second-class
- adapters require too much hidden magic to stay ergonomic
- public/guard-free operations gain ceremony compared to today's `app.query({...})`

### Proof requirements

- one real business action can be exposed as browser mutation and MCP tool from the same operation definition
- the MCP tool requires only metadata (name, destructive flag), not a handler body
- tool-specific concerns (preview, confirmation) remain additive, not dominant
- the new API deletes net code in `ginko-cms`
- bridge code becomes materially smaller even if some component-boundary mapping still remains
- a public read operation (no auth, no guard) works with no more ceremony than today

---

## Change 3: Demote trusted caller from architecture to transport

### Current state: ginko-cms already validates this

`ginko-cms` disabled Trellis's trusted-caller (`trustedCaller: false`) and built its own principal forwarding via `contextArgs: cmsPrincipalValidators`. The component's `getActor(ctx, args)` reads `args.principal` — it never touches `_trustedCallerKey` or shared secrets. This proof requirement is already passing in production code.

### Spec

Trusted-caller support remains available, but only as an implementation detail for explicit-principal transport.

New rule:

- app/business code does not think in terms of trusted callers
- app/business code thinks in terms of principals
- trusted-caller verification, deployment auth, headers, or shared keys only exist in transport adapters

Transport output:

```ts
resolvePrincipal(event) -> Principal
forwardPrincipal(...) -> Principal payload
```

Not:

```ts
inject _trustedCaller into business args
```

### The Convex component boundary

The component boundary is `ginko-cms`'s largest practical constraint. Components cannot access `process.env` or browser auth. The root app must bridge every call.

Today this means:

1. The root app reads browser auth or MCP auth → constructs a principal
2. The root app calls the component function with the principal in args
3. The component resolves actor from the principal

In the current system, this bridging is split across:

- `convex/ginkoCms/_principal.ts` — `browserComponentQuery`, `browserComponentMutation`, `internalMcpComponentQuery`, `internalMcpComponentMutation`
- `convex/ginkoCmsMcp.ts` — 470 lines of auto-generated wrappers, one per MCP operation
- `src/runtime/server/mcp/_shared/internal-convex.ts` — deploy-key admin client for MCP → Convex calls

The dream-state version:

- `createApp` accepts `principal` and `contextArgs` at the Trellis level
- the MCP adapter constructs and forwards the principal automatically
- component bridge functions are generated from operation definitions, or reduced to thin mappings when the MCP projection API handles the call directly
- no shared secrets in business args — the deploy key or trusted-caller verification stays in the transport adapter

### Hypothesis

If trusted caller stops being a first-class business concept, then:

- components and internal wrappers become simpler
- shared-secret transport can be replaced per environment without redesign
- apps can move between server auth strategies without rewriting authorization logic
- the bridge file boilerplate in component-based packages shrinks dramatically, even if some root-app forwarding remains unavoidable

### Gains

- clearer separation of concerns
- less secret leakage into business interfaces
- less Convex-args auth ceremony
- fewer auto-generated bridge files

### Tradeoffs

- transport layers need more explicit responsibility
- old examples/docs become obsolete
- some current convenience helpers disappear
- the Convex component boundary still requires principal in args — this is a Convex constraint, not a Trellis design choice

### Rejection criteria

Reject if:

- explicit principal transport creates more duplication than current trusted-caller injection
- component/server boundaries still require secrets in args
- the component bridge file cannot be significantly reduced

### Proof requirements

- a full MCP flow can authenticate and execute without any business handler reading trusted-caller args
- a root-app -> component call can use explicit principal forwarding without shared-secret verification in component business code
- `ginko-cms`'s bridge file (`ginkoCmsMcp.ts`) is reduced to a thin, non-auth-aware mapping, or absorbed into a Trellis-owned projection path

---

## Change 4: Add `AgentRun` as the single workflow-state primitive

**Status: Deferred until a real use case forces the shape.**

Changes 1–3 and 5 are all driven by demonstrated pain in the current codebase. `AgentRun` is not — `ginko-cms` does not use `useMcpSession()`, and no downstream has yet built ad hoc run tracking that this would replace. The primitive is directionally right, but designing it without a forcing function risks building the wrong abstraction.

Include this change when a real multi-step agent workflow in `ginko-cms` or a consumer app demonstrates the need. Until then, keep `useMcpSession()` as the low-level escape hatch.

### Spec

Do not build a workflow engine.

Add one runtime primitive:

```ts
type AgentRun = {
  runId: string
  principal: Principal
  sessionId?: string
  startedAt: number
  metadata: Record<string, unknown>
}

useAgentRun(): {
  run: AgentRun
  get(key)
  set(key, value)
  remove(key)
  listArtifacts()
}
```

This should layer on top of storage, not invent a scheduler or graph executor.

Responsibilities:

- identify the current agent run
- persist bounded working context
- allow idempotency/checkpoint keys
- attach provenance to writes/audit events

This replaces the current "just a session KV store" mindset of `useMcpSession()`.

### Hypothesis

If Trellis offers run-level state instead of only session-level KV, then:

- multi-step agent workflows become easier without framework bloat
- idempotency and audit become natural
- apps stop inventing their own incompatible session/run tracking

### Gains

- workflow continuity
- better audit trail
- better support for long-lived or resumable agent work

### Tradeoffs

- storage semantics need clear limits
- run lifecycle is harder than simple session storage
- must avoid turning into a job runner

### Rejection criteria

Reject if:

- app authors start using it as a generic datastore
- lifecycle semantics become too ambiguous
- the primitive cannot stay small and composable

### Proof requirements

- a multi-step MCP workflow can store progress, idempotency keys, and small artifacts through one Trellis primitive
- downstream code deletes ad hoc run/session storage helpers

---

## Change 5: Make capabilities discoverable, not just attachable

### Spec

Keep `defineCapabilities(...)`, but extend the model so capability information can power:

- UI affordances
- MCP tool visibility
- agent planning/discovery

Add a capability introspection layer:

```ts
defineCapabilitySet({
  createPost: canCreatePost,
  publishPost: canPublishPost,
  deletePost: canDeletePost,
})
```

This powers:

- `_can` on returned resources
- tool visibility metadata
- "what can I do?" responses for agents

### Hypothesis

If capabilities become inspectable instead of only executable, then:

- agents stop probing tools blindly
- UIs and MCP surfaces converge on one discoverability model
- permission decisions become easier to explain

### Gains

- better UX for both humans and agents
- reduced failed tool calls
- one place to encode action affordances

### Tradeoffs

- capability naming becomes part of public architecture
- risk of over-modeling tiny apps

### Rejection criteria

Reject if:

- capability introspection duplicates existing permission context without adding value
- apps mostly need bespoke visibility logic instead

### Proof requirements

- an agent session can receive a capability summary without executing the protected mutation
- UI `_can` and MCP tool visibility can be generated from the same source

---

## Change 6: Replace in-memory MCP-only infrastructure with storage-backed policy interfaces

### Spec

Current MCP support exposes:

- in-memory rate limiting
- session storage as raw Nitro storage

That is fine for demos, not for serious agent traffic.

Introduce interfaces, not frameworks:

```ts
interface RateLimitStore { ... }
interface PrincipalResolver { ... }
interface AgentRunStore { ... }
interface AuditSink { ... }
```

Defaults can remain local/in-memory for dev.
Production paths should accept Nitro storage / Redis / app-owned implementations.

### Hypothesis

If Trellis makes agent infrastructure pluggable instead of hardcoded, then:

- multi-instance deployments become viable
- downstream apps can adopt agent workflows without forking Trellis internals

### Gains

- production viability
- clearer contracts
- easier testing

### Tradeoffs

- more interfaces to design
- bad abstractions here would be costly

### Rejection criteria

Reject if:

- abstractions are too generic to be useful
- default implementations become too weak to represent intended usage

### Proof requirements

- rate limiting and run state can be backed by shared storage without changing app code
- defaults remain easy for local dev

---

## 7. Proposed Public API Shape

## Backend runtime

```ts
// Principal resolution: interprets what transport delivered into args
const principal = definePrincipal({
  resolve: async (ctx, args) => {
    // Browser: derive from ctx.auth
    // Server/MCP: read from args.principal (populated by transport adapter)
    // Component: always from args.principal
  },
})

const actor = defineActor({
  fromPrincipal: async (ctx, principal) => { ... },
})

const { app, mcp } = createApp(query, mutation, {
  principal,
  actor,
  tenantIsolation: { tables: ['posts', 'comments'] },
})
```

## Protected operation (guard + load + authorize + handler)

```ts
export const publishPost = defineOperation({
  args: publishPostArgs,
  guard: canPublishPost,
  load: async (ctx, args) => {
    const post = await ctx.db.get(args.postId)
    return { post }
  },
  authorize: {
    check: (actor, loaded) => isOwner(actor, loaded.post),
  },
  handler: async (ctx, args, loaded) => { ... },
})
```

## Public operation (no auth, no guard)

```ts
export const listPosts = defineOperation({
  args: listPostsArgs,
  guard: open,
  handler: async (ctx, args) => { ... },
})
```

## Convex registration + MCP projection

```ts
// Convex: register as a mutation (handler runs here with ctx.db)
export const publish = app.mutation(publishPost)

// MCP: thin projection — calls the Convex function, no handler body needed
export default mcp.tool(publish, {
  name: 'publish-post',
  destructive: true,
  preview: async (args, ctx) => `Publish "${args.title}"`,
})

// Public read — equally simple
export default mcp.tool(list, { name: 'list-posts' })
```

## Non-Convex MCP tool (standalone, for tools that don't wrap Convex operations)

```ts
export default defineTool({
  name: 'check-dns',
  schema: checkDnsSchema,
  handler: async (args, ctx) => { ... },
})
```

## Discoverability

```ts
const capabilities = defineCapabilitySet({
  publishPost: canPublishPost,
  deletePost: canDeletePost,
})
```

---

## 8. Migration Strategy

This spec assumes a hard cut, not a compatibility layer.

### Phase 1

- add `principal` runtime concept
- add explicit principal resolution in `createApp`
- keep existing actor resolution through a compatibility shim internally only during development

### Phase 2

- introduce `defineOperation`
- make `app.query/app.mutation` and `mcp.tool` consume operation definitions
- freeze old `defineTool()` and trusted-caller-centered examples

### Phase 3

- replace old MCP auth model with principal-based model
- remove `scoped` and user-shaped MCP auth assumptions
- integrate capability introspection
- move docs/examples to agent-first language

### Phase 4 (deferred until use-case-driven)

- add `useAgentRun` when a real multi-step agent workflow forces the shape
- replace in-memory MCP infrastructure with storage-backed interfaces when production agent traffic demands it

### Hard-cut rule

Do not preserve two long-term parallel APIs.

If `defineOperation` wins, old `defineTool` architecture should be retired, not co-maintained indefinitely.

---

## 9. How We Prove This Is The Right Direction

This spec is correct only if it deletes more complexity than it adds.

We should prove it with real downstream tests, not philosophy alone.

## Proof track A: Ginko

Rebuild the current `ginko-cms` MCP stack against the new primitives and verify:

- fewer wrappers
- no secrets in business args
- explicit principal-derived actor resolution
- no separate MCP auth DSL

Behavior targets:

- bridge code is materially smaller
- MCP auth is resolved by Trellis primitives instead of package-local wrappers
- individual MCP tool files become metadata/projection only, not duplicated handler logic
- downstream principal types can either collapse into Trellis `Principal` or become thin app aliases over it

Success metric:

- net reduction in auth/MCP bridge code
- same or better security properties

## Proof track B: Multi-tenant workspace reference app

Port a Trellis example and verify:

- browser users and MCP agents share one access model
- capabilities drive both UI and tool visibility
- tenant isolation still feels structural, not magical

## Proof track C: Workflow state

Implement one real multi-step agent workflow and verify:

- run continuity
- audit provenance
- idempotency
- no custom app-built workflow glue required

## Proof track D: API ergonomics

Interview the API using the Trellis philosophy test:

- can a single file explain who can call this and why?
- can an MCP tool be understood without chasing hidden auth transport?
- can a reviewer spot the trust boundary from the signature?

If the answer is no, the design is wrong.

## Proof track E: Component boundary

Verify that Convex component packages can use the new primitives without excessive bridging:

- a component can accept `Principal` as a standard arg type
- the root app can forward principal to a component without auto-generating per-function wrappers
- the MCP projection API can target a component function through the root app without a large manual bridge layer
- the pattern works for both public (no principal) and authenticated (principal required) operations

---

## 10. Open Questions

### Resolved

1. ~~Should `principal` be resolved entirely in transport, or can Convex handlers derive it from args plus context?~~
   **Resolved: Convex handlers derive principal from args.** This is a constraint of the Convex runtime, not a design choice. Transport populates `args.principal`; `definePrincipal.resolve(ctx, args)` interprets it. See Change 1, "Design constraint."

2. ~~Should `defineOperation` be the only way to define protected actions, or should low-level structured handlers remain publicly available?~~
   **Resolved: both remain available.** This follows Trellis's progressive disclosure philosophy. Simple apps that only use browser access should not be forced into the operation model. `defineOperation` is for operations that need to be projected into multiple surfaces. Direct `app.query`/`app.mutation` with `guard/load/authorize` remains the simple path.

### Open

3. Should `service` and `agent` remain separate principal kinds, or should `agent` be a specialization of `service`? (Leaning toward separate: a service is machine-to-machine with no session; an agent has a session, may act on behalf of someone, and has different authorization profiles.)
4. Should capability introspection be explicit opt-in or always derivable from named guards?
5. Should `useAgentRun()` be MCP-only at first, or generic across scheduled/internal workflows? (Deferred — see Change 4.)
6. What is the right public MCP projection API? Is it `mcp.tool(functionRef, metadata)`, `mcp.project(operation, functionRef, metadata)`, or something else?
7. How should the MCP projection API resolve principal and call the Convex function? Does it use the deploy key (like `ginko-cms` today), the trusted-caller transport, or a new mechanism?
8. Can the MCP projection API derive tool metadata (description, arg schema, annotations) from the operation definition, or does some metadata always need to be specified at the tool site?
9. Should the component bridge pattern (`browserComponentQuery`, `internalMcpComponentQuery`) be absorbed into Trellis, or remain app-owned? `ginko-cms` built these independently — if other component-based packages need them, Trellis should own them.

---

## 11. Decision Summary

### We should do now

- principal-first runtime (empirically validated by `ginko-cms`)
- actor as app-owned projection (already working in `ginko-cms`)
- shared operation model with MCP as projection
- trusted caller as transport detail (already proven by `ginko-cms` disabling it)
- capability discoverability
- drastically reduce component bridge boilerplate, without assuming it can always disappear completely

### We should do when use cases demand it

- `AgentRun` workflow-state primitive (deferred until a forcing function appears)
- storage-backed infrastructure interfaces (deferred until production agent traffic)

### We should not do

- a giant workflow framework
- more MCP-only concepts
- more secret-based business interfaces
- dual-path long-term API compatibility
- agent abstractions that bypass app-owned authorization
- a single handler body that tries to work in both Convex and Nitro contexts

---

## 12. Final Position

The future-facing version of Trellis is not:

"a Vue/Nuxt/Convex auth + MCP helper library."

It is:

**a principal-oriented application runtime where browser users and agents are both first-class callers, and where the same business operation can be safely projected into UI, server, and tool surfaces without changing its authorization model.**

That is the right level of ambition.

Small enough to stay Trellis.  
Strong enough to matter.
