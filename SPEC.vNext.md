# Trellis vNext — North Star Spec

> **Status: Draft (2026-04-16).**
>
> This file is a separate design document. It does **not** replace [SPEC.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC.md) yet.
>
> It exists to answer a different question:
>
> **What should Trellis become if the goal is a general application layer for Nuxt + Convex + Better Auth, with first-class agent support from day 1?**
>
> This draft is intentionally honest about maturity:
>
> - **Grounded in the repo today:** Nuxt runtime, auth integration, guarded backend handlers, multi-tenant examples, MCP runtime, destructive confirmation flows, testing helpers, component-bridge experiments.
> - **Design direction, not yet proven in code:** simplified core setup, runtime-enforced service safety, a cleaner operation-to-agent binding contract, a smaller first-class surface.

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
- destructive confirmation flow
- replay protection
- audit trail
- principal forwarding into Convex

This is the differentiator:

**Trellis should make agent access feel like part of the app model, not a bolt-on transport.**

## 8. Scope Tiers

Trellis should be explicit about what belongs in which tier.

### 8.1 Core

Must feel excellent and stable:

- `defineTrellis(...)`
- protected builders: `query`, `mutation`, `publicQuery`, `publicMutation`, `internalQuery`, `internalMutation`, `action`
- principal and actor resolution
- tenant rules
- `ctx.db`, `ctx.db.crossTenant`, `ctx.db.raw`
- `ctx.runAsUser(...)`, `ctx.runAsService(...)`
- `defineOperation(...)`
- Nuxt composables and SSR integration
- `defineMcpApp(...)`
- `tool(...)` and `tool.fromOperation(...)`
- destructive confirmation + replay protection + audit

### 8.2 Built-ins

Useful, but not identity-defining:

- `defineWebhook(...)`
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

The happy path should not require raw builder injection.

Target shape:

```ts
// convex/trellis.ts
import { defineTrellis } from '@lupinum/trellis/functions'
import { principal } from './auth/principal'
import { actor } from './auth/actor'
import { tenant } from './auth/tenant'

export const trellis = defineTrellis({
  principal,
  actor,
  tenant,
})

export const {
  query,
  mutation,
  publicQuery,
  publicMutation,
  internalQuery,
  internalMutation,
  action,
  raw,
} = trellis
```

Advanced injection can still exist:

```ts
defineTrellis.advanced({
  builders: { query, mutation, internalQuery, internalMutation, action },
  principal,
  actor,
  tenant,
})
```

But that should be the exception, not the tutorial path.

## 12. Protected Builders

The backend core should revolve around these builders:

- `query`
- `mutation`
- `publicQuery`
- `publicMutation`
- `internalQuery`
- `internalMutation`
- `action`
- `raw.*`

### 12.1 Meaning

- `query` / `mutation`
  actor required
- `publicQuery` / `publicMutation`
  actor optional
- `internalQuery` / `internalMutation`
  internal visibility, still Trellis-aware
- `action`
  Trellis-aware server-side execution with explicit identity forwarding
- `raw`
  true escape hatch

The rule stays:

**internal is visibility, raw is policy bypass.**

## 13. The `ctx` Contract

The default `ctx` should be small and legible:

```ts
type TrellisCtx = {
  principal: Principal
  actor: Actor | null

  requireActor(): Actor
  enforce(check: Guard | boolean | Promise<boolean>): Promise<void>

  db: AppDb & {
    crossTenant: AppDb
    raw: AppDb
  }

  runAsUser(fn, args): Promise<unknown>
  runAsService(fn, args, options): Promise<unknown>
}
```

The key is not type cleverness. The key is that a user can understand the runtime in one minute.

## 14. Tenancy

Trellis should treat multi-tenancy as a core application concern, not an example-side convention.

Target shape:

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
- `ctx.db.crossTenant` is the visible, audited bypass for admin and operator flows
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

If Trellis claims safe destructive agent execution, then destructive tools must be operation-backed.

No exceptions on the default path.

## 16. Runtime-Enforced Operation Binding

The no-manifest direction is attractive, but the safety contract must stay intact.

Trellis must prove that the operation metadata and the executed function ref actually match.

Target design:

- every operation has a stable `id`
- `mutation(op.execute)` stamps that `id` into Trellis metadata on the generated ref
- `query(op.preview)` stamps the same `id`
- `tool.fromOperation(op, { ref })` validates `ref.operationId === op.id` at startup

That restores the missing safety property without bringing back a full AST-walk manifest pipeline.

If Convex ref metadata cannot support this cleanly, Trellis should prefer a small generated index over a brittle “trust the user wiring” model.

The framework should choose **correctness over cleverness** here.

## 17. Actions and Identity Forwarding

Explicit identity forwarding should stay central.

```ts
await ctx.runAsUser(internal.reports.record, { id })
await ctx.runAsService(internal.billing.recordWebhook, payload, {
  service: 'stripe-webhook',
})
```

This is the correct design shape because:

- it is explicit
- it is greppable
- it does not hide trust boundaries
- it unifies action, webhook, and agent-to-backend flows

Implicit propagation should remain unsupported.

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
- replay protection
- audit

That is enough to honestly say Trellis has first-class agent support.

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
2. issue confirmation token
3. re-run validation inside a single execute mutation
4. redeem replay token
5. write audit event
6. execute handler

This is one of Trellis’ strongest differentiators and should remain a pillar.

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

The current “narrow service actors” idea is directionally right but too soft if it remains advisory.

If Trellis wants to present webhooks, schedulers, and service contexts as safe defaults, it needs runtime-enforced service policy.

Target shape:

```ts
export const services = defineServices({
  'stripe-webhook': {
    access: {
      tables: ['subscriptions', 'payments'],
      tenant: 'derived',
    },
  },
  scheduler: {
    access: {
      tables: ['jobs', 'auditLog'],
      tenant: 'global',
    },
  },
})
```

Trellis should consume this directly, not hope users remember to inspect `actor.allowedTables`.

If Trellis cannot enforce it, it should stop advertising it as a security property.

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
2. Can operation-to-ref identity be enforced without reviving a heavy manifest pipeline?
3. Can service access constraints be enforced by runtime policy instead of actor convention?
4. Can the agent runtime stay first-class while sessions/resources/prompts remain optional layers?
5. Can webhooks compile down to the same trust model as `runAsService(...)` without becoming a separate runtime?

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

