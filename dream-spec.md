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

### What broke down

- MCP identity was too user-shaped.
- trusted-caller transport leaked into architecture.
- MCP tools had their own access-control DSL (`auth`, `check`, `scoped`, `resolveAuth`) separate from handler auth.
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

### Spec

Introduce a shared operation definition layer:

```ts
const createPost = defineOperation({
  args: createPostArgs,
  guard: canCreatePost,
  load: async (ctx, args) => { ... },
  authorize: { check: (actor, loaded) => ... },
  preview: async (ctx, args, loaded) => ...,
  handler: async (ctx, args, loaded) => { ... },
})
```

Then expose thin adapters:

```ts
app.query(createPostReadOperation)
app.mutation(createPost)
mcp.tool(createPost)
server.action(createPost)
```

Adapter responsibilities:

- browser/server adapters choose transport shape
- MCP adapter adds result envelope, confirmation gate, tool metadata
- backend app adapter binds to Convex builder

What disappears:

- separate MCP auth DSL for the same business operation
- duplicated safety concepts expressed differently in handlers vs tools

### Hypothesis

If Trellis uses one operation model, then:

- app and MCP access control become the same design problem
- MCP tools become smaller and less bespoke
- permission bugs caused by drift between handler and tool definitions decrease

### Gains

- one mental model
- one review surface
- easier code sharing
- smaller downstream MCP wrappers

### Tradeoffs

- some existing `defineTool()` ergonomics will need rethinking
- tools that are not Convex-backed still need a generic path
- migration will be a hard cut for current MCP helper APIs

### Rejection criteria

Reject if:

- the shared operation abstraction becomes too generic and loses clarity
- generic MCP-only tools become awkward
- adapters require too much hidden magic to stay ergonomic

### Proof requirements

- one real business action can be exposed as browser mutation and MCP tool from the same definition
- tool-specific concerns remain additive, not dominant
- the new API deletes net code in a real downstream package

---

## Change 3: Demote trusted caller from architecture to transport

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

### Hypothesis

If trusted caller stops being a first-class business concept, then:

- components and internal wrappers become simpler
- shared-secret transport can be replaced per environment without redesign
- apps can move between server auth strategies without rewriting authorization logic

### Gains

- clearer separation of concerns
- less secret leakage into business interfaces
- less Convex-args auth ceremony

### Tradeoffs

- transport layers need more explicit responsibility
- old examples/docs become obsolete
- some current convenience helpers disappear

### Rejection criteria

Reject if:

- explicit principal transport creates more duplication than current trusted-caller injection
- component/server boundaries still require secrets in args

### Proof requirements

- a full MCP flow can authenticate and execute without any business handler reading trusted-caller args
- a root-app -> component call can use explicit principal forwarding without shared-secret verification in component business code

---

## Change 4: Add `AgentRun` as the single workflow-state primitive

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
const principal = definePrincipal({
  resolve: async (ctx, args) => { ... },
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

## Shared operation

```ts
export const publishPost = defineOperation({
  args: publishPostArgs,
  guard: canPublishPost,
  load: async (ctx, args) => { ... },
  authorize: {
    check: (actor, loaded) => ...
  },
  preview: async (ctx, args, loaded) => ({
    summary: `Publish "${loaded.post.title}"`,
  }),
  handler: async (ctx, args, loaded) => { ... },
})
```

## Adapters

```ts
export const publish = app.mutation(publishPost)
export default mcp.tool(publishPost, {
  name: 'publish-post',
  destructive: true,
})
```

## Workflow state

```ts
const run = useAgentRun()
await run.set('draftPlan', plan)
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
- add `useAgentRun`

### Phase 4

- integrate capability introspection
- move docs/examples to agent-first language

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

---

## 10. Open Questions

These are real design questions, not placeholders:

1. Should `principal` be resolved entirely in transport, or can Convex handlers derive it from args plus context?
2. Should `service` and `agent` remain separate principal kinds, or should `agent` be a specialization of `service`?
3. Should capability introspection be explicit opt-in or always derivable from named guards?
4. Should `useAgentRun()` be MCP-only at first, or generic across scheduled/internal workflows?
5. Should `defineOperation` be the only way to define protected actions, or should low-level structured handlers remain publicly available?

---

## 11. Decision Summary

### We should do

- principal-first runtime
- actor as app-owned projection
- shared operation model
- trusted caller as transport detail
- single workflow-state primitive
- capability discoverability
- storage-backed infrastructure interfaces

### We should not do

- a giant workflow framework
- more MCP-only concepts
- more secret-based business interfaces
- dual-path long-term API compatibility
- agent abstractions that bypass app-owned authorization

---

## 12. Final Position

The future-facing version of Trellis is not:

"a Vue/Nuxt/Convex auth + MCP helper library."

It is:

**a principal-oriented application runtime where browser users and agents are both first-class callers, and where the same business operation can be safely projected into UI, server, and tool surfaces without changing its authorization model.**

That is the right level of ambition.

Small enough to stay Trellis.  
Strong enough to matter.
