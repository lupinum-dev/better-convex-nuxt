# Trellis vNext — North Star Spec

> **Status: Draft (2026-04-16).**
>
> This file is a separate design document. It does **not** replace [SPEC.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC.md) yet.
>
> It exists to answer a different question:
>
> **What should Trellis become if the goal is a general application layer for Nuxt + Convex + Better Auth, with first-class agent support from day 1?**

> **Active contract note:** the implementation target is now defined in [VNEXT_RUNTIME_CONTRACT.md](/Users/matthias/Git/0_libs/WORK/trellis/VNEXT_RUNTIME_CONTRACT.md). This draft should not promise runtime APIs that the contract has explicitly cut or deferred.
>
> This draft is intentionally honest about maturity:
>
> - **Grounded in the repo today:** Nuxt runtime, auth integration, guarded backend handlers, multi-tenant examples, MCP runtime, destructive preview flows with a simple confirmation gate, testing helpers, component-bridge experiments.
> - **Design direction, not yet proven in code:** simplified core setup, runtime-enforced service safety, a cleaner operation-to-agent binding contract, a smaller first-class surface.
>
> This is a living document.
>
> It should record four things clearly:
>
> - what Trellis is today
> - what Trellis is trying to become
> - what we plan to build next
> - what we explicitly rejected for now, and why
>
> The point is to stop design drift and repeated arguments from memory.

---

# Part I — Product Direction

## 1. Thesis

**Trellis should be the application layer for Nuxt + Convex apps.**

Not just a Nuxt module.
Not just an auth helper.
Not just an MCP adapter.

The target is broader and sharper:

- **Nuxt** owns the UI runtime, routing, SSR, and client ergonomics.
- **Convex** owns the data and reactive function runtime.
- **Better Auth** owns identity and session infrastructure.
- **Trellis** owns the **application model** that sits across them:
  - caller identity
  - actor resolution
  - tenancy
  - authorization
  - visibility
  - safe server-side actions
  - agent/tool exposure

One sentence for the README:

> **Trellis is the application layer for Nuxt + Convex: auth, tenancy, protected actions, and agent-safe access on top of one shared backend model.**

## 2. What “General Framework” Means Here

Trellis should help build many kinds of apps:

- public content apps
- auth-only personal apps
- workspace apps
- multi-tenant SaaS apps
- internal tools
- CMS and knowledge apps
- apps with AI agents, MCP tools, and safe automations

But “general” does **not** mean “every pattern is first-class.”

Vue and Vite are general because their cores are small, composable, and hard to misuse. Trellis should follow that model:

- small core
- progressive layers
- few primitives
- strong defaults
- explicit escape hatches

## 3. The Core Promise

Trellis succeeds if it makes this true:

**A browser, a Nuxt server route, a webhook, and an AI agent can all hit the same protected backend model without each path inventing its own auth and safety story.**

That is the load-bearing promise.

Everything else is secondary.

## 4. Non-Goals

Trellis is not:

- a replacement for Nuxt
- a replacement for Convex
- a replacement for Better Auth
- an ORM
- a schema DSL
- a workflow engine
- an “AI platform”
- a meta-framework with first-class APIs for every advanced edge case

If a feature does not improve the shared application model, it probably does not belong in Trellis core.

---

# Part II — Design Bar

## 5. The Design Standard

Every first-class Trellis API must clear all of these bars:

1. **Common enough.**
   It appears across multiple real app types, not one showcase example.
2. **Safer by construction.**
   The framework can enforce the safety claim in code, not in docs.
3. **Simpler on the happy path.**
   It removes boilerplate or hidden failure modes from the common case.
4. **Composable.**
   It works with other Trellis primitives instead of creating a side system.
5. **Easy to teach.**
   A new user can understand where it fits in one screen of docs.

If a feature fails these bars, it can still exist, but it should live in a later or advanced tier.

## 6. Design Principles

**One app model, many transports.**
The same business rules should survive browser, server, webhook, and agent entrypoints.

**Prefer runtime-owned wiring.**
Users should not need to import raw Convex builders and hand them back to Trellis on the default path.

**Progressive depth.**
Trellis should work for a small auth-only app and scale to a multi-tenant agent-enabled SaaS app without forcing both to pay the same setup tax.

**Explicit trust boundaries.**
Identity forwarding, tenant bypass, destructive operations, cross-tenant flows, and service calls must be visible in code review.

**No fake safety.**
If Trellis advertises service scope, destructive confirmation, or principal forwarding as safe, that guarantee must be backed by runtime enforcement.

**General through primitives, not surface sprawl.**
The framework should expose a small number of powerful concepts rather than first-class wrappers for every recurring pattern.

## 6.1 Living Document Rules

This repo now uses three documents together:

- [VNEXT_RUNTIME_CONTRACT.md](/Users/matthias/Git/0_libs/WORK/trellis/VNEXT_RUNTIME_CONTRACT.md)
  active implementation truth
- [VNEXT_TRACKING.md](/Users/matthias/Git/0_libs/WORK/trellis/VNEXT_TRACKING.md)
  migration and follow-up checklist
- `SPEC.vNext.md`
  product direction, design rationale, planned next work, and rejected ideas

Rules:

- if it is shipped and supported now, it belongs in the runtime contract
- if it is a design direction, it belongs here with an honest maturity label
- if it is planned next, it should be listed here explicitly
- if it was debated and rejected, that should also be written here explicitly

This is how Trellis avoids split-brain specs.

## 6.1.1 Current Alignment Status

As of 2026-04-16:

- the active runtime contract, tracker, and shipped runtime surface are aligned
- `examples-next/01-kanban-workspace` is a working vNext example
- repo verification is green on the active surface:
  `pnpm lint`, `pnpm test:types`, and `pnpm test`
- cross-tenant examples now use `ctx.db.crossTenant` explicitly instead of relying on older ambiguous raw behavior
- the internal harness is treated as experimental integration infrastructure, not as the product truth source

That means the migration phase is no longer the main work.
The next work is product improvement, not vNext naming cleanup.

## 6.2 Decisions We Are Carrying Forward

These are ideas we are deliberately keeping because they improve the framework without bloating it.

### The Design Bar

Keep:

- common enough
- safer by construction
- simpler on the happy path
- composable
- easy to teach

Why:

- this is the best current filter against framework sprawl
- it forces Trellis to earn new APIs instead of collecting them
- a general framework needs stronger API discipline, not looser API discipline

### The Three-Pillar Framing

Keep:

- app runtime
- Nuxt runtime
- agent runtime

Why:

- it gives Trellis a clean product shape
- it makes agent support first-class without turning every feature into “agent stuff”
- it keeps the docs and examples organized around product surfaces instead of random capabilities

### `display` / `confirm` Split For Destructive Operations

Keep as the next design target for destructive flows:

- `display`
  human-facing summary and warning text
- `confirm`
  stable semantic facts that confirmation logic can hash and validate

Why:

- wording changes should not invalidate destructive confirmations
- semantic changes should invalidate destructive confirmations
- this is a real improvement over one mixed preview payload

### Runtime-Enforced `defineServices(...)`

Keep as a serious next spike:

- runtime-owned service access policy
- explicit allowed tables
- explicit tenant mode
- explicit unrestricted mode only when the app asks for it

Why:

- current service safety is too soft if the runtime does not enforce it
- webhook and scheduler trust boundaries are high-risk parts of the framework
- this is the clearest next place where Trellis can turn a convention into a real safety property

### The Honesty Rule

Keep:

- if Trellis says something is safe, the runtime must enforce it
- if something is only a convention, the docs must call it a convention
- if something is not implemented, it cannot be presented as shipped core reality

Why:

- framework trust is fragile
- overclaimed specs create bad downstream architecture
- this rule protects both users and future maintainers from spec fantasy

## 6.3 Rejected For Now

These ideas are not part of the active vNext direction right now.

### `publicQuery` / `publicMutation`

Rejected for now.

Why:

- they create a second normal builder family
- they make public access feel like a separate subsystem
- `guard: open` is simpler, smaller, and easier to teach

Current rule:

- one builder family
- public access is expressed through guard semantics, not separate builder names

### Zero-Seam `defineTrellis(...)`

Rejected as an active promise for now.

Why:

- Convex still exposes one real seam through `./_generated/server`
- pretending the seam does not exist makes the spec less honest, not more elegant
- the right move is to own everything around the seam instead of lying about the seam

Current rule:

- Trellis owns the runtime shape
- Convex still owns one explicit low-level builder seam

### `runAsUser(...)` / `runAsService(...)` As Core

Rejected as part of the active vNext contract for now.

Why:

- they are not implemented and enforced end-to-end in the current runtime
- they sound elegant, which makes them easy to oversell too early
- unimplemented trust-boundary features are exactly where specs become dangerous

Current rule:

- forwarded execution helpers are future work until they are real runtime guarantees

### Ref-Id Stamping As Settled Core Mechanism

Rejected as current truth for now.

Why:

- it is still a design idea, not a proven implementation contract
- Convex ref metadata may or may not make it robust enough
- the framework should not present one unproven mechanism as solved architecture

Current rule:

- operation binding is enforced today through the naming-based runtime contract in [VNEXT_RUNTIME_CONTRACT.md](/Users/matthias/Git/0_libs/WORK/trellis/VNEXT_RUNTIME_CONTRACT.md)
- stronger identity binding remains open for future spikes

### Replay / Audit / Full Atomic Destructive Flow As Shipped Core

Rejected as a shipped claim for now.

Why:

- the design is strong, but the runtime does not yet document and enforce the whole story as active contract
- destructive safety is too important to leave half-claimed
- “planned” and “guaranteed” must stay separate

Current rule:

- destructive preview flow is real
- replay and audit remain future hardening work until the runtime and docs both prove them

## 6.4 Planned Next

These are the most valuable next spikes for Trellis now that the runtime cutover is done.

### Spike A — `display` / `confirm` Destructive Operations

Goal:

- upgrade destructive previews from one mixed payload to a `display` / `confirm` split

Why next:

- it improves the agent pillar directly
- it sharpens destructive confirmation without inflating the whole framework
- it can be proven in a real example quickly

### Spike B — Runtime-Enforced `defineServices(...)`

Goal:

- turn service safety from advisory convention into a real runtime boundary

Why next:

- this is the clearest missing safety primitive in the current shape
- it affects webhooks, schedulers, and future service automation
- it would materially strengthen the “safe by construction” story

### Spike C — Stronger Operation Identity Binding

Goal:

- decide whether the naming-based `tool.fromOperation(...)` contract is enough long term
- if not, prove a stronger mechanism without reviving a heavy manifest pipeline

Why next:

- this is one of the few remaining places where the active contract may want stronger guarantees
- it should be decided by implementation proof, not by taste

### Spike D — Keep Docs, Examples, And Contract In Sync

Goal:

- make sure future changes land in the contract, tracker, and examples together

Why next:

- Trellis already suffered once from split-brain specs
- a living spec only works if the supporting materials keep pace

---

# Part III — Product Shape

## 7. Trellis Has Three Pillars

### 7.1 App Runtime

This is the protected Convex business layer:

- principal resolution
- actor resolution
- tenant scoping
- protected queries and mutations
- actions and server-side execution
- reusable business operations

### 7.2 Nuxt Runtime

This is the Nuxt-facing DX layer:

- SSR and hydration
- composables
- auth bootstrap
- server helpers
- route protection
- file and upload helpers
- permission context integration

### 7.3 Agent Runtime

This is a real Trellis pillar from day 1, not a plugin afterthought:

- MCP app definition
- tool exposure over the same backend model
- permission-aware tool discovery
- destructive preview plus a simple confirmation gate
- principal forwarding into Convex

This is the differentiator:

**Trellis should make agent access feel like part of the app model, not a bolt-on transport.**

## 8. Scope Tiers

Trellis should be explicit about what belongs in which tier.

### 8.1 Core

Must feel excellent and stable:

- `defineTrellis(...)`
- protected builders: `query`, `mutation`, `internalQuery`, `internalMutation`, `action`
- principal and actor resolution
- tenant rules
- `ctx.db`, `ctx.db.crossTenant`, `ctx.db.raw`
- `defineOperation(...)`
- Nuxt composables and SSR integration
- `defineMcpApp(...)`
- `tool(...)` and `tool.fromOperation(...)`
- destructive confirmation

### 8.2 Built-ins

Useful, but not identity-defining:

- visibility helpers
- testing helpers
- ESLint rules
- small CLI generators

### 8.3 Advanced / Later

Do not let these distort the core:

- component package authoring as a first-class Trellis story
- advanced MCP session systems
- prompts/resources as major headline APIs
- alternate projection systems
- runtime features whose safety depends on bundler caveats

These may still ship. They just should not define the framework’s center of gravity.

---

# Part IV — Mental Model

## 9. The Trellis Model

The whole system should fit in this sequence:

1. A **principal** says how the call arrived.
2. An **actor** says who that principal is in the app.
3. **Tenant rules** decide what data exists for that actor.
4. **Guards** decide whether the action is allowed.
5. **Operations** define reusable business actions.
6. **Nuxt** and **MCP** project the same backend model into different transports.

Everything else is supporting detail.

## 10. One Business Layer

Trellis should stop making users think in separate backend systems:

- browser backend
- webhook backend
- MCP backend
- component backend

There is one backend model.

Different transports should differ in:

- how identity is resolved
- whether the route is public or internal
- whether confirmation is required
- what result envelope is needed

They should **not** differ in business authorization rules.

---

# Part V — Public API Direction

## 11. The Default Backend Entry Point

Current contract:

```ts
// convex/functions.ts
import { defineTrellis } from '@lupinum/trellis/functions'
import {
  action as rawAction,
  internalMutation as rawInternalMutation,
  internalQuery as rawInternalQuery,
  mutation as rawMutation,
  query as rawQuery,
} from './_generated/server'
import { principal } from './auth/principal'
import { actor } from './auth/actor'
import { tenantIsolation } from './auth/tenant'

export const {
  query,
  mutation,
  internalQuery,
  internalMutation,
  action,
  raw,
} = defineTrellis(
  {
    query: rawQuery,
    mutation: rawMutation,
    action: rawAction,
    internalQuery: rawInternalQuery,
    internalMutation: rawInternalMutation,
  },
  {
    principal,
    actor,
    tenantIsolation,
  },
)
```

Trellis still depends on one explicit Convex seam: app-owned imports from `./_generated/server`.
That is acceptable in the active contract. The rest of the runtime shape should stay Trellis-owned.

## 12. Protected Builders

The backend core should revolve around these builders:

- `query`
- `mutation`
- `internalQuery`
- `internalMutation`
- `action`
- `raw.*`

### 12.1 Meaning

- `query` / `mutation`
  structured handler pipeline with explicit guard semantics
- `internalQuery` / `internalMutation`
  internal visibility, still Trellis-aware
- `action`
  Trellis-aware server-side execution
- `raw`
  true escape hatch

The rule stays:

**internal is visibility, raw is policy bypass.**

## 13. The `ctx` Contract

The default `ctx` should be small and legible:

```ts
type TrellisCtx = {
  principal(): Promise<Principal>
  actor(): Promise<Actor | null>

  db: AppDb & {
    crossTenant: AppDb
    raw: AppDb
  }
}
```

Current honesty rule:

- `ctx.db.crossTenant` and `ctx.db.raw` both map to the unwrapped underlying Convex db today
- forwarded execution helpers are deferred until they are actually implemented and enforced

The key is not type cleverness. The key is that a user can understand the runtime in one minute.

## 14. Tenancy

Trellis should treat multi-tenancy as a core application concern, not an example-side convention.

Design direction:

```ts
export const tenant = defineTenant({
  defaultScope: {
    field: 'workspaceId',
    index: 'by_workspace',
    fromActor: (actor) => actor?.workspaceId ?? null,
  },
  tables: {
    todos: true,
    comments: true,
    projects: true,
    workspaces: {
      field: 'organizationId',
      index: 'by_organization',
      fromActor: (actor) => actor?.organizationId ?? null,
    },
  },
})
```

### 14.1 Rules

- scoped tables use index-first enforcement
- compound indexes must start with the scope field
- unscoped tables pass through unchanged unless explicitly overridden
- `ctx.db.crossTenant` is the visible bypass for admin and operator flows
- `ctx.db.raw` bypasses both tenancy and runtime hooks

This should stay first-class because it appears across multiple example families and is a core app concern, not a niche.

## 15. Operations

`defineOperation(...)` should remain the structured primitive for reusable business actions.

Target shape:

```ts
export const deleteRunbook = defineOperation({
  id: 'runbooks.delete',
  kind: 'destructive',
  args: { id: v.id('runbooks') },

  guard: canManageRunbooks,
  load: async (ctx, args) => ({ runbook: await ctx.db.get(args.id) }),
  authorize: ({ runbook }, ctx) => canDeleteRunbook(ctx.requireActor(), runbook),

  preview: async (_ctx, _args, { runbook }) => ({
    display: { summary: `Delete "${runbook.title}"` },
    confirm: { id: runbook._id, title: runbook.title },
  }),

  handler: async (ctx, _args, { runbook }) => {
    await ctx.db.delete(runbook._id)
  },
})
```

### 15.1 Why operations matter

This is where Trellis becomes a general application layer instead of just auth helpers.

Operations are the reusable business seam for:

- admin UI actions
- confirmation dialogs
- webhooks
- CLI-like server flows
- MCP destructive tools

### 15.2 Hard requirement

If Trellis claims safe destructive agent execution, destructive tools must stay operation-backed on the default path.

## 16. Runtime-Enforced Operation Binding

The no-manifest direction is attractive, but the safety contract must stay intact.

Trellis must prove that the operation metadata and the executed function ref actually match.

Shipped design:

- operations used with `tool.fromOperation(...)` must declare a stable `name`
- execute refs must end with that operation name
- preview refs must end with `preview${Capitalize(name)}`
- execute and preview refs must come from the same module
- destructive operations require a preview ref

This is a naming-based runtime contract rather than a manifest.
It is stricter than “trust the user wiring” and simpler than reviving the deleted manifest path.

---

# Part VI — Agent Runtime

## 18. Agent Support Is First-Class

This is not optional for Trellis.

The future-facing product story is:

**the same protected backend model can be projected safely to browsers, servers, and agents.**

That means Trellis should ship with a serious day-1 agent runtime.

## 19. `defineMcpApp(...)`

This should be the center of the agent runtime:

```ts
export default defineMcpApp({
  auth,
  principal,
  capabilities,
  tools,
})
```

Everything else in the agent surface should be layered around that.

## 20. Agent Core

The Trellis agent core should be:

- `defineMcpApp(...)`
- `tool(...)`
- `tool.fromOperation(...)`
- principal forwarding into Convex
- capability-aware tool discovery
- destructive preview / confirmation

Future hardening on top of that core should add:

- replay protection
- audit

That is enough to honestly say Trellis has first-class agent support today, with the harder safety guarantees still called out as future work.

## 21. Agent Extensions

These are useful, but they are not what makes the agent story first-class:

- sessions
- prompts
- resources
- dynamic tool registration
- alternate endpoints or code-mode projections

They can exist as extensions, but they should not complicate the core safety story.

## 22. Destructive Tool Flow

The default destructive path should be:

1. call preview
2. confirm at the transport layer
3. execute the protected mutation

Replay and audit remain future hardening work unless they are implemented and documented as concrete guarantees.

## 23. Agent Identity

The important rule:

**Agents are a transport identity, not the app’s business role model.**

Trellis should resolve:

- the MCP caller as a principal
- then the app-owned actor from that principal
- then the same tenancy and authorization rules as the UI

This keeps the business model unified.

---

# Part VII — Better Auth and Nuxt

## 24. Better Auth Position

Better Auth should be treated as the default identity engine, not as an awkward addon.

Trellis should feel like the best way to use Better Auth with Convex + Nuxt:

- auth bootstrap
- session continuity
- server helpers
- route protection
- actor resolution from session identity

But Trellis should still keep a clean principal interface so identity transport is not hard-coded to one provider forever.

## 25. Nuxt DX

The Nuxt story should feel native:

- composables
- SSR by default
- server helpers
- generated API imports
- clean route protection
- minimal app bootstrap

The user should feel like Trellis belongs in a Nuxt app, not like they are adopting a parallel full-stack framework.

That implies:

- few entry points
- no duplicated runtime concepts between Nuxt and Convex
- app-owned files where business logic lives
- generated or auto-imported surfaces where infrastructure lives

---

# Part VIII — Security and Safety

## 26. Service Safety Must Be Real

Runtime-enforced service policy is still the right design direction.

But it is not part of the active vNext contract yet.
Until it exists in runtime code, Trellis should treat it as deferred work rather than a shipped safety property.

## 27. Safety Claims Must Match Enforcement

This is a hard rule for the whole project:

- if a feature is called safe, the runtime must enforce it
- if a feature is only a convention, docs must call it a convention
- if a design is still experimental, the status must say draft

Overclaiming polish is one of the fastest ways to destroy trust in a framework spec.

---

# Part IX — What Stays Out of Core

## 28. Component Packages Are Not the Center

Component bridges and package-level component apps may still matter.

But they should not define Trellis core unless they prove themselves across multiple real users and examples.

For now:

- keep local bridge patterns as advanced architecture
- do not let packaged-component ergonomics distort the default app story
- do not let Trellis become “a framework for frameworks”

## 29. Bundler-Sensitive Tricks Are Not Good Defaults

A general framework should not make users depend on subtle two-runtime import behavior in the normal path.

If a pattern only works because:

- Nuxt excludes a directory from the client bundle
- server bundling happens not to execute a Convex-only import
- a toolchain happens to tree-shake correctly

then it is not yet a good default.

Trellis should either:

- make that boundary robust and invisible, or
- classify it as advanced mode

## 30. Logging Is Secondary

Observability matters, but it is not part of the identity of Trellis core.

Trellis should support logging and events, but not build the framework around them.

The product story is:

- app model
- safety
- agent support

Not “we also have a sink.”

---

# Part X — Validation Strategy

## 31. Examples Still Matter, But They Need a Clear Job

Examples should not all be allowed to create new first-class surface area.

They should serve three functions:

1. prove the core works across app types
2. reveal friction in the core
3. justify promotion of helpers into first-class APIs

## 32. Example Matrix

The current repo already gives a good spread:

- `01-public-todo`
  public minimal app
- `02-auth-todo`
  auth-only app
- `03-team-workspace`
  protected workspace app
- `04-saas-platform`
  operational SaaS app
- `05-visibility-access`
  advanced access patterns
- `06-multi-workspace`
  multi-tenant / switching
- `07-mcp-reference`
  agent runtime depth
- `08-component-mini-cms`
  advanced boundary experiment

That is enough breadth to shape the framework.

## 33. Promotion Rule

A pattern should become first-class only when:

- it appears across at least two or three example families
- it cannot be expressed cleanly with existing Trellis primitives
- Trellis can enforce its safety contract
- it materially improves the default path

This is how Trellis stays general without becoming bloated.

## 34. What To Prove Next

The next round of design work should validate these questions:

1. Can `defineTrellis(...)` fully own the default builder wiring?
2. Is the naming-based operation binding contract sufficient, or does it eventually need stronger ref metadata?
3. Can service access constraints be enforced by runtime policy instead of actor convention?
4. Can the agent runtime stay first-class while sessions/resources/prompts remain optional layers?
5. What is the minimal webhook story once forwarded service execution is real?

Until those are proven, this document stays draft.

---

# Part XI — Bottom Line

## 35. The Real Product Vision

Trellis should become:

- the cleanest way to build protected Nuxt + Convex apps
- the cleanest way to layer Better Auth into that stack
- the cleanest way to expose the same backend model to agents safely

That is already a big product.

It does not need to own every advanced architecture on day 1.

## 36. Final Shape

If this vision is right, Trellis ends up with:

- a **small core**
- a **serious agent pillar**
- a **Nuxt-native developer experience**
- **real tenancy and auth primitives**
- **operation-backed safe automation**
- a **clear line between core, built-ins, and advanced features**

That is the path to becoming “the Vue framework for Convex + Nuxt + Better Auth”:

not by being bigger,
but by being clearer, stricter, and more composable.
