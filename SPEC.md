# Trellis v2.2 — The Spec

> **Status: Final.** This is the implementation spec for the dev team.
>
> **Supersedes:** spec-v2.md, spec-v2.1.md, and all earlier drafts.
>
> **Changes from v2.1:**
> - Confirmation execution runs in a single atomic Convex mutation (closes TOCTOU gap).
> - Execute path explicitly re-runs `load` before re-authorization and handler.
> - `preview` splits into `display` (UI) and `confirm` (semantic invariants hashed for tokens).
> - `tool.fromOperation()` uses string reference + projected refs + generated manifest for clean Convex/Nuxt boundary.
> - `ctx.runAsService()` helper added for HTTP-action-to-internal flows.
> - `systemPrincipal` precedence fully specified — public client + no auth → anonymous, not service.
> - `defineMcpApp`'s internal `convex` client auto-forwards MCP envelopes.
> - Implementation notes section added for the dev team (Part IV).
>
> **Reading order for implementers:**
> 1. Parts I and II to understand the public API.
> 2. Part III to understand what each part projects to in the user's code.
> 3. Part IV for runtime implementation notes before writing code.
> 4. Part V for migration and Part VI for rationale when decisions are questioned.

---

# Part I — Vision

## 1. Positioning

**Trellis v2.2 is a Convex-native authorization, visibility, and agent-access layer for Nuxt apps.**

It is not a full-stack framework. It is not a replacement for convex-helpers. It is not a new database security model.

- **Convex** gives you the database and the functions.
- **convex-helpers** gives you reusable low-level patterns: custom functions, RLS, triggers, streams, relationships, rate-limiter and migrations components.
- **Trellis** gives you structured authorization, principal-to-actor resolution, permission context, visibility rules, agent-safe tool projection, and trusted principal forwarding across boundaries.

One sentence for the README: *a Convex-native authorization, visibility, and agent-access layer for Nuxt apps.*

## 2. The mental model

The whole system fits in eight lines:

- A **principal** is *how* the request arrived.
- An **actor** is *who* that principal is inside your app.
- **RLS** decides which rows exist for this request.
- **Guards** decide which actions are allowed.
- **Visibility** decides what survives once the row is visible: capabilities and redaction.
- **Permission context** turns those decisions into a client-readable map.
- **MCP** projects the same protected backend into an agent-safe tool surface.
- **Component bridges** carry signed principals across app boundaries.

If a feature doesn't fit somewhere in that list, it probably shouldn't be a first-class Trellis concept.

## 3. Design principles

**Keep the safe path easy.** Public paths, authenticated paths, tenant-scoped paths, bridge calls, and agent calls all need a clear default shape.

**Stay Convex-native.** The default handler shape looks exactly like Convex: `args` plus `handler`. Under the hood, v2.2 is built with `customQuery` / `customMutation`, RLS wrappers, and triggers.

**One right way forward.** Regular queries and mutations are procedural. Reusable multi-surface business operations use `defineOperation`. Destructive MCP tools are operation-backed. No "pick between two styles" for the same use case.

**Separate three different jobs.** Row existence (RLS), action permission (guards), returned-data visibility (capabilities + redaction). Distinct concerns, distinct APIs.

**Delegate infrastructure downward.** Rate limiting, migrations, and audit persistence use Convex ecosystem components. Trellis owns the policy and projection layer.

**Make every boundary explicit.** Anonymous entrypoints, policy bypass, trigger bypass, component trust, destructive agent calls. Each has a visible, greppable syntax.

**Default-on safety, opt-out with intent.** Replay protection, deny-by-default RLS, signed principals, audit redaction, Trellis-awareness on internals, operation backing for destructive tools. Opting out requires explicit code.

**Safety shouldn't depend on users reading docs carefully.** If a framework claim is "agents can't do X," the framework must *prevent* X, not ask every downstream developer to implement prevention correctly.

## 4. Non-goals

v2.2 is not:
- A replacement for convex-helpers.
- A new database security model.
- A new rate limiter, migration engine, or audit storage engine.
- A second policy framework parallel to Convex RLS.
- A meta-framework that needs its own version of every Convex primitive.

---

# Part II — Public API

## 5. Package shape

```txt
@lupinum/trellis/auth        — principals, actors, guards, permission context, tenant rules
@lupinum/trellis/functions   — defineFunctions, defineOperation, previewOf, ctx contract
@lupinum/trellis/visibility  — defineCapabilities, defineRedaction, defineVisibility
@lupinum/trellis/mcp         — defineMcpApp, tool, resource, prompt, mcpKeyAuth
@lupinum/trellis/components  — createComponentBridge, bridge.from, manifest helpers
@lupinum/trellis/args        — defineArgs
@lupinum/trellis/testing     — test helpers
@lupinum/trellis/nuxt        — Nuxt module and composables
```

`definePrincipal` and `defineSystemPrincipal` live in `@lupinum/trellis/auth` (they're authorization concepts). They're re-exported from `@lupinum/trellis/functions` for migration convenience.

## 6. Core server API — `defineFunctions`

`createApp` is replaced by `defineFunctions`, matching the Convex `define*` naming convention.

Called once in `convex/functions.ts`:

```ts
// convex/functions.ts
import { defineFunctions } from '@lupinum/trellis/functions'
import {
  query as rawQuery,
  mutation as rawMutation,
  internalQuery as rawInternalQuery,
  internalMutation as rawInternalMutation,
} from './_generated/server'
import { principal } from './auth/principal'
import { resolveActor } from './auth/actor'
import { systemPrincipal } from './auth/system'
import { tenantRules } from './auth/tenant-rules'
import { auditTriggers } from './audit'

export const {
  query,            // actor required, public client visibility
  mutation,         // actor required, public client visibility
  publicQuery,      // actor optional, public client visibility
  publicMutation,   // actor optional, public client visibility
  internalQuery,    // internal visibility, actor optional, Trellis-wrapped
  internalMutation, // internal visibility, actor optional, Trellis-wrapped
  httpAction,       // HTTP action wrapper providing ctx.runAsService
  raw,              // unwrapped escape hatches
} = defineFunctions(
  {
    query: rawQuery,
    mutation: rawMutation,
    internalQuery: rawInternalQuery,
    internalMutation: rawInternalMutation,
  },
  {
    principal,
    systemPrincipal,      // for non-request execution contexts — see §6.5
    actor: resolveActor,
    rls: tenantRules,
    triggers: auditTriggers,
  },
)
```

### 6.1 What each builder means

- **`query` / `mutation`** — actor required. Public client visibility. Throws at the ctx-input step if actor resolution returns null.
- **`publicQuery` / `publicMutation`** — actor optional. Public client visibility. `ctx.actor` is `Actor | null`; handlers branch. Use for public pages, share-token routes, UI surfaces that show extra controls to authenticated users.
- **`internalQuery` / `internalMutation`** — internal visibility (not callable from the public client). Actor is optional. **Trellis-wrapped**: RLS applies, triggers run, principal forwarding works, service principals resolve automatically (§6.5).
- **`httpAction`** — HTTP action wrapper that provides `ctx.runAsService()` for webhook-style handlers (§10.3).
- **`raw`** — unwrapped builders (`raw.query`, `raw.mutation`, `raw.internalQuery`, `raw.internalMutation`). For escape hatches, advanced testing, and rare migration-style code.

### 6.2 Visibility vs. policy — the critical distinction

**"Internal" is a visibility concept. "Raw" is a policy concept.** They are not the same.

An internal function isn't callable from the public client — that's visibility. It still deserves RLS, triggers, and audit because internal orchestration code is often where cross-tenant operations happen. A raw function bypasses the framework entirely — that's policy. Reserve it for migrations, integrity repair, and trigger recursion avoidance.

Earlier drafts conflated these. v2.2 separates them: `internalQuery` / `internalMutation` stay Trellis-aware; `raw.internalMutation` is the one door that bypasses. Grep finds every raw call in code review.

### 6.3 `publicQuery` / `publicMutation` semantics

"Public" means "callable from the public client." Actor may or may not be present. A logged-in user hitting a share-token route is still a public client. A public article page that shows extra controls to authenticated viewers is still public.

**Do not** use `publicMutation` for webhooks or trusted server-to-server calls. Those go through `httpAction` handlers that validate the payload and call an `internalMutation` with a service principal via `ctx.runAsService()` (§10.3). Putting webhooks on `publicMutation` is a security footgun — the public client convention means anyone can call it.

### 6.4 Public-only apps stay simple — with a dev warning

If no actor resolver is configured, `query` and `mutation` behave like their public variants — `ctx.actor` is `null` and RLS degrades to whatever rules the user supplied.

This keeps small examples small. But `defineFunctions` emits a dev-mode warning when no actor resolver is configured, pointing at the migration path. **The docs teach `publicQuery` for public surfaces from day one**, even in the smallest examples. The runtime convenience exists for low-friction starts; the mental model in the docs stays consistent.

### 6.5 Service principals for non-request contexts

Convex internal functions get called from scheduled jobs, cron, actions, the dashboard, the CLI, and HTTP actions. None of those carry user auth. Without a fallback, deny-by-default RLS would cause every backfill and cron job to hit an empty db, pushing users toward `rawDb` for normal work.

`systemPrincipal` resolves in **non-request contexts only** where no ambient auth exists and no principal envelope has been forwarded.

```ts
// convex/auth/system.ts
import { defineSystemPrincipal } from '@lupinum/trellis/auth'

export const systemPrincipal = defineSystemPrincipal({
  resolve: (ctx) => {
    // Users can inspect context hints and return a specific service kind.
    return { kind: 'service', service: 'system' }
  },
})
```

Default if omitted: `{ kind: 'service', service: 'system' }`.

**Resolution precedence order** (implementers: follow this order exactly):

1. **Forwarded principal envelope** → consumed by the target adapter (bridge or MCP) *before* reaching the user resolver. Never reaches the general principal resolver. See §10.
2. **Ambient auth present** → `{ kind: 'user', userId }` (or whatever shape the principal resolver returns).
3. **Request origin with no ambient auth** → `{ kind: 'anonymous' }`. This is for public client calls where the user isn't logged in.
4. **Non-request execution context with no auth** → `systemPrincipal.resolve(ctx)`. Scheduler, cron, CLI, dashboard, HTTP actions calling internals.

**Critical:** public unauthenticated client calls resolve to `anonymous`, not `service`. The service fallback is reserved for non-request contexts. The framework detects this via Convex runtime hints (`ctx.scheduler` presence, request origin metadata, action context, etc.).

### 6.6 Service actor scoping — docs guidance

**Service actors should be narrowly scoped.** A `stripe-webhook` service actor should only touch subscription tables, not the entire database. Examples and documentation show narrow service actors — not `{ kind: 'service', service: 'system' }` with god-like reach.

```ts
// Good — narrow scope
case 'service': {
  if (principal.service === 'stripe-webhook') {
    return { kind: 'service', allowedTables: ['subscriptions', 'payments'] }
  }
  if (principal.service === 'scheduler') {
    return { kind: 'service', allowedTables: ['backgroundJobs', 'auditLog'] }
  }
  return null  // unknown service — deny
}
```

Deny-by-default RLS plus narrow service actors means scheduled jobs can only touch what they need, and admin backfills pass through the audit trail.

## 7. The ctx contract

```ts
type TrellisCtx<TPrincipal, TActor> = {
  // Identity — values, not async accessors.
  principal: TPrincipal
  actor: TActor | null             // non-null in query/mutation; nullable in public*/internal*

  // Convenience: throws if actor is null, returns it otherwise.
  requireActor(): NonNullable<TActor>

  // Authorization — the universal primitive.
  enforce(guard: Guard<TActor | null> | boolean | Promise<boolean>): Promise<void>

  // Visibility helpers.
  attach<T>(value: T, capabilities: CapabilityResolver<TActor | null, T>):
    Promise<T & { __can: Record<string, boolean> }>
  redact<T>(value: T, redaction: RedactionResolver<TActor | null, T>):
    Promise<unknown>
  applyVisibility<T>(value: T, visibility: Visibility<TActor | null, T>):
    Promise<unknown>

  // Database — three doors.
  db: DatabaseReader | DatabaseWriter         // RLS + triggers (default)
  unsafeDb: DatabaseReader | DatabaseWriter   // bypass RLS, triggers still run
  rawDb: DatabaseReader | DatabaseWriter      // bypass RLS AND triggers (rare, docs warn)
}
```

### 7.1 Three database doors

- **`db`** — RLS-wrapped, trigger-aware on mutations. Default. 99% of handlers use this.
- **`unsafeDb`** — bypasses RLS, triggers still run. Admin operations, onboarding before the actor has a tenant, cross-tenant reporting. Still audited.
- **`rawDb`** — bypasses RLS *and* triggers. Data migrations, avoiding trigger recursion, integrity repair, low-level testing. Rare. Docs display a warning banner.

All three are greppable. If someone bypasses policy, audit, or both, the choice is visible in code review.

### 7.2 Trigger composition semantics

When a write fires a trigger, which db does the trigger callback see?

- **Trigger fired by `ctx.db`** → callback sees `ctx.db`. Its writes go through RLS and can fire further triggers.
- **Trigger fired by `ctx.unsafeDb`** → callback sees `ctx.unsafeDb`. Writes bypass RLS but still fire triggers.
- **Trigger fired by `ctx.rawDb`** → callback does not fire. `rawDb` bypasses the trigger layer entirely.
- **Inside any trigger callback, `ctx.innerDb`** (convex-helpers convention) is available to perform writes that don't fire further triggers. Use this to avoid recursion when a trigger updates a denormalized field.

Audit triggers that want to record writes from both `db` and `unsafeDb` paths should use `ctx.innerDb` inside their callback (to avoid recursion) and should run in both paths. Policy bypass should not mean "skip the audit trail" — that's the whole reason `unsafeDb` and `rawDb` are separate doors.

### 7.3 Resolution uses raw access internally

Actor resolution often reads `users`, `memberships`, or `workspaceMembers` *before* the actor exists. If the resolver used the RLS-wrapped `db`, it would deadlock against its own rules.

The framework internally uses `raw.db` during principal and actor resolution, then swaps in the wrapped `db` for the handler. User code never thinks about this — the `ctx` passed to `resolveActor` is already raw.

## 8. Handler shape — procedural, one right way

Every regular `query`, `mutation`, `publicQuery`, `publicMutation`, `internalQuery`, `internalMutation` uses the same shape: `args` and `handler`.

```ts
export const createTodo = mutation({
  args: createTodoArgs.args,
  handler: async (ctx, args) => {
    await ctx.enforce(canCreateTodo)

    return await ctx.db.insert('todos', {
      title: args.title,
      workspaceId: ctx.actor.tenantId,
      ownerId: ctx.actor.userId,
      completed: false,
      createdAt: Date.now(),
    })
  },
})
```

Two keys, `args` and `handler`, exactly like Convex.

### 8.1 The honest tradeoff

Earlier drafts kept both a procedural shape and a declarative `guard/load/authorize/handler` shape, citing Vue's dual APIs as precedent. The comparison cuts the other way: Vue's dual API is a common source of confusion for new users. Mixed codebases, contradicting tutorials, perpetual "which should I use?" questions.

The declarative shape had one property procedural doesn't: top-level `guard:` keys were structurally visible to static analysis. A reviewer could grep for `guard:` and find every authorization decision.

v2.2 replaces that with an eslint rule enforcing that every `mutation` handler calls `ctx.enforce()` at least once. The rule pattern-matches the guard argument to identify which permission is enforced.

**This is weaker than the structural guarantee.** It catches the common case. It doesn't catch dynamically-computed guards, conditional enforcement, or complex flow. We accept this trade for simpler default surface.

**Don't oversell the linter.** Outside `defineOperation`, authorization analysis is best-effort, not structurally guaranteed. For security-critical authorization paths, use `defineOperation` — it preserves structural metadata.

### 8.2 Structured authorization lives in `defineOperation`

If you want `guard/load/authorize/preview/handler` shape, that's what `defineOperation` is for (§12). Operations are reusable multi-surface business actions where structure genuinely helps. Destructive MCP tools are required to be operation-backed, which means the runtime *does* have structural access to guard/authorize metadata for the security-critical paths.

## 9. Principals

Principals answer: **how did this request arrive?**

```ts
// convex/auth/principal.ts
import { definePrincipal } from '@lupinum/trellis/auth'
import { v } from 'convex/values'
import { getAuth } from '@lupinum/trellis/auth'

export type AppPrincipal =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'mcp'; mcpKeyId: string; userId: string }
  | { kind: 'service'; service: string }

export const principal = definePrincipal({
  validator: v.union(
    v.object({ kind: v.literal('anonymous') }),
    v.object({ kind: v.literal('user'), userId: v.string() }),
    v.object({ kind: v.literal('mcp'), mcpKeyId: v.string(), userId: v.string() }),
    v.object({ kind: v.literal('service'), service: v.string() }),
  ),
  // Forwarded envelopes are consumed by their target adapter BEFORE
  // reaching this resolver. This resolver only sees ambient auth.
  resolve: async (ctx, _args): Promise<AppPrincipal> => {
    const auth = await getAuth(ctx)
    if (!auth) return { kind: 'anonymous' }
    return { kind: 'user', userId: auth.subject }
  },
})
```

### 9.1 Forwarded principals are consumed by their adapter

Earlier drafts had the general principal resolver read `__principal` from args. That was too loose — any ordinary `query` could be called with a forwarded envelope if the caller knew the format.

v2.2 tightens this:

- **Ordinary `defineFunctions` resolution uses ambient auth only.** The user-defined resolver never reads `__principal`.
- **Bridge wrappers** consume `trellis:component-principal:v1` envelopes and populate `ctx.principal` before the handler runs.
- **MCP adapters** consume `trellis:mcp-forwarded:v1` envelopes and populate `ctx.principal` before the target Convex function runs.
- **Non-request contexts** go through `systemPrincipal` (§6.5).

Each transport path has its own verification. Envelopes are bound to their intended callee (function name or component namespace), not just audience. A valid MCP envelope can't be replayed as a bridge envelope or against a different Convex function.

## 10. Principal forwarding protocol

This section is the one place the whole trust story lives. Every forwarding path follows the same rules.

### 10.1 Envelope shape

```ts
type PrincipalEnvelope = {
  v: 1,
  aud: string,              // purpose identifier, e.g., 'trellis:component-principal'
  callee: string,           // bound function/component identifier
  principal: unknown,       // the principal payload (shape defined by target)
  iat: number,              // issued-at timestamp
  exp: number,              // expiry timestamp
}
```

### 10.2 Signing keys

Root: the deployment secret. Purpose-specific keys are derived via HKDF:

```txt
trellis:component-principal:v1    — bridge-forwarded principals
trellis:mcp-forwarded:v1          — MCP-to-Convex forwarded principals
trellis:mcp-confirmation:v1       — MCP destructive confirmation tokens
trellis:trusted-caller:v1         — reserved for future trusted-caller envelopes
```

Each envelope is signed with its purpose-specific key. Verification checks signature, `aud`, `callee` match against the expected values, and expiry.

### 10.3 Service principals via `ctx.runAsService()`

HTTP actions often need to validate a webhook (Stripe, Clerk, custom) and then invoke an internal mutation with a service principal. Trellis provides `ctx.runAsService()` inside HTTP action handlers wrapped with the Trellis `httpAction` builder.

```ts
// convex/webhooks.ts
import { httpAction, internalMutation } from './functions'
import { internal } from './_generated/api'

export const stripeWebhook = httpAction(async (ctx, request) => {
  const event = await verifyStripeSignature(request)

  await ctx.runAsService(
    internal.billing.recordPayment,
    { event },
    { service: 'stripe-webhook' },
  )

  return new Response(null, { status: 200 })
})

export const recordPayment = internalMutation({
  args: { event: v.any() },
  handler: async (ctx, args) => {
    // ctx.principal is { kind: 'service', service: 'stripe-webhook' }
    // ctx.actor is the narrow service actor defined for this service kind.
  },
})
```

`runAsService` constructs a signed service envelope (`trellis:trusted-caller:v1`), binds it to the target function, and invokes it. The internal function verifies the envelope on entry like any other forwarded principal.

### 10.4 Summary table

| Context | Envelope key | Consumed by | Resolver behavior |
|---|---|---|---|
| Bridge call into component | `trellis:component-principal:v1` | `createComponentBridge` builder | Populates `ctx.principal` before handler |
| MCP tool call into Convex | `trellis:mcp-forwarded:v1` | MCP adapter inside `defineMcpApp` | Populates `ctx.principal` before handler |
| HTTP action → internal | `trellis:trusted-caller:v1` | `httpAction` + `internalMutation` | Populates `ctx.principal` with service |
| Scheduler / cron / CLI | (none — non-request context) | `systemPrincipal` | Resolves to `{ kind: 'service' }` |
| Public client + auth | (none — ambient) | User's `principal.resolve` | Returns `{ kind: 'user' }` |
| Public client + no auth | (none — ambient) | User's `principal.resolve` | Returns `{ kind: 'anonymous' }` |

## 11. Actors

Actors answer: **who is this principal inside my app model?**

```ts
import { defineActor } from '@lupinum/trellis/auth'

export const resolveActor = defineActor<AppPrincipal, WorkspaceActor | null>({
  resolve: async (ctx, _args, principal) => {
    // ctx.db here is raw — RLS isn't wrapped yet during resolution (§7.3).

    switch (principal.kind) {
      case 'anonymous':
        return null

      case 'service':
        return resolveServiceActor(ctx, principal)  // narrow scope per service

      case 'user':
      case 'mcp': {
        const membership = await ctx.db
          .query('workspaceMembers')
          .withIndex('by_user', q => q.eq('userId', principal.userId))
          .first()
        if (!membership) return null
        return {
          userId: principal.userId,
          tenantId: membership.workspaceId,
          role: membership.role,
          kind: principal.kind,
        }
      }
    }
  },
})
```

Actors may be `null`, a personal user, a workspace member with a role, an MCP-bound user, or a narrowly-scoped service actor.

## 12. Guards — unchanged

`defineGuard`, `open`, `authenticated`, `.and()`, `.or()`, `.not()` all stay as they are.

```ts
export const canDeleteRunbook = (runbook: { ownerId: string }) =>
  defineGuard<Actor>(
    'delete-runbook',
    hasRole('owner', 'admin').or(
      hasRole('member').and(actor => !!actor && actor.userId === runbook.ownerId),
    ),
  )
```

Invocation is via `ctx.enforce(guard)` or as an `authorize:` value inside `defineOperation`.

## 13. Permission context — unchanged in shape

```ts
export const getPermissionContext = query(
  definePermissionContext({
    resolve: resolvePermissionActor,
    guards: {
      'workspace.read': isAuthenticated,
      'workspace.members': hasRole('owner', 'admin'),
      'todo.create': hasRole('owner', 'admin', 'member'),
    },
    extend: async (ctx, actor) => ({
      email: await getActorEmail(ctx.db, actor),
    }),
  }),
)
```

A named server query the client consumes declaratively through composables. Keep it.

## 14. Tenancy — `defineTenantRules` with deny-by-default

```ts
// convex/auth/tenant-rules.ts
import { defineTenantRules } from '@lupinum/trellis/auth'

export const tenantRules = defineTenantRules<Actor>({
  field: 'workspaceId',
  indexName: 'by_workspace',
  tables: ['todos', 'projects', 'comments'],
  defaultPolicy: 'deny',         // enforced default
  allowAnonymous: false,
  override: {
    publicPosts: {
      read: () => true,
      insert: (ctx, doc) => doc.workspaceId === ctx.actor?.tenantId,
    },
  },
})
```

### 14.1 Why deny-by-default matters

convex-helpers RLS defaults to *allow* for tables without rules. If Trellis didn't force `defaultPolicy: 'deny'`, unlisted tables would remain readable — silently breaking the safety story. `defineTenantRules` forces `'deny'` unless the user explicitly sets `'allow'`.

### 14.2 Behavior

- Listed tables are tenant-scoped by `field` (default `workspaceId`).
- `indexName` is derived from `field` when omitted.
- `allowAnonymous: false` is the default: public-query callers with null actor see an empty db unless opted in per-table via `override`.
- Unlisted tables are denied by default. Use `override` to allow reads/writes with explicit policies.
- Service principals typically resolve to actors with specific allowed-table scopes; RLS checks those scopes.

### 14.3 Tooling migration

The current analyzer parses `tenantIsolation` metadata from `convex/functions.ts` and the eslint rules use that metadata. `defineTenantRules` replaces that metadata path — the analyzer needs updating to parse the new call shape, and the eslint rules need to follow.

Budget for this is in §22. Codemods handle the function-shape rename; analyzer and eslint work is separate.

## 15. Visibility

```ts
import {
  defineCapabilities,
  defineRedaction,
  defineVisibility,
} from '@lupinum/trellis/visibility'

export const articleCapabilities = defineCapabilities({
  update: async (ctx, article) =>
    !!ctx.actor && ctx.actor.tenantId === article.workspaceId,
  delete: async (ctx, article) =>
    !!ctx.actor && ['owner', 'admin'].includes(ctx.actor.role),
})

export const articleRedaction = defineRedaction({
  body: async (ctx, article) =>
    !ctx.actor || ctx.actor.tenantId !== article.workspaceId,
})

export const articleVisibility = defineVisibility({
  capabilities: articleCapabilities,
  redaction: articleRedaction,
})
```

### 15.1 Preferred API: `ctx.applyVisibility`

```ts
const article = await ctx.db.get(args.id)
return await ctx.applyVisibility(article, articleVisibility)
```

Evaluation order:

1. Capabilities evaluate against the original, unredacted value.
2. Redaction evaluates against the original value.
3. Returned value is redacted, with capability map attached.

Capabilities may need fields that redaction removes (`ownerId`, `workspaceId`, `status`). Evaluating both against the original makes the semantics correct.

`ctx.attach` and `ctx.redact` remain available as lower-level primitives; docs default to `applyVisibility`.

## 16. Operations — `defineOperation`

`defineOperation` is the one place the structured `guard/load/authorize/preview/handler` shape exists. For reusable multi-surface business operations.

```ts
import { defineOperation, previewOf } from '@lupinum/trellis/functions'

export const deleteRunbook = defineOperation({
  kind: 'destructive',
  args: { id: v.id('runbooks') },

  guard: canReadRunbooks,

  load: async (ctx, args) => ({
    runbook: await ctx.db.get(args.id),
  }),

  authorize: ({ runbook }) => canDeleteRunbook(runbook),

  // Preview splits into display (UI) and confirm (semantic invariants).
  // Only `confirm` is hashed for confirmation tokens.
  preview: async (_ctx, _args, { runbook }) => ({
    display: {
      summary: `Delete "${runbook.title}"`,
      warn: 'This cannot be undone',
      affectedCount: 1,
    },
    confirm: {
      operation: 'deleteRunbook',
      targetId: runbook._id,
      affectedIds: [runbook._id],
    },
  }),

  handler: async (ctx, _args, { runbook }) => {
    await ctx.db.delete(runbook._id)
  },
})

// Project to Convex functions for each surface.
export const previewDeleteRunbook = query(previewOf(deleteRunbook))
export const removeRunbook = mutation(deleteRunbook)
```

### 16.1 Why `display` and `confirm` are split

A reviewer-flagged issue: if `preview` returns a single object containing user-visible display text plus semantic data, and you hash the whole thing, confirmations can fail because a sentence changed. Worse, state can change between preview and execute in ways that alter the semantic meaning — "delete 3 items" becomes "delete 300 items" because the tenant grew — and without hashing the semantic invariants, the runtime has no way to detect this.

The split:

- **`display`** — human-readable. Can include translations, timestamps, generated sentences. Shown to the user. **Not hashed.**
- **`confirm`** — stable semantic invariants. Operation name, target IDs, affected IDs, critical counts. **Hashed into the confirmation token.**

When execute recomputes the preview, only the `confirm` hash needs to match. Display changes between preview and execute are fine. Semantic changes invalidate the confirmation.

Guidelines for authors: put anything the user would want to know *has changed* between preview and execute into `confirm`. Put anything that's just a nice presentation into `display`.

### 16.2 What operations are for

One business action — "delete this runbook" — often needs to project to multiple surfaces:

- A Convex mutation for the admin UI.
- A preview query for an "are you sure?" dialog.
- An MCP tool with destructive confirmation.
- Potentially a CLI or HTTP action handler.

Without `defineOperation`, you'd write the guard, load, and authorize logic three times.

### 16.3 Destructive MCP tools must be operation-backed

See §17.4. This is the load-bearing constraint for the runtime's destructive-path safety guarantees.

### 16.4 Not for everyday mutations

Regular mutations don't use `defineOperation`. They use `mutation({ args, handler })` with inline `ctx.enforce()`. Operations are for genuinely-reusable business actions.

## 17. The agent layer — `defineMcpApp`

Eight previous MCP primitives collapse into one entry point. Sessions, resources, and prompts are first-class subfeatures.

```ts
// server/mcp.ts
import { defineMcpApp, tool, resource, prompt, mcpKeyAuth } from '@lupinum/trellis/mcp'
import { api } from '~/convex/_generated/api'

export default defineMcpApp({
  auth: mcpKeyAuth({
    table: 'mcpKeys',
    prefix: 'mcp_',
    sandbox: (key) => key.readOnly ? { tags: ['safe'] } : null,
  }),

  principal: async (_event, auth) => {
    if (!auth) return { kind: 'anonymous' }
    return { kind: 'mcp', mcpKeyId: auth.keyId, userId: auth.userId }
  },

  capabilities: async ({ convex, principal }) => {
    if (principal.kind !== 'mcp') return null
    // The `convex` client here auto-forwards the MCP principal.
    // See §17.2.
    const perms = await convex.query(api.workspaces.getPermissionContext, {})
    return {
      listRunbooks:   perms?.can['runbook.read']   === true,
      deleteRunbook:  perms?.can['runbook.delete'] === true,
    }
  },

  tools: {
    'list-runbooks': tool({
      schema: listRunbooksArgs,
      call: api.runbooks.list,
      capability: 'listRunbooks',
      tags: ['safe'],
    }),

    // Destructive tools MUST be operation-backed. See §17.4.
    'delete-runbook': tool.fromOperation({
      operation: 'runbooks.deleteRunbook',       // manifest reference
      preview: api.runbooks.previewDeleteRunbook, // projected ref
      execute: api.runbooks.executeDeleteRunbook, // projected ref (operation-aware wrapper)
      capability: 'deleteRunbook',
      rateLimit: { max: 5, window: '1m', per: 'principal' },
      // replayProtection defaults to 'component'
    }),
  },

  resources: {
    'app://runbook-guide': resource({ read: () => runbookGuide }),
  },

  prompts: {
    'plan-runbook': prompt({
      args: planRunbookArgs,
      render: async (ctx, args) => { /* ... */ },
    }),
  },

  sessions: {
    enabled: true,
    state: async (ctx) => ({ /* per-session state */ }),
    toolsForSession: async (session) => { /* dynamic per-session tools */ },
  },

  agentEvents: { enabled: true },

  extend: (toolkit) => { /* lower-level toolkit access for edge cases */ },
})
```

### 17.1 MCP auth is two-mode

`mcpKeyAuth` ships in v2.2 for private deployments, internal tools, and controlled environments. For protected remote HTTP MCP servers, an `mcpOAuth` adapter conforming to the MCP authorization spec (OAuth 2.1 + Protected Resource Metadata) is planned for a later v2.x release.

Both adapters sit behind the same `defineMcpApp` interface — migration is a config change, not a rewrite.

### 17.2 The `convex` client inside MCP auto-forwards principals

Inside `capabilities`, `principal`, and tool execution handlers within `defineMcpApp`, the `convex` client provided to the user is Trellis-aware. Every Convex call it makes automatically attaches a signed `trellis:mcp-forwarded:v1` envelope carrying the current MCP principal, bound to the target function.

This means:

```ts
const perms = await convex.query(api.workspaces.getPermissionContext, {})
```

...works as expected: the Convex function sees `ctx.principal` set to the MCP principal, resolves the actor through the usual path, and runs under the normal RLS wrapper. User code doesn't construct envelopes by hand. The framework does it automatically and consistently.

### 17.3 Destructive-path flow — one atomic Convex mutation

This is the critical safety property. All verification, re-authorization, and execution happen in **a single atomic Convex mutation**. Because Convex mutations are transactional, everything sees one consistent database snapshot. There is no time-of-check/time-of-use gap between verification and handler.

**Agent-facing flow:**

1. **First call** (preview) — agent calls the MCP tool with `{ __preview: true }`. The MCP server:
   - Calls the `preview` ref (a Convex query) with principal forwarding.
   - The preview query runs `guard`, `load`, `authorize`, and the operation's `preview` function.
   - Returns `{ display, confirm, confirmationToken }` where `confirmationToken` is a signed JWT.
2. **Second call** (execute) — agent calls the MCP tool with `{ __confirmationToken }` and args. The MCP server calls the operation's `execute` ref (a Convex mutation, generated by `mutation(operation)`).

**Inside the execute mutation** (one atomic transaction):

1. Verify confirmation token: signature, `aud`, expiry, `callee` binding.
2. Canonicalize args, compute `argsHash`, verify it matches token's `argsHash`.
3. Re-run operation's `load` — get fresh data in this transaction.
4. Re-run operation's `preview` with the fresh data to produce `display` and `confirm`.
5. Compute `previewHash` from the fresh `confirm` block, verify it matches the token's `previewHash`.
6. If sessions enabled, verify `sessionId` matches current session.
7. Redeem `jti` against the audit component (§17.6). First redemption succeeds; subsequent redemptions fail.
8. Re-run operation's `guard` and `authorize` against the fresh data.
9. Run the operation's `handler`.
10. Write audit event.

All ten steps in one transaction. If any step fails, the whole transaction rolls back. No partial execution, no TOCTOU, no replay.

### 17.4 Destructive tools must be operation-backed

The safety promise in §17.3 — re-run `guard` / `load` / `authorize`, recompute preview, verify hashes — only works if the target has that metadata. `defineOperation` has it. Arbitrary procedural mutations don't.

v2.2 enforces this in two places:

1. **TypeScript level** — `tool.fromOperation` accepts only the manifest reference shape. `tool({ destructive: true, call: someRef })` is not a valid call signature.
2. **Runtime startup** — `defineMcpApp` validates every destructive tool against the Trellis-generated operations manifest. If an operation reference doesn't exist, or if the projected `preview` and `execute` refs don't point at that operation's projections, startup fails loudly.

Non-destructive tools can still use arbitrary refs via `tool({ call: ref })`. The restriction applies only where the runtime is making a specific safety promise.

### 17.5 The operations manifest

At Convex build time, a Trellis build step walks the Convex module tree, finds every `defineOperation` call, and emits a manifest:

```ts
// .trellis/operations-manifest.ts  (generated)
export const operationsManifest = {
  'runbooks.deleteRunbook': {
    kind: 'destructive',
    previewRef: 'runbooks:previewDeleteRunbook',
    executeRef: 'runbooks:removeRunbook',
    argsSchema: { /* ... */ },
  },
  // ... one entry per operation
}
```

`tool.fromOperation({ operation: 'runbooks.deleteRunbook', preview, execute, ... })` takes the string reference. At MCP server startup, `defineMcpApp` resolves the reference against the manifest and validates that `preview` and `execute` match the manifest's expected refs.

This means:

- Operations live in Convex-only modules and don't need to be importable into the Nuxt bundle.
- MCP tool definitions reference operations by string, projected Convex refs as usual.
- Type safety is preserved via the manifest's type export.
- Mismatches fail at startup, not at runtime.

### 17.6 Replay protection — default on, opt-out per tool

Destructive tools are replay-protected by default via `jti` redemption against the audit component. Tools whose operations are genuinely idempotent can opt out:

```ts
tool.fromOperation({
  operation: 'bookmarks.deleteBookmark',
  preview, execute,
  replayProtection: 'none',   // asserts idempotency
})
```

- **`'component'`** (default) — redeem `jti` via audit component. Replay impossible.
- **`'none'`** — skip redemption. Signature, expiry, `argsHash`, `previewHash`, `sessionId` still verified. Caller asserts idempotency.

No global override. The choice is per-tool and visible in code.

### 17.7 `argsHash` and `previewHash` canonicalization

Both hashes use canonical JSON serialization with sorted keys, excluding framework-internal fields (`__preview`, `__confirmationToken`, `__principal`). `previewHash` is computed from the operation's `confirm` block only (§16.1), never the full preview output.

### 17.8 Agent audit — via component, redacted by default

`agentEvents: { enabled: true }` requires the `@lupinum/trellis-agent-audit` Convex component. **This dependency is required for destructive tools** — the component owns both the event log *and* the `jti` redemption log powering replay protection.

```ts
// convex/convex.config.ts
import { defineApp } from 'convex/server'
import agentAudit from '@lupinum/trellis-agent-audit/convex.config'

const app = defineApp()
app.use(agentAudit)
export default app
```

**Default capture is conservative.** Raw args, raw results, and full error stacks are not stored in production by default.

```ts
agentEvents: {
  enabled: true,
  capture: {
    args: 'redacted',        // default — stores argsHash + argsSummary
    result: 'summary',       // default — stores resultSummary, not raw
    errors: 'summary',       // default in prod — code + message, no stack
  },
  redactor: myRedactor,      // optional custom redaction
}
```

Capture levels:

- **`'redacted'`** — hash of canonical payload plus short summary. No raw values.
- **`'summary'`** — human-readable summary without raw values.
- **`'full'`** — full JSON. Opt-in. Useful in development; turn on per-tool in production only for tools confirmed safe.
- **`'none'`** — store nothing.

In development mode, `errors` defaults to `'full'` (stacks included). In production, default is `'summary'`.

Event shape:

```ts
{
  _id, _creationTime,
  toolName:              string,
  principalKey:          string,
  phase:                 'preview' | 'execute' | 'denied' | 'error',
  argsHash:              string,
  argsSummary:           string | null,
  argsFull:              unknown | null,          // only when capture.args === 'full'
  resultSummary:         string | null,
  resultFull:            unknown | null,          // only when capture.result === 'full'
  error:                 { code, message, stack? } | null,
  confirmationTokenHash: string | null,
  jti:                   string | null,
  sessionId:             string | null,
  durationMs:            number,
  capabilitiesSnapshot:  Record<string, boolean>,
}
```

### 17.9 Rate limiting

Delegated to `@convex-dev/rate-limiter`.

```ts
rateLimit: { max: 5, window: '1m', per: 'principal' }
```

`per: 'principal' | 'tool' | 'global'` is the only thing Trellis adds. A tiny in-memory fallback exists for examples and dev-only behavior.

### 17.10 Sessions, resources, prompts — first-class

- **Sessions** provide per-session state and dynamic tool registration via `sessions.state` and `sessions.toolsForSession`.
- **Resources** are `resource({ read })` entries on the same app.
- **Prompts** are `prompt({ args, render })` entries on the same app.

These keep full power from earlier versions — they just live inside one coherent app definition instead of being separate conceptual entry points.

### 17.11 Alternate MCP projections

Apps can expose alternate MCP handlers with reduced toolsets — a `code-mode` endpoint exposing only `safe`-tagged tools, for example. Configured from a single MCP app definition.

### 17.12 Deprecation, not removal

Old MCP primitives — `defineMcpRuntime`, `projectTool`, `defineMcpTool`, `defineTool`, `defineMcpPrompt`, `defineMcpResource`, and `useMcpServer` / `useMcpSession` as *starting points* — are deprecated in v2.2 and removed in v3. They continue to work during the v2.x cycle. `defineMcpApp` ships additively. `useMcpServer` and `useMcpSession` remain internally available for advanced session scenarios via `extend`.

## 18. Component bridges

Explicit wrappers via `bridge.from()`. No magical runtime interception.

### 18.1 Component side — bridge-aware builders

```ts
// In a component package
import { createComponentBridge } from '@lupinum/trellis/components'

export const { query, mutation, internalQuery, internalMutation } =
  createComponentBridge({
    principalShape: v.object({
      userId: v.string(),
      tenantId: v.string(),
      role: v.string(),
    }),
    builders: {
      query: rawQuery, mutation: rawMutation,
      internalQuery: rawInternalQuery, internalMutation: rawInternalMutation,
    },
  })

export const publishPage = mutation({
  args: { id: v.id('pages') },
  handler: async (ctx, args) => {
    // ctx.principal is signature-verified before the handler runs.
    // Invalid, missing, or misaddressed envelopes throw before args are seen.
  },
})
```

### 18.2 Root side — `bridge.from()` materialization

`bridge.from()` runs at module load time in the root app. It returns typed wrapper functions, one per declared mapping. Each wrapper:

- Accepts the same args as the underlying component function.
- Reads the current `ctx.principal` from the enclosing Trellis handler.
- Builds a signed envelope: JWT with `trellis:component-principal:v1`, `aud`, `callee` bound to the target component namespace and function name, short TTL.
- Invokes the component function via `ctx.runMutation` / `ctx.runQuery` with the envelope as `__principal`.

```ts
// In the root app
import { bridge } from '@lupinum/trellis/components'
import { components } from './_generated/api'
import { publishPageArgs } from './args'

export const miniCmsWrappers = bridge.from(components.miniCms, {
  publishPage: {
    operation: 'internalMutation',
    component: components.miniCms.pages.publishPage,
    args: publishPageArgs.args,
  },
})
```

Handlers call the wrapper:

```ts
await miniCmsWrappers.publishPage(ctx, { id })
```

The wrapper signs the current principal, binds the envelope to `components.miniCms.pages.publishPage` specifically, and forwards. The component verifies on entry.

### 18.3 Optional auto-registration (convenience, not the contract)

For apps that want `internal.*` access to bridge wrappers, `bridge.from()` can optionally register wrappers as internal Convex functions. **This is a convenience, not the core contract.** Validate the ergonomics in the example-08 spike before relying on it in docs.

### 18.4 Direct unsigned calls fail loudly

Calls like `ctx.runMutation(components.miniCms.pages.publishPage, { id })` — bypassing the wrapper — arrive at the component without a `__principal` arg. The component's bridge verifier throws before handler code runs. An eslint rule flags direct `components.*` call sites and points authors at the wrapper.

### 18.5 Trust model

Signing is mandatory. Verification on the component side checks:

- Valid signature under `trellis:component-principal:v1`.
- `aud` match.
- `callee` match (envelope issued for *this* specific component function).
- Not expired.

Any failure rejects before handler code runs.

### 18.6 What crosses the bridge

The principal crosses. The root app's wrapped database does not — Convex semantics. Components own their own tables and rules. Tenant-scoped components define their own `defineFunctions` + `defineTenantRules`.

### 18.7 Open question — component-local policy boilerplate

If example 08 reveals repetitive per-component rule code, consider an `inheritTenantRules(parentShape)` helper — still component-local but reducing boilerplate. Validate before adding.

## 19. Nuxt integration

```ts
export default defineNuxtConfig({
  modules: ['@lupinum/trellis/nuxt', '@nuxtjs/mcp-toolkit'],
  trellis: {
    url: process.env.CONVEX_URL,
    auth: { enabled: true },
    permissions: 'workspaces.getPermissionContext',
    mcp: true,
    query: { server: true },
    logging: 'info',
  },
})
```

Composables:

```
useConvexQuery  useConvexMutation  useConvexAction
useConvexAuth   useConvexAuthActions
usePermissions  useAuthGuard
useConvexUpload
```

Deferable cleanups for a later minor release:

- Namespace auth components: `<Auth.Authenticated>` / `<Auth.Anonymous>` instead of `ConvexAuthenticated` / `ConvexUnauthenticated`.
- Normalize composable naming — the `Convex` prefix is inconsistent with `useCachedQuery`.

## 20. Shared args — `defineArgs` unchanged

```ts
export const createTodo = defineArgs({
  description: 'Create a team todo',
  args: { title: v.string() },
  meta: {
    title: { label: 'Title', description: 'The todo text shown in the list' },
  },
})
```

Shared runtime-neutral args between Convex, Nuxt, and MCP. No changes.

## 21. Testing

Testing helpers stay public:

- Raw test clients.
- Identity, principal, and service-principal injection.
- Tenant seeding helpers.
- Direct access to app APIs without standing up a full Nuxt app.
- Deterministic actor resolution for unit tests.
- Bridge envelope construction helpers for testing signed boundaries.
- MCP confirmation token helpers for testing destructive-path flows end-to-end.

No conceptual rewrite — alignment with the new builder names and value-based ctx.

---

# Part III — Migration

## 22. Deprecations

Deprecated in v2.2, removed in v3. Codemods ship with v2.2.

| Old | New |
|---|---|
| `createApp` | `defineFunctions` |
| `app.query` / `app.mutation` with `guard/load/authorize/handler` | `query` / `mutation` with procedural `handler` (or `defineOperation` for multi-surface) |
| `anonQuery` / `anonMutation` | `publicQuery` / `publicMutation` |
| `tenantIsolation: { tables }` | `defineTenantRules` with `defaultPolicy: 'deny'` |
| `await ctx.actor()` / `await ctx.principal()` | `ctx.actor` / `ctx.principal` (value access) |
| Single `rawDb` bypassing everything | Three doors: `db`, `unsafeDb`, `rawDb` |
| Actorless unwrapped internal builders | Trellis-wrapped internals; `raw.internalMutation` for unwrapped escape hatch |
| Old MCP primitives | `defineMcpApp`; `tool.fromOperation` for destructive tools |
| `tool({ destructive: true, call: anyRef })` | `tool.fromOperation({ operation, preview, execute })` |
| In-memory `globalRateLimiter` in production | `@convex-dev/rate-limiter` component |
| `trustedCallers: true` in Nuxt config | Service principals in the principal union + `ctx.runAsService` |
| Unified `preview` output hashed as a single blob | `preview` returns `{ display, confirm }`; only `confirm` is hashed |
| Hand-rolled confirmation flow in MCP tools | Runtime-enforced atomic execute mutation (§17.3) |

Explicitly **not** deprecated: guards, permission context, capabilities, redaction, `defineOperation`, component bridges, `defineArgs`.

## 23. Migration example — a destructive operation end-to-end

**Old — unstructured handler, ad-hoc MCP flow:**

```ts
// Old mutation with ad-hoc guard
export const removeRunbook = app.mutation({
  args: { id: v.id('runbooks'), _confirmed: v.optional(v.boolean()) },
  guard: isAuthenticated,
  handler: async (ctx, args) => {
    const actor = await ctx.actor()
    const runbook = await ctx.db.get(args.id)
    if (!canDeleteRunbook(runbook, actor)) throw new Error('forbidden')
    if (!args._confirmed) {
      return { preview: `Delete "${runbook.title}"` }
    }
    await ctx.db.delete(args.id)
    return { deleted: true }
  },
})

// Old MCP tool
defineMcpTool('delete-runbook', {
  call: api.runbooks.removeRunbook,
})
```

**New — operation-backed with runtime-enforced flow:**

```ts
// convex/runbooks.ts
export const deleteRunbook = defineOperation({
  kind: 'destructive',
  args: { id: v.id('runbooks') },
  guard: isAuthenticated,
  load: async (ctx, args) => ({ runbook: await ctx.db.get(args.id) }),
  authorize: ({ runbook }) => canDeleteRunbook(runbook),
  preview: async (_ctx, _args, { runbook }) => ({
    display: {
      summary: `Delete "${runbook.title}"`,
      warn: 'This cannot be undone',
    },
    confirm: {
      operation: 'deleteRunbook',
      targetId: runbook._id,
    },
  }),
  handler: async (ctx, _args, { runbook }) => {
    await ctx.db.delete(runbook._id)
  },
})

export const previewDeleteRunbook = query(previewOf(deleteRunbook))
export const executeDeleteRunbook = mutation(deleteRunbook)  // operation-aware wrapper

// server/mcp.ts
'delete-runbook': tool.fromOperation({
  operation: 'runbooks.deleteRunbook',
  preview: api.runbooks.previewDeleteRunbook,
  execute: api.runbooks.executeDeleteRunbook,
  capability: 'deleteRunbook',
  rateLimit: { max: 5, window: '1m', per: 'principal' },
}),
```

What the user gets: atomic execute transaction, preview-hash drift detection, `jti` replay protection, automatic audit, bound confirmation tokens, session binding when enabled. Zero user code.

---

# Part IV — Implementation notes for the dev team

This part is for the engineers building Trellis v2.2. Skip if you're just using the library.

## 24. Build from convex-helpers, not from scratch

The whole v2.2 runtime is built on convex-helpers primitives. Don't reinvent them.

- **`defineFunctions`** uses `customQuery` and `customMutation` from convex-helpers with a structured input step for principal/actor resolution.
- **RLS wrapping** uses `wrapDatabaseReader` and `wrapDatabaseWriter` from convex-helpers with `Rules` objects.
- **Triggers** use the `Triggers` class from convex-helpers with `ctx.innerDb` inside callbacks to avoid recursion.
- **Rate limiting** uses `@convex-dev/rate-limiter` component.

## 25. Envelope signing and verification

### 25.1 Key derivation

Root secret is read from the deployment environment. Purpose-specific keys are derived via HKDF-SHA256:

```ts
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'

function deriveKey(purpose: string): Uint8Array {
  return hkdf(sha256, deploymentSecret, /* salt */ new TextEncoder().encode('trellis-v1'), /* info */ new TextEncoder().encode(purpose), 32)
}
```

Purposes: `'trellis:component-principal:v1'`, `'trellis:mcp-forwarded:v1'`, `'trellis:mcp-confirmation:v1'`, `'trellis:trusted-caller:v1'`.

### 25.2 Envelope format

JWT with HS256. Claims:

```ts
{
  v: 1,
  aud: string,      // exact purpose identifier
  callee: string,   // target function identifier or component namespace
  principal: unknown,
  iat: number,
  exp: number,
  jti?: string,     // only for confirmation tokens
  argsHash?: string,
  previewHash?: string,
  sessionId?: string,
}
```

### 25.3 Verification

Every verify call checks:

1. Valid JWT signature under the purpose-specific key.
2. `aud` exact match.
3. `callee` exact match against the expected callee (bridge passes the component namespace; MCP passes the target function name).
4. `exp` not past.
5. For confirmation tokens only: `argsHash`, `previewHash`, and (if sessions enabled) `sessionId`.

## 26. The operations manifest

### 26.1 Generation

At Convex build time (via a TypeScript AST walk or a Convex codegen hook), Trellis scans the Convex module tree for `defineOperation(...)` calls. For each, it records:

- Operation key (module path + exported name, e.g., `'runbooks.deleteRunbook'`).
- Kind (`'destructive' | 'safe'`).
- Args schema.
- Projected function refs (by convention: `previewXxx` query and `executeXxx` mutation, or explicit `previewOf` / `mutation(operation)` projections).

Output: `.trellis/operations-manifest.ts` with a typed `operationsManifest` export.

### 26.2 Validation at MCP startup

`defineMcpApp` imports the manifest (it's Convex-build-time generated but checked into source or emitted to a known path). For each destructive tool:

1. Look up `operation` string in manifest. Fail startup if missing.
2. Verify `preview` and `execute` refs match the manifest's expected projections. Fail startup on mismatch.
3. Store operation metadata (args schema, etc.) for runtime use.

### 26.3 TypeScript story

The manifest exports a union type of operation keys. `tool.fromOperation` accepts only that union as its `operation` field. Users get autocompletion; typos fail at compile time.

## 27. The atomic execute mutation

### 27.1 What `mutation(operation)` generates

For a `defineOperation(...)` with `kind: 'destructive'`, `mutation(operation)` generates a Convex mutation that does all ten steps of §17.3 in one transaction. Pseudocode:

```ts
function mutation(op: Operation) {
  return rawMutation({
    args: {
      ...op.args,
      __confirmationToken: v.optional(v.string()),
      __preview: v.optional(v.boolean()),
    },
    handler: async (ctx, rawArgs) => {
      const { __confirmationToken, __preview, ...args } = rawArgs

      // Preview mode — used by previewOf projection
      if (__preview) {
        await enforce(ctx, op.guard)
        const loaded = await op.load(ctx, args)
        await enforce(ctx, op.authorize(loaded))
        const preview = await op.preview(ctx, args, loaded)
        const confirmationToken = mintConfirmationToken({
          operation: op.id,
          argsHash: canonicalHash(args),
          previewHash: canonicalHash(preview.confirm),
          principalKey: hashPrincipal(ctx.principal),
          sessionId: ctx.sessionId ?? null,
          jti: randomJti(),
        })
        return { preview, confirmationToken }
      }

      // Execute mode
      if (op.kind === 'destructive') {
        const token = verifyConfirmationToken(__confirmationToken, op.id, hashPrincipal(ctx.principal))
        if (canonicalHash(args) !== token.argsHash) throw new Error('argsHash mismatch')

        // Re-run everything with fresh data in this transaction
        const loaded = await op.load(ctx, args)
        const fresh = await op.preview(ctx, args, loaded)
        if (canonicalHash(fresh.confirm) !== token.previewHash) throw new Error('preview drift')

        if (ctx.sessionId && ctx.sessionId !== token.sessionId) throw new Error('session mismatch')

        await redeemJti(ctx, token.jti)  // via audit component, fails if already redeemed

        await enforce(ctx, op.guard)
        await enforce(ctx, op.authorize(loaded))

        const result = await op.handler(ctx, args, loaded)
        await writeAuditEvent(ctx, { /* ... */ })
        return result
      }

      // Non-destructive operations run as normal mutations
      await enforce(ctx, op.guard)
      const loaded = await op.load(ctx, args)
      await enforce(ctx, op.authorize(loaded))
      return await op.handler(ctx, args, loaded)
    },
  })
}
```

All of this runs in one Convex mutation call, which is one transaction. Convex guarantees serializable isolation on mutations; everything inside sees a consistent snapshot.

### 27.2 Why not orchestrate from the MCP server

The MCP server could, in principle, call preview query → then call execute mutation, doing verification in between. But that's two separate Convex transactions with a gap. State can change between them. The atomic mutation approach eliminates the gap.

The MCP server's job is reduced to: call preview, get the confirmation token, wait for agent confirmation, call execute with the token and args. All the safety verification happens inside the execute mutation.

## 28. `ctx.runAsService` implementation

The Trellis `httpAction` wrapper provides `ctx.runAsService`. Implementation:

```ts
function httpAction(handler: (ctx: HttpActionCtx, req: Request) => Promise<Response>) {
  return rawHttpAction(async (ctx, req) => {
    const enrichedCtx = {
      ...ctx,
      runAsService: async (fn, args, { service }) => {
        const envelope = signEnvelope({
          aud: 'trellis:trusted-caller:v1',
          callee: fn._name,
          principal: { kind: 'service', service },
          exp: Date.now() + 30_000,
        })
        return await ctx.runMutation(fn, { ...args, __principal: envelope })
      },
    }
    return await handler(enrichedCtx, req)
  })
}
```

The internal mutation's principal resolver recognizes the `trellis:trusted-caller:v1` envelope, verifies it, and populates `ctx.principal` with the service principal.

## 29. Analyzer and eslint updates

Two separate work streams:

### 29.1 Analyzer migration

Currently parses `tenantIsolation` metadata from `convex/functions.ts`. Needs to parse `defineTenantRules(...)` instead. The new call shape is explicit enough that the AST walk is straightforward — but budget a week for this, including regression tests.

### 29.2 New eslint rules

- **`trellis/enforce-required`** — every non-internal `mutation` handler must call `ctx.enforce()` at least once OR be `defineOperation`-backed. Catches the common case of forgetting authorization.
- **`trellis/no-direct-component-call`** — flags `ctx.runMutation(components.*.*)` / `ctx.runQuery(components.*.*)` and suggests the bridge wrapper.
- **`trellis/no-raw-db-without-comment`** — requires a comment explaining why above any `rawDb` usage. Soft enforcement; don't over-engineer.
- **`trellis/destructive-requires-operation`** — flags `tool({ destructive: true, ... })` without `tool.fromOperation`. TypeScript also catches this; eslint provides a better error message.

### 29.3 Codemods

- `createApp` → `defineFunctions` with the right option shape.
- `anonQuery` / `anonMutation` → `publicQuery` / `publicMutation`.
- `await ctx.actor()` / `await ctx.principal()` → `ctx.actor` / `ctx.principal`.
- `tenantIsolation: {...}` → `defineTenantRules({...})`.
- Old structured handlers (`guard`/`load`/`authorize`/`handler` on `app.mutation`) → procedural `handler` with inline `ctx.enforce`, OR `defineOperation` with projection. Heuristic: if the handler has a `load` step, suggest `defineOperation`; otherwise convert to procedural.

---

# Part V — Project management

## 30. Timeline

### 30.1 Code time

- **Layer 1 — authorization primitives.** `defineFunctions`, procedural handlers, `publicQuery`/`publicMutation`, Trellis-aware internals, `httpAction` with `runAsService`, `systemPrincipal`, three-door db, trigger composition, `defineTenantRules` with deny-by-default, ctx value accessors, visibility helpers as ctx methods, purpose-specific key derivation, envelope sign/verify. **~3 weeks.**
- **Layer 2 — agent layer.** `defineMcpApp`, operations manifest generation, `tool.fromOperation` with manifest validation, atomic execute mutation, `previewHash` + `sessionId` + `jti` redemption flow, `@lupinum/trellis-agent-audit` component with conservative redaction defaults, rate-limiter integration, devtools agent panel, sessions/resources/prompts. **~4 weeks.**
- **Layer 3 — Nuxt cleanups.** Component namespacing, composable naming, doc revisions. **~1 week.**

Code total: **~8 weeks.**

### 30.2 Polish time

- **Codemods.** `createApp` → `defineFunctions`, `anonQuery` → `publicQuery`, async accessors → values, `tenantIsolation` → `defineTenantRules`, structured handlers → procedural / `defineOperation`, destructive tools → `tool.fromOperation`. **~1.5 weeks.**
- **Analyzer/eslint.** Metadata parser migration + four new eslint rules. **~1 week.**
- **Example rewrites.** Examples 01–08, each a chance to validate spec against real usage. **~2 weeks.**
- **Docs.** Migration guide, procedural examples, `defineOperation` patterns, destructive-tool guide, subfeature docs for MCP, three-door db with trigger composition, bridge authoring guide, service-actor scoping guide, testing guide. **~2 weeks.**
- **Buffer.** **~1 week.**

Polish total: **~7.5 weeks.**

**Realistic end-to-end: 15–16 weeks** to a v2.2 ready for general adoption.

### 30.3 Ship order — validate before committing

Ship the agent layer additively against current Trellis first. `defineMcpApp` lives alongside existing primitives. No breaking changes during the spike phase.

**Three implementation spikes, run before freezing the API:**

1. **Spike A — Authorization reshape.** Build `defineFunctions` with all six builders, three-door db, trigger composition, `systemPrincipal`, `ctx.runAsService`. Port **example 05** (SaaS access control). This validates multi-tenant authorization against realistic code.
2. **Spike B — Agent layer.** Build `defineMcpApp`, operations manifest, `tool.fromOperation`, atomic execute mutation, redacted audit, replay protection. Port **example 07** (MCP tooling with sessions). This validates destructive flows and sessions-as-first-class.
3. **Spike C — Boundary story.** Port **either example 06 (cross-tenant with `unsafeDb`) or example 08 (component bridging)**. This validates the escape-hatch and boundary story. Reviewers flagged this as the third proof point.

If all three feel clean, proceed with the rest of v2.2 as a breaking release. If any feels awkward, adjust before committing.

## 31. Open questions

To validate during the spikes. None are architecture blockers.

### 31.1 `allowAnonymous: false` default in `defineTenantRules`

Specified as `false`. Worth a second opinion against real app code. Validate in spike A (example 05 has public surfaces).

### 31.2 Bridge RLS inheritance

Specified that RLS doesn't cross the component bridge. Validate in spike C (if doing example 08). If repetitive rule code shows up, consider `inheritTenantRules(parentShape)` helper.

### 31.3 Service principal granularity

`systemPrincipal` defaults to `{ kind: 'service', service: 'system' }`. Users refine to distinguish `'scheduler' | 'cron' | 'cli' | 'dashboard' | 'action'`. Validate in spike A against any example using scheduled jobs.

### 31.4 OAuth adapter timing

`mcpKeyAuth` ships in v2.2; `mcpOAuth` adapter planned for later v2.x. Open question: does any example require OAuth before v2.2 ships? If a public-facing MCP deployment is in scope, bring the adapter timeline forward.

### 31.5 `bridge.from()` auto-registration ergonomics

Optional feature, framed as convenience not contract (§18.3). Validate in spike C.

---

# Part VI — Rationale

## 32. Decision log

Why things are shaped the way they are. Future readers can understand choices without re-reading five rounds of reviews.

### 32.1 `defineFunctions` over `createFunctions`
Matches Convex's `define*` naming convention. `create*` suggests a runtime factory; `define*` suggests a framework declaration.

### 32.2 `publicQuery` / `publicMutation` over `anonQuery` / `anonMutation`
"Anon" miscommunicates — a logged-in user on a share-token route is still on a public client surface. "Public" captures "actor is optional on a client-callable route" correctly.

### 32.3 Internals stay Trellis-aware
"Internal" is visibility (not callable from the public client). "Raw" is policy (bypass the framework). Conflating them meant internal orchestration code silently lost RLS and audit — exactly where it's most needed, because internal code often does cross-tenant work. v2.2 separates: internals are wrapped; `raw.internalMutation` is the one bypass door.

### 32.4 Three db doors
Policy bypass and trigger bypass are different kinds of escape hatch. `unsafeDb` (bypass RLS, keep triggers) is for admin flows that should still be audited. `rawDb` (bypass both) is for migrations and recursion avoidance. Both greppable; both documented with different warning levels.

### 32.5 Procedural-only regular handlers
Earlier drafts kept both procedural and declarative shapes. Vue's dual API is cited as *the* source of confusion for Vue newcomers, not a feature. A framework's safety properties shouldn't depend on users picking the right shape. Procedural-only with `ctx.enforce()` gets there with less surface area. Tradeoff: structural static analysis is lost, replaced by weaker eslint. Accepted for the simplicity gain. Docs are honest about the tradeoff.

### 32.6 `defineOperation` as the structured primitive
The structured shape doesn't vanish — it becomes the canonical form for reusable multi-surface actions. One definition projects to a mutation, a preview query, an MCP tool, an admin UI, and a CLI. Regular mutations don't need this; operations do. This also gives the runtime structural metadata for the safety-critical paths.

### 32.7 RLS deny-by-default
convex-helpers defaults to allow for unlisted tables. Trellis forces `defaultPolicy: 'deny'` in `defineTenantRules`. Setting `'allow'` requires typing the override.

### 32.8 Service principals for non-request contexts
Without a fallback, deny-by-default RLS would make scheduled jobs, cron, CLI, and dashboard work hit an empty db. Users would reach for `rawDb`; the escape hatch would become the sidewalk. Service principals give those flows a normal, auditable path. Docs show narrow service actors, not god actors.

### 32.9 Public client + no auth = anonymous, not service
Explicit precedence order (§6.5): public client calls without auth resolve to `anonymous`. Service fallback is reserved for non-request contexts. The framework detects this via Convex runtime hints.

### 32.10 Destructive MCP tools must be operation-backed
The runtime promise — re-run `guard/load/authorize`, recompute preview, verify hashes — only works if the target has that metadata. Operations do. Arbitrary mutations don't. Enforcement at TypeScript level and again at MCP startup against the manifest.

### 32.11 Forwarded `__principal` scoped to specific adapters
Earlier drafts let the general resolver read `__principal` from args. That meant any ordinary query could be called with a forwarded envelope. v2.2 tightens: each transport has its own adapter that consumes its envelope kind before reaching user code. Envelopes are callee-bound, not just audience-bound.

### 32.12 Confirmation execution is one atomic Convex mutation
Orchestrating preview verification and handler execution from the MCP server creates a TOCTOU gap between transactions. The atomic mutation eliminates the gap — one transaction, serializable isolation, consistent snapshot throughout. Convex makes this easy; use it.

### 32.13 `preview` splits into `display` and `confirm`
Earlier drafts hashed the entire preview output. Any change to user-visible text (translations, timestamps, formatted counts) invalidated confirmations. The split separates "what the user sees" from "what the framework verifies invariant." Only `confirm` is hashed.

### 32.14 `tool.fromOperation` uses string reference + manifest
Operations contain Convex-only code (validators, handlers, references to Convex modules). Importing them into the Nuxt MCP bundle risks bundler issues. String references plus a Convex-build-time manifest keep the boundary clean. MCP validates at startup.

### 32.15 `ctx.runAsService` inside `httpAction`
HTTP actions that validate webhooks need to call internals with a service principal. The helper constructs a signed trusted-caller envelope bound to the target function. Without this, users hand-roll the pattern and make mistakes.

### 32.16 Purpose-specific signing keys with callee binding
Standard crypto hygiene: derive per-purpose keys from the deployment secret, include `aud` and `callee` in every envelope. Prevents a whole category of boundary bugs where one token kind validates as another, or a bridge envelope for component A is replayed against component B.

### 32.17 Explicit bridge wrappers via `bridge.from()`
Earlier drafts promised magical `runMutation` interception. Hard to lint, hard to test, hides the trust boundary. Explicit wrappers materialize typed functions that sign envelopes at call time. Direct unsigned calls fail loudly at the component.

### 32.18 Audit captures redacted/summarized by default
Stack traces, raw args, and raw results are common leak vectors for customer content, tokens, and secrets. Default production capture is conservative — hashes, summaries, code+message errors. Full capture is opt-in.

### 32.19 Replay protection default-on with per-tool opt-out
Component-backed `jti` redemption makes replay impossible by default. Tools that assert genuine idempotency opt out per-tool. No global override.

### 32.20 MCP's internal convex client auto-forwards
Inside `defineMcpApp`, the `convex` client attaches `trellis:mcp-forwarded:v1` envelopes automatically. User code doesn't construct envelopes by hand. Consistency is the runtime's job.

### 32.21 Public-only fallback with dev warning
`query` behaves like `publicQuery` when no actor resolver is configured. Helps tiny examples. Emits a dev warning so beginners aren't surprised when auth is added. Docs teach `publicQuery` from day one regardless.

### 32.22 Don't oversell the linter
Eslint rules catch the common case of forgotten authorization. They don't replace structural guarantees. Docs say this plainly. For security-critical paths, use `defineOperation`.

### 32.23 Polish time is half the real timeline
Earlier drafts optimistically budgeted code and underestimated migration, codemods, analyzer updates, examples, and docs. Honest estimate: 8 weeks code + 7.5 weeks polish = ~15–16 weeks end-to-end.

## 33. Final decisions summary

One-page reference:

1. `defineFunctions` over `createFunctions`.
2. `publicQuery` / `publicMutation` over `anonQuery` / `anonMutation`.
3. `internalQuery` / `internalMutation` stay Trellis-aware.
4. Three db doors: `db`, `unsafeDb`, `rawDb` with spelled-out trigger composition.
5. Procedural-only regular handlers.
6. `defineOperation` as structured primitive for reusable multi-surface actions.
7. RLS deny-by-default, forced in `defineTenantRules`.
8. Principal/actor resolution uses raw db access internally.
9. Service principals (`systemPrincipal`) for non-request contexts only.
10. Explicit resolution precedence: forwarded → ambient auth → anonymous (request) or service (non-request).
11. Destructive MCP tools must be operation-backed via `tool.fromOperation` + manifest validation.
12. Forwarded `__principal` envelopes scoped to bridge/MCP/httpAction adapters only.
13. Confirmation execution runs as one atomic Convex mutation.
14. `preview` splits into `display` (UI) and `confirm` (hashed invariants).
15. Confirmation tokens bind `argsHash` + `previewHash` + optional `sessionId`.
16. Replay protection default-on via component `jti` redemption, opt-out per tool.
17. Purpose-specific signing keys with `aud` + callee binding.
18. Explicit bridge wrappers via `bridge.from()`; no magical interception.
19. `ctx.runAsService()` for HTTP-action-to-internal service principal flows.
20. MCP's internal `convex` client auto-forwards envelopes.
21. Audit captures redacted/summarized payloads by default; `errors: 'summary'` in production.
22. MCP auth is two-mode: `mcpKeyAuth` in v2.2, OAuth adapter planned for later v2.x.
23. Sessions, resources, prompts stay as first-class MCP subfeatures.
24. `trustedCallers` config removed; trusted callers are service principals.
25. `publicMutation` is a client surface, not a webhook pattern; webhooks use `httpAction`.
26. Polish time is half the real timeline (~15–16 weeks end-to-end).

## 34. Bottom line

The right v2.2 keeps what the repo already proves is valuable, hands the rest back to the Convex ecosystem, and makes the whole system easier to explain in one breath.

Final shape:

- Convex-native at the center. One handler shape for regular code. One primitive for reusable operations. One path for destructive agent actions (operation-backed, atomic execute).
- Explicit about public paths, policy bypass, trigger bypass, service contexts, principal forwarding, and component trust. Every boundary greppable.
- Serious about visibility as a first-class concern separate from RLS and guards.
- Serious about agent safety — replay protection default-on, audit redacted by default, destructive paths runtime-enforced via atomic transactions, preview drift detection.
- Serious about signed trust with purpose-specific, callee-bound keys.
- Honest about escape hatches and what each one costs.
- Smaller than today without flattening away the parts actually doing work.

One sentence for the README: *a Convex-native authorization, visibility, and agent-access layer for Nuxt apps.*

---

*Spec v2.2, final. Begin implementation with Spike A.*