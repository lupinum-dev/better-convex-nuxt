# Trellis v2.2 — The Spec

> **Status: Final (revised 2026-04-16, second pass).** All technical assumptions validated via 12 experiments (58 tests). This is the implementation spec for the dev team.
>
> **Reading order for implementers:**
> 1. Parts I and II to understand the public API.
> 2. Part III for runtime implementation notes before writing code.
> 3. Part IV for project management and Part V for rationale when decisions are questioned.
>
> **What's new in this revision (2026-04-16 second pass):**
> - **Trellis owns its tenant-scope layer** (experiment 8). Replaces convex-helpers `wrapDatabaseReader`/`wrapDatabaseWriter` with a Trellis-owned index-based proxy. Full-page pagination is guaranteed by construction, not approximated. Pages are full because every query hits a scope index, not because of post-fetch filtering.
> - **Compound-index rule, enforced twice.** On scoped tables, every custom index must start with the scope field (e.g., `['organizationId', 'status']`, not `['status']`). Eslint flags violations at the schema; the proxy rejects them at runtime. Users write plain `defineTable` — no schema wrapper.
> - **Triggers auto-scope from the triggering document** (experiment 8d). No `defineTrigger` wrapper and no manual composition order.
> - **Envelope callee-binding** validated with the string form `"module:exportName"` (experiment 10). The spec no longer references `fn._name`.
> - **`ctx.runAsService()` roundtrip** validated end-to-end (experiment 11).
> - **`__workspaceId` injection** via `customQuery` input validated (experiment 12) — the documented workspace-switching pattern works as described.

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
@lupinum/trellis/functions   — defineFunctions, defineOperation, ctx contract
@lupinum/trellis/visibility  — defineCapabilities, defineRedaction, defineVisibility
@lupinum/trellis/mcp         — defineMcpApp, tool, resource, prompt, mcpKeyAuth
@lupinum/trellis/components  — defineComponentBridge, bridge.from, manifest helpers
@lupinum/trellis/args        — defineArgs
@lupinum/trellis/testing     — test helpers
@lupinum/trellis/nuxt        — Nuxt module and composables
```

`definePrincipal` and `defineSystemPrincipal` live in `@lupinum/trellis/auth` (they're authorization concepts).

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
    principal,                        // required
    actor: resolveActor,              // required — see §6.4
    systemPrincipal,                  // optional, defaults to { kind: 'service', service: 'system' }
    rls: tenantRules,                 // optional — omit for apps without multi-tenancy
    triggers: auditTriggers,          // optional — omit if no triggers needed yet
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

### 6.4 Startup validation

`defineFunctions` validates its config at startup. **Required** fields throw if missing; **optional** fields have safe defaults.

| Field | Required? | Missing behavior |
|---|---|---|
| `principal` | **Yes** | Throws — no way to determine who is calling |
| `actor` | **Yes** | Throws — `query`/`mutation` would have no actor to enforce against |
| `systemPrincipal` | No | Defaults to `{ kind: 'service', service: 'system' }` |
| `rls` | No | No tenant scoping — `ctx.db` is unwrapped. `unsafeDb` and `rawDb` are aliases for `db`. |
| `triggers` | No | No triggers fire. `ctx.db` writes go straight to Convex. |

There is no silent fallback where `query` degrades to `publicQuery` behavior. This is a greenfield framework. The cost of typing `publicQuery` in a hello-world example is one word. The cost of a runtime fallback that silently drops authorization is a class of bugs where developers think they have auth and don't.

**Minimal setup** (auth only, no multi-tenancy):

```ts
export const { query, mutation, publicQuery, ... } = defineFunctions(
  { query: rawQuery, mutation: rawMutation, ... },
  { principal, actor: resolveActor },
)
```

Add `rls` and `triggers` when the app needs multi-tenancy or audit logging. The framework scales up; it doesn't demand the full model on day one.

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

**Critical:** public unauthenticated client calls resolve to `anonymous`, not `service`. The service fallback is reserved for non-request contexts.

**How the framework distinguishes request from non-request contexts:**

The detection is not a heuristic — it is structural. Trellis tracks the execution origin at the `defineFunctions` builder level:

- **`query` / `mutation` / `publicQuery` / `publicMutation`** — these are public-client builders. Always a request context. No auth → `anonymous`. Never falls through to `systemPrincipal`.
- **`internalQuery` / `internalMutation`** — these check for a forwarded principal envelope first. If no envelope and no ambient auth, these resolve via `systemPrincipal`. This is correct: internal functions are called by schedulers, cron, actions, the CLI, and the dashboard — all non-request contexts.
- **Action-to-internal calls** — a Convex action calling `ctx.runMutation(internal.foo.bar, args)` does **not** automatically forward the original request's auth. The internal function sees no ambient auth and no envelope, so it resolves via `systemPrincipal`. If the action needs to preserve the user's identity, it must use `ctx.runAsService()` with an explicit envelope or pass the principal via args. This is deliberate: implicit auth propagation across the action→mutation boundary would hide the trust decision.

The key insight: the builder type (`query` vs `internalQuery`) determines the resolution path at definition time, not at call time. There is no runtime heuristic.

**Consequence:** you cannot accidentally escalate from `anonymous` to `service` by calling a public function from a non-request context, because public builders never consult `systemPrincipal`.

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

**Enforcement note:** `allowedTables` is a convention, not a runtime-enforced constraint. RLS rules in `defineTenantRules` scope by tenant field, not by table whitelist on the actor. If your RLS `override` rules inspect `ctx.actor.allowedTables`, enforcement is real. If they don't, `allowedTables` is advisory metadata. The examples show the enforcement pattern — but the framework doesn't magically read `allowedTables` from the actor and restrict `ctx.db`. This is deliberate: actor shapes are user-defined, and Trellis doesn't prescribe their structure beyond `kind`.

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

- **`db`** — scope-proxy-wrapped, trigger-aware on mutations. Default. 99% of handlers use this.
- **`unsafeDb`** — bypasses tenant scope, triggers still run. Admin operations, onboarding before the actor has a tenant, cross-tenant reporting. Still audited.
- **`rawDb`** — bypasses scope *and* triggers. Data migrations, avoiding trigger recursion, integrity repair, low-level testing. Rare. Docs display a warning banner.

All three are greppable. If someone bypasses policy, audit, or both, the choice is visible in code review.

### 7.2 Trellis owns the tenant-scope layer

Trellis does **not** use convex-helpers' `wrapDatabaseReader` / `wrapDatabaseWriter` for tenant scoping. Those wrappers filter post-fetch, which degrades pagination page sizes (experiment 5) and leaves triggers inheriting RLS (the "trigger-scope footgun").

Trellis ships a tenant-scope proxy that:

- **Enforces scope with an index**, not with a post-fetch filter. Every scoped query hits an index whose first field is the scope field, so Convex scans only the tenant's rows. Pages are always full (experiment 8a).
- **Prepends the scope value to `.withIndex()` automatically.** The user writes `.withIndex('by_org_status', q => q.eq('status', 'published'))`; the proxy runs `.withIndex('by_org_status', q => q.eq('organizationId', scopeValue).eq('status', 'published'))`. Users don't type the scope value in application code (experiment 8b).
- **Rejects non-compound indexes on scoped tables.** `.withIndex('by_status', ...)` on a scoped table throws at runtime with a pointer at the fix: "Index 'by_status' on scoped table 'posts' must start with the scope field 'organizationId'. Change the index to `['organizationId', 'status']`." (Validated in experiment 8b.) An eslint rule flags the same violation at the schema, so the error arrives at authoring time in the normal case.
- **Auto-scopes trigger callbacks from the triggering document's scope**, not the handler's actor. See §7.2.1.
- **Passes non-scoped tables through unchanged** (experiment 8e).

**The compound-index rule.** On any scoped table, every custom index must start with the scope field (e.g., `['organizationId', 'status']`, not `['status']`). The rule is explicit and visible in the schema — not hidden behind a wrapper. This is standard multi-tenant database practice. The framework guarantees two things:

1. **Correctness.** The scope value is always prepended before the user's query filters run — users cannot forget it at call sites.
2. **Performance.** Every scoped query is O(tenant rows), not O(all rows).

The user takes on one obligation: write the scope field as the first field of every custom index on a scoped table. In exchange, they keep vanilla `defineTable`, no schema wrapper, and no hidden index rewriting.

**What this replaces from convex-helpers:**

| Old (convex-helpers) | New (Trellis-owned) |
|---|---|
| `wrapDatabaseReader` + `Rules` object | scope proxy driven by `defineTenantRules.scopeField` and `tables` |
| `wrapDatabaseWriter` + `Rules` object | same proxy handles writes (insert/patch/delete scope check) |
| Manual composition order `RLS(triggers(raw))` | framework composition, not user-visible |
| `defineTrigger` wrapper for tenant-scoped triggers | triggers auto-scope from `change.newDoc ?? change.oldDoc` |

**What Trellis still takes from convex-helpers:**

- `customQuery` / `customMutation` for the builder pattern.
- The `Triggers` class for before/after mechanics and recursion prevention.

### 7.2.1 Trigger auto-scoping

When a trigger fires, the callback receives a `ctx` where `ctx.db`, `ctx.unsafeDb`, and `ctx.rawDb` are already constructed:

- `ctx.db` — scope-proxy-wrapped to the **triggering document's** scope value (read from `change.newDoc ?? change.oldDoc`). Writes are scoped; reads are scoped.
- `ctx.unsafeDb` — triggers still run, but the scope proxy is bypassed. For cross-tenant denorm or admin reconciliation inside a trigger.
- `ctx.rawDb` — raw `ctx.innerDb` from convex-helpers. Use for audit writes to unscoped tables.

```ts
triggers.register('posts', async (ctx, change) => {
  // ctx.db is scoped to change.newDoc ?? change.oldDoc's organizationId — automatically.
  if (change.newDoc) {
    const cat = await ctx.db.get(change.newDoc.categoryId)
    if (cat) {
      await ctx.db.patch(cat._id, { postCount: cat.postCount + 1 })
    }
  }

  // Audit log is an unscoped table; scope proxy passes it through.
  await ctx.db.insert('auditLog', {
    table: 'posts',
    operation: change.operation,
    docId: change.id,
  })
})
```

**Why the document's scope, not the actor's:**

| Scenario | Actor's scope | Document's scope | Correct scope |
|---|---|---|---|
| User creates post via `ctx.db` | Tenant A | Tenant A | same |
| Admin backfills via `ctx.unsafeDb` | Tenant A | Tenant B | **Document's (B)** |
| System cron via `ctx.unsafeDb` | (system) | Tenant C | **Document's (C)** |

A trigger should maintain data consistency within the *affected* tenant. Scoping to the actor would silently break admin backfills and system jobs. Validated in experiment 8d.

**Edge cases:**

- **Delete** (`change.newDoc` is null): scopes to `change.oldDoc`'s scope value.
- **Unscoped tables** (not listed in `defineTenantRules.tables`): the proxy is a no-op for that table, and trigger `ctx.db` reads/writes without scope.
- **Cascaded triggers**: the next-level trigger derives *its* scope from *its* triggering document.

There is no `defineTrigger` wrapper to remember. There is no composition order for the user to get right. Registering a trigger is one line: `triggers.register('posts', myHandler)`.

### 7.3 Resolution uses raw access internally

Actor resolution often reads `users`, `memberships`, or `workspaceMembers` *before* the actor exists. If the resolver used the RLS-wrapped `db`, it would deadlock against its own rules.

The framework internally uses `raw.db` during principal and actor resolution, then swaps in the wrapped `db` for the handler. User code never thinks about this — the `ctx` passed to `resolveActor` is already raw.

### 7.4 Error semantics

The framework must have predictable, distinguishable error behavior. Silence is never the right default for authorization failures.

| Failure | Behavior | Client sees |
|---|---|---|
| `resolveActor` throws | Mutation/query fails. Error propagates. | Convex error with `"Actor resolution failed"` wrapper. |
| `resolveActor` returns `null` in `query`/`mutation` | Framework throws before handler runs. | `"Unauthorized: actor required"` |
| `resolveActor` returns `null` in `publicQuery`/`publicMutation` | `ctx.actor` is `null`. Handler runs. | Normal response (handler branches on actor). |
| `ctx.enforce(guard)` — guard returns `false` | Throws `TrellisGuardError` with guard name. | `"Forbidden: guard 'delete-runbook' denied"` |
| `ctx.enforce(guard)` — guard throws | Error propagates with guard name in wrapper. | `"Guard 'delete-runbook' failed: <original message>"` |
| RLS denies a read | Row is silently excluded from results. | Fewer rows (or empty result). This is standard RLS behavior. |
| RLS denies a write | Throws. | `"RLS denied write to table 'todos'"` |
| Trigger callback throws | Thrown from the `ctx.db` call that caused it (convex-helpers semantics). Mutation rolls back. | Convex error with trigger context. |
| `applyVisibility` — capability resolver throws | That capability defaults to `false`. Error is logged. Remaining capabilities still evaluate. | Capability absent from `__can` map. |
| `applyVisibility` — redaction resolver throws | Redaction fails safe: field is redacted. Error is logged. | Field absent from response. |

**Debug mode.** When `logging: 'debug'` is set in `defineFunctions` options, the framework logs: principal resolution result, actor resolution result, every `ctx.enforce` call with guard name and outcome, and every RLS deny with table name and document ID. This is off in production by default.

**Error types.** Trellis exports `TrellisGuardError`, `TrellisRLSError`, and `TrellisAuthError` for programmatic catch handling. All extend `ConvexError` so they serialize cleanly across the Convex boundary.

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

### 8.3 Convex runtime interactions

**Real-time subscriptions.** Convex queries are live subscriptions. The Trellis scope proxy intercepts reads at the `ctx.db` level, and Convex tracks all underlying reads (including those in the actor resolver) as subscription dependencies. If a user loses workspace membership, queries re-run, actor resolution returns a different scope, and the proxy refilters — the client sees updated data reactively. No Trellis-specific subscription logic needed.

**Pagination.** Convex's `.paginate()` works with the Trellis scope proxy as-is. Because the proxy scopes using an index rather than post-fetch filtering, Convex only scans rows in the actor's tenant. Pages are full — the "RLS shrinks pages" quirk from convex-helpers does not apply (experiments 5 and 8a). Cursor continuity is preserved.

**Scheduled functions.** When a Trellis-wrapped handler calls `ctx.scheduler.runAfter(delay, internal.foo.bar, args)`, the scheduled function is a new execution context with no ambient auth. It resolves via `systemPrincipal` — the original user context is **not** forwarded. This is deliberate: implicit principal propagation into deferred execution would hide the trust boundary. If a scheduled function needs to act as a specific user, pass the user ID in args and resolve it explicitly in the handler.

**File storage.** Convex file storage (`ctx.storage`) is not wrapped by Trellis. Storage URLs are accessible to anyone who has them. If a file's `storageId` lives in an RLS-protected row, the row is hidden but the URL still works. Docs should warn: gate file access in your handler logic, not via RLS alone.

**Performance.** Actor resolution runs on every query/mutation invocation, including subscription re-evaluations. There is no caching layer. If the resolver reads two tables (`users` + `workspaceMembers`), that is two extra reads per invocation. RLS wrapping adds a filter predicate per `ctx.db` read. Trigger registration adds overhead per write. Write efficient resolvers — keep them to one indexed lookup where possible.

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
| Bridge call into component | `trellis:component-principal:v1` | `defineComponentBridge` builder | Populates `ctx.principal` before handler |
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

### 14.1 The scope contract

Tenant scoping has three pieces:

1. **Schema.** On each scoped table, every custom index must start with the scope field. Users write these explicitly with `defineTable`. No wrapper.
2. **Policy.** `defineTenantRules` declares which tables are scoped, the scope field name, and how to extract the scope value from the actor.
3. **Runtime.** The Trellis scope proxy uses (1) and (2) to enforce scope at every call site. Users call `ctx.db` normally.

The rule users must remember at the schema: **compound indexes start with the scope field.** It's one rule, it's visible in `defineTable` calls, and it's backed by eslint + runtime checks.

### 14.2 Schema — plain `defineTable`

```ts
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  // Scoped table — every custom index starts with 'organizationId'.
  posts: defineTable({
    title: v.string(),
    status: v.string(),
    organizationId: v.id('organizations'),
  })
    .index('by_organization', ['organizationId'])
    .index('by_org_status', ['organizationId', 'status'])
    .index('by_org_owner', ['organizationId', 'ownerId']),

  // Unscoped — global, no scope field needed.
  featureFlags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
  }).index('by_key', ['key']),
})
```

No Trellis-specific wrapper on the table. The `by_organization` index is required (it's the index used for bare `.query('posts').collect()` calls). All other indexes must have `organizationId` as their first field.

The eslint rule `trellis/scoped-index-must-be-compound` (§27) flags any `.index('name', [first, ...])` on a scoped table where `first !== scopeField`. The violation surfaces while typing — you don't ship without seeing it.

### 14.3 Policy — `defineTenantRules`

```ts
// convex/auth/tenant-rules.ts
import { defineTenantRules } from '@lupinum/trellis/auth'

export const tenantRules = defineTenantRules<Actor>({
  scopeField: 'organizationId',
  scopeIndex: 'by_organization',                    // defaults to `by_<scopeField>`
  scopeFromActor: (actor) => actor?.tenantId ?? null,
  tables: ['posts', 'comments', 'mcpKeys'],
  allowAnonymous: false,
  override: {
    publicPosts: {
      read: () => true,
      insert: (ctx, doc) => doc.organizationId === ctx.actor?.tenantId,
    },
    featureFlags: {
      read: () => true,
      insert: (ctx) => ctx.actor?.kind === 'service',
    },
  },
})
```

`tables` is the authoritative list of scoped tables. If a table is listed here, the proxy enforces scope on it and expects every custom index to be compound (with the scope field first). Unlisted tables pass through the proxy.

### 14.4 Proxy semantics

For a scoped table:

| User writes | Proxy does | Cost |
|---|---|---|
| `ctx.db.query('posts').collect()` | Auto-applies `scopeIndex`, bound to actor's scope value | index-optimized |
| `ctx.db.query('posts').withIndex('by_org_status', q => q.eq('status', 'x'))` | Prepends `.eq(scopeField, scopeValue)`, then runs the user's callback | index-optimized |
| `ctx.db.query('posts').withIndex('by_status', q => ...)` | **Throws** — `by_status` is not compound with the scope field | — |
| `ctx.db.get(id)` | Fetches the row, returns null if its scope doesn't match actor's | one row read |
| `ctx.db.insert('posts', doc)` | Throws if `doc.organizationId !== actor.tenantId` | — |
| `ctx.db.patch(id, ...)` | Fetches row, throws if row's scope doesn't match | one row read |
| `ctx.db.delete(id)` | Fetches row, throws if row's scope doesn't match | one row read |

For an unscoped table, the proxy passes every call through unchanged. `defineTenantRules.override` applies its explicit policy before the call reaches Convex.

Anonymous actors see no rows from scoped tables (deny-by-default, driven by `allowAnonymous: false`). To expose a scoped table anonymously, add an `override.<table>` with explicit read rules.

### 14.5 Workspace switching pattern

Real apps have users in multiple workspaces. Trellis provides the hook; it does not prescribe the switcher UI.

The Nuxt module injects `__workspaceId` (from a cookie or header) as an extra arg. `customQuery`'s `input` step consumes it and strips it before the handler sees args. Validated in experiment 12.

```ts
resolve: async (ctx, args, principal) => {
  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_user_workspace', q =>
      q.eq('userId', principal.userId).eq('workspaceId', args.__workspaceId))
    .first()
  if (!membership) return null
  return { userId: principal.userId, tenantId: membership.workspaceId, role: membership.role }
}
```

If `__workspaceId` is omitted, apps typically fall back to the user's first/default membership. This is app policy, not framework policy — Trellis does not pick a default.

### 14.6 Unscoped tables (global config, feature flags)

Tables not listed in `defineTenantRules.tables` pass through the proxy. Control their access via `defineTenantRules.override`:

```ts
override: {
  featureFlags: {
    read: () => true,                                    // all actors can read
    insert: (ctx) => ctx.actor?.kind === 'service',      // only services write
  },
  appConfig: {
    read: () => true,
    insert: () => false,                                 // use rawDb for admin writes
  },
}
```

Anonymous actors see nothing by default — you must opt in with an explicit `override`. This is the safe default.

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
import { defineOperation } from '@lupinum/trellis/functions'

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
export const previewDeleteRunbook = query(deleteRunbook.preview)
export const removeRunbook = mutation(deleteRunbook.execute)
```

### 16.1 Why `display` and `confirm` are split

- **`display`** — human-readable. Translations, timestamps, generated sentences. Shown to the user. **Not hashed.**
- **`confirm`** — stable semantic invariants. Operation name, target IDs, affected IDs, critical counts. **Hashed into the confirmation token.**

When execute recomputes the preview, only the `confirm` hash needs to match. Display changes between preview and execute are fine. Semantic changes (e.g., "delete 3 items" becoming "delete 300 items") invalidate the confirmation. Without this split, any change to UI text would break confirmations.

**Guideline:** put anything the user would want to know *has changed* between preview and execute into `confirm`. Put presentation into `display`.

### 16.2 `load` and `preview` must be pure reads

The atomic execute mutation (§17.3) re-runs `load` and `preview` inside the execute transaction to get fresh data and verify invariants. This means both functions run **twice** per destructive action: once during preview, once during execute.

**Contract:** `load` and `preview` must be side-effect-free. No writes, no counter increments, no external calls, no resource consumption. They are read-only projections of the current database state.

The preview path enforces this naturally — it runs inside a `query` (read-only). But the execute path runs inside a `mutation` where `load` *could* technically write. The framework does **not** enforce read-only access for `load`/`preview` inside execute. This is a contract, not a runtime guard. An eslint rule that flags `ctx.db.insert`/`ctx.db.patch`/`ctx.db.delete` inside `load` or `preview` functions is planned.

### 16.3 What operations are for — and when to reach for them

One business action — "delete this runbook" — often needs to project to multiple surfaces:

- A Convex mutation for the admin UI.
- A preview query for an "are you sure?" dialog.
- An MCP tool with destructive confirmation.
- Potentially a CLI or HTTP action handler.

Without `defineOperation`, you'd write the guard, load, and authorize logic three times.

**Rule of thumb:** reach for `defineOperation` when the action will be an MCP tool, when you need preview/confirm flow, or when the same business logic projects to more than one surface. Otherwise, use `mutation({ args, handler })`.

### 16.4 Destructive MCP tools must be operation-backed

See §17.4. This is the load-bearing constraint for the runtime's destructive-path safety guarantees.

### 16.5 Not for everyday mutations

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

**`confirm` values must be JSON-serializable primitives** — strings, numbers, booleans, arrays, and plain objects. Convex `Id` values serialize as strings (safe). Do not put `Date` objects, `BigInt`, or custom classes into `confirm` — canonicalization will break or produce unstable hashes.

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

## 18. Component bridges

Explicit wrappers via `bridge.from()`. No magical runtime interception.

### 18.1 Component side — bridge-aware builders

```ts
// In a component package
import { defineComponentBridge } from '@lupinum/trellis/components'

export const { query, mutation, internalQuery, internalMutation } =
  defineComponentBridge({
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

Open design questions for a later pass:

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

# Part III — Implementation notes for the dev team

This part is for the engineers building Trellis v2.2. Skip if you're just using the library.

## 22. Build from convex-helpers where it helps, own the rest

Trellis uses convex-helpers for the builder plumbing and trigger mechanics, and owns the tenant-scope layer outright.

**From convex-helpers:**

- **`defineFunctions`** uses `customQuery` and `customMutation` from convex-helpers with a structured input step for principal/actor resolution (validated in experiments 3 and 12).
- **Triggers** use the `Triggers` class from convex-helpers with `ctx.innerDb` inside callbacks to avoid recursion.
- **Rate limiting** uses `@convex-dev/rate-limiter` component.

**Trellis-owned (~300 LoC):**

- **Tenant-scope proxy** (§7.2, §14). Index-based, transparent to users. Replaces `wrapDatabaseReader` / `wrapDatabaseWriter`. Proxy reads `scopeField`, `scopeIndex`, and `tables` from `defineTenantRules`, and prepends the scope value to every `.withIndex()` call on a scoped table. Rejects non-compound indexes on scoped tables with a pointer at the fix. Validated in experiments 8 and 9.
- **Trigger auto-scoping** (§7.2.1). The framework wraps each trigger callback with a fresh scope proxy derived from `change.newDoc ?? change.oldDoc`. No `defineTrigger` wrapper for users to remember.
- **Three-door composition**. `db` / `unsafeDb` / `rawDb` are constructed exactly once by `defineFunctions` — the user never composes layers by hand.

## 23. Envelope signing and verification

### 23.1 Key derivation

Root secret is read from the deployment environment. Purpose-specific keys are derived via HKDF-SHA256:

```ts
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

function deriveKey(purpose: string): Uint8Array {
  return hkdf(sha256, deploymentSecret, /* salt */ new TextEncoder().encode('trellis-v1'), /* info */ new TextEncoder().encode(purpose), 32)
}
```

Purposes: `'trellis:component-principal:v1'`, `'trellis:mcp-forwarded:v1'`, `'trellis:mcp-confirmation:v1'`, `'trellis:trusted-caller:v1'`.

**Import paths:** `@noble/hashes` v2.x requires `.js` suffixes in subpath imports. The SHA-256 export lives at `@noble/hashes/sha2.js` (not `sha256`). Both HKDF and SHA-256 are verified to work in Convex's V8 runtime.

**Runtime constraint:** All crypto runs inside Convex's default V8 runtime (not `"use node"` files). Use `@noble/hashes` for HKDF (pure JS, no Node dependencies). Use `jose` for JWT sign/verify — `jose` accepts raw `Uint8Array` keys directly for HS256 (no `crypto.subtle.importKey` step needed). Do **not** use Node's `crypto` module — it requires `"use node"` and cannot coexist with query/mutation definitions.

### 23.2 Envelope format

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

### 23.3 Verification

Every verify call checks:

1. Valid JWT signature under the purpose-specific key.
2. `aud` exact match.
3. `callee` exact match against the expected callee. Use the string form from `_generated/api` (e.g., `"runbooks:removeRunbook"`) — this is the public contract. Do **not** rely on `fn._name` or other internal properties of Convex function references.
4. `exp` not past.
5. For confirmation tokens only: `argsHash`, `previewHash`, and (if sessions enabled) `sessionId`.

## 24. The operations manifest

### 24.1 Generation

At Convex build time (via a TypeScript AST walk or a Convex codegen hook), Trellis scans the Convex module tree for `defineOperation(...)` calls. For each, it records:

- Operation key (module path + exported name, e.g., `'runbooks.deleteRunbook'`).
- Kind (`'destructive' | 'safe'`).
- Args schema.
- Projected function refs (by convention: `previewXxx` query and `executeXxx` mutation, or explicit `previewOf` / `mutation(operation)` projections).

Output: `.trellis/operations-manifest.ts` with a typed `operationsManifest` export.

**Static analyzability constraint:** `defineOperation` calls must be statically analyzable top-level `const` exports. Re-exports (`export { op } from './operations'`) are followed. Aliased imports (`import { defineOperation as defOp }`) are **not** resolved — the AST walker matches the literal `defineOperation` identifier only. An eslint rule enforces that `defineOperation` is always imported with its original name. Conditional or dynamic exports are not supported and will be silently missed — the startup validation in §24.2 catches these as missing manifest entries.

### 24.2 Validation at MCP startup

`defineMcpApp` imports the manifest (it's Convex-build-time generated but checked into source or emitted to a known path). For each destructive tool:

1. Look up `operation` string in manifest. Fail startup if missing.
2. Verify `preview` and `execute` refs match the manifest's expected projections. Fail startup on mismatch.
3. Store operation metadata (args schema, etc.) for runtime use.

### 24.3 TypeScript story

The manifest exports a union type of operation keys. `tool.fromOperation` accepts only that union as its `operation` field. Users get autocompletion; typos fail at compile time.

## 25. The atomic execute mutation

### 25.1 What `mutation(operation)` generates

For a `defineOperation(...)` with `kind: 'destructive'`, `mutation(op.execute)` generates a Convex mutation that does all ten steps of §17.3 in one transaction. The generated mutation:

- Accepts `{ ...op.args, __confirmationToken?: string, __preview?: boolean }`.
- In **preview mode** (`__preview: true`): runs `guard → load → authorize → preview`, mints a confirmation token with `argsHash`, `previewHash`, `principalKey`, `sessionId`, `jti`.
- In **execute mode** (destructive): verifies token → checks `argsHash` → re-runs `load` + `preview` with fresh data → checks `previewHash` (drift detection) → checks `sessionId` → redeems `jti` → re-runs `guard` + `authorize` → executes `handler` → writes audit event.
- In **execute mode** (non-destructive): runs `guard → load → authorize → handler` directly.

All steps run in one Convex mutation call — one transaction with serializable isolation. Everything sees a consistent snapshot. If any step fails, the whole transaction rolls back.

### 25.2 Why not orchestrate from the MCP server

The MCP server could, in principle, call preview query → then call execute mutation, doing verification in between. But that's two separate Convex transactions with a gap. State can change between them. The atomic mutation approach eliminates the gap.

The MCP server's job is reduced to: call preview, get the confirmation token, wait for agent confirmation, call execute with the token and args. All the safety verification happens inside the execute mutation.

## 26. `ctx.runAsService` implementation

The Trellis `httpAction` wrapper provides `ctx.runAsService`. Validated end-to-end in experiment 11.

```ts
function httpAction(handler: (ctx: HttpActionCtx, req: Request) => Promise<Response>) {
  return rawHttpAction(async (ctx, req) => {
    const enrichedCtx = {
      ...ctx,
      runAsService: async (fn, args, { service }) => {
        // Callee is the canonical "module:exportName" string form.
        // This is the documented public contract — do not inspect fn for a
        // private name accessor, since the _generated/api ref has none that
        // Convex guarantees to preserve across versions.
        const callee = calleeStringFor(fn)
        const envelope = await signEnvelope({
          purpose: 'trellis:trusted-caller:v1',
          callee,
          principal: { kind: 'service', service },
          ttlSeconds: 30,
        })
        return await ctx.runMutation(fn, { ...args, __principal: envelope })
      },
    }
    return await handler(enrichedCtx, req)
  })
}
```

`calleeStringFor(fn)` resolves the function reference to its module-and-export string using Trellis' generated API index (emitted alongside the operations manifest — see §24). It is not a runtime property of the Convex function object.

The internal mutation's principal resolver recognizes the `trellis:trusted-caller:v1` envelope, verifies signature + `aud` + `callee` + `exp`, and populates `ctx.principal` with the service principal. Invalid or callee-mismatched envelopes throw before the handler runs (experiment 11b–c).

## 27. Eslint rules

- **`trellis/enforce-required`** — every non-internal `mutation` handler must call `ctx.enforce()` at least once OR be `defineOperation`-backed. Catches the common case of forgetting authorization.
- **`trellis/no-direct-component-call`** — flags `ctx.runMutation(components.*.*)` / `ctx.runQuery(components.*.*)` and suggests the bridge wrapper.
- **`trellis/no-unsafe-db-without-comment`** — requires a comment explaining why above any `unsafeDb` usage. `unsafeDb` bypasses tenant scope while appearing safe (triggers still run, audit still logs). This false assurance makes it the most likely door to produce silent cross-tenant leaks.
- **`trellis/no-raw-db-without-comment`** — requires a comment explaining why above any `rawDb` usage. Soft enforcement; don't over-engineer.
- **`trellis/destructive-requires-operation`** — flags `tool({ destructive: true, ... })` without `tool.fromOperation`. TypeScript also catches this; eslint provides a better error message.
- **`trellis/no-define-operation-alias`** — flags aliased imports of `defineOperation` (e.g., `import { defineOperation as defOp }`). The operations manifest AST walker matches the literal `defineOperation` identifier; aliased imports are silently missed.
- **`trellis/scoped-index-must-be-compound`** — flags `.index('name', [first, ...])` on tables listed in `defineTenantRules.tables` where `first !== scopeField`. Points at the fix: "rename to include the scope field first, e.g., `['organizationId', 'status']`." The rule reads both files (`schema.ts` + `tenant-rules.ts`) so the violation surfaces at the schema, where the index is authored. The runtime proxy throws with the same message as a backstop when something slips through.

**No longer needed** (removed from the rule set): `trellis/no-raw-trigger-register`. Previous drafts enforced a `defineTrigger` wrapper around `triggers.register()`; the framework now auto-scopes trigger callbacks from the triggering document, so there is no raw registration path to misuse.

---

# Part IV — Project management

## 28. Timeline

### 28.1 Code time

- **Layer 1 — authorization primitives.** `defineFunctions`, procedural handlers, `publicQuery`/`publicMutation`, Trellis-aware internals, `httpAction` with `runAsService`, `systemPrincipal`, three-door db, trigger composition, `defineTenantRules` with deny-by-default, ctx value accessors, visibility helpers as ctx methods, purpose-specific key derivation, envelope sign/verify. **~3 weeks.**
- **Layer 2 — agent layer.** `defineMcpApp`, operations manifest generation, `tool.fromOperation` with manifest validation, atomic execute mutation, `previewHash` + `sessionId` + `jti` redemption flow, `@lupinum/trellis-agent-audit` component with conservative redaction defaults, rate-limiter integration, devtools agent panel, sessions/resources/prompts. **~4 weeks.**
- **Layer 3 — Nuxt cleanups.** Component namespacing, composable naming, doc revisions. **~1 week.**

Code total: **~8 weeks.**

### 28.2 Polish time

- **Eslint rules.** Six rules (§27). **~1 week.**
- **Examples.** Examples 01–08, each a chance to validate spec against real usage. **~2 weeks.**
- **Docs.** Procedural examples, `defineOperation` patterns, destructive-tool guide, subfeature docs for MCP, three-door db with trigger composition, bridge authoring guide, service-actor scoping guide, testing guide. **~2 weeks.**
- **Buffer.** **~1 week.**

Polish total: **~6 weeks.**

**Realistic end-to-end: ~14 weeks** to a v2.2 ready for general adoption.

### 28.3 Ship order — validate before committing

**Three implementation spikes, run before freezing the API:**

1. **Spike A — Authorization reshape.** Build `defineFunctions` with all six builders, three-door db, trigger composition, `systemPrincipal`, `ctx.runAsService`. Port **example 05** (SaaS access control). This validates multi-tenant authorization against realistic code.
2. **Spike B — Agent layer.** Build `defineMcpApp`, operations manifest, `tool.fromOperation`, atomic execute mutation, redacted audit, replay protection. Port **example 07** (MCP tooling with sessions). This validates destructive flows and sessions-as-first-class.
3. **Spike C — Boundary story.** Port **either example 06 (cross-tenant with `unsafeDb`) or example 08 (component bridging)**. This validates the escape-hatch and boundary story. Reviewers flagged this as the third proof point.

If all three feel clean, proceed with the rest of v2.2 as a breaking release. If any feels awkward, adjust before committing.

## 29. Open questions

To validate during the spikes. None are architecture blockers.

### 29.1 `allowAnonymous: false` default in `defineTenantRules`

Specified as `false`. Worth a second opinion against real app code. Validate in spike A (example 05 has public surfaces).

### 29.2 Bridge RLS inheritance

Specified that RLS doesn't cross the component bridge. Validate in spike C (if doing example 08). If repetitive rule code shows up, consider `inheritTenantRules(parentShape)` helper.

### 29.3 Service principal granularity

`systemPrincipal` defaults to `{ kind: 'service', service: 'system' }`. Users refine to distinguish `'scheduler' | 'cron' | 'cli' | 'dashboard' | 'action'`. Validate in spike A against any example using scheduled jobs.

### 29.4 OAuth adapter timing

`mcpKeyAuth` ships in v2.2; `mcpOAuth` adapter planned for later v2.x. Open question: does any example require OAuth before v2.2 ships? If a public-facing MCP deployment is in scope, bring the adapter timeline forward.

### 29.5 `bridge.from()` auto-registration ergonomics

Optional feature, framed as convenience not contract (§18.3). Validate in spike C.

---

# Part V — Rationale

## 30. Decision log


Why things are shaped the way they are. Future readers can understand choices without re-reading five rounds of reviews.

### 30.1 `defineFunctions` over `createFunctions`
Matches Convex's `define*` naming convention. `create*` suggests a runtime factory; `define*` suggests a framework declaration.

### 30.2 `publicQuery` / `publicMutation` over `anonQuery` / `anonMutation`
"Anon" miscommunicates — a logged-in user on a share-token route is still on a public client surface. "Public" captures "actor is optional on a client-callable route" correctly.

### 30.3 Internals stay Trellis-aware
"Internal" is visibility (not callable from the public client). "Raw" is policy (bypass the framework). Conflating them meant internal orchestration code silently lost RLS and audit — exactly where it's most needed, because internal code often does cross-tenant work. v2.2 separates: internals are wrapped; `raw.internalMutation` is the one bypass door.

### 30.4 Three db doors
Policy bypass and trigger bypass are different kinds of escape hatch. `unsafeDb` (bypass RLS, keep triggers) is for admin flows that should still be audited. `rawDb` (bypass both) is for migrations and recursion avoidance. Both greppable; both documented with different warning levels.

### 30.5 Procedural-only regular handlers
Earlier drafts kept both procedural and declarative shapes. Vue's dual API is cited as *the* source of confusion for Vue newcomers, not a feature. A framework's safety properties shouldn't depend on users picking the right shape. Procedural-only with `ctx.enforce()` gets there with less surface area. Tradeoff: structural static analysis is lost, replaced by weaker eslint. Accepted for the simplicity gain. Docs are honest about the tradeoff.

### 30.6 `defineOperation` as the structured primitive
The structured shape doesn't vanish — it becomes the canonical form for reusable multi-surface actions. One definition projects to a mutation, a preview query, an MCP tool, an admin UI, and a CLI. Regular mutations don't need this; operations do. This also gives the runtime structural metadata for the safety-critical paths.

### 30.7 RLS deny-by-default
convex-helpers defaults to allow for unlisted tables. Trellis forces `defaultPolicy: 'deny'` in `defineTenantRules`. Setting `'allow'` requires typing the override.

### 30.8 Service principals for non-request contexts
Without a fallback, deny-by-default RLS would make scheduled jobs, cron, CLI, and dashboard work hit an empty db. Users would reach for `rawDb`; the escape hatch would become the sidewalk. Service principals give those flows a normal, auditable path. Docs show narrow service actors, not god actors.

### 30.9 Public client + no auth = anonymous, not service
Explicit precedence order (§6.5): public client calls without auth resolve to `anonymous`. Service fallback is reserved for non-request contexts. The detection is structural (builder type determines path at definition time), not a runtime heuristic.

### 30.10 Destructive MCP tools must be operation-backed
The runtime promise — re-run `guard/load/authorize`, recompute preview, verify hashes — only works if the target has that metadata. Operations do. Arbitrary mutations don't. Enforcement at TypeScript level and again at MCP startup against the manifest.

### 30.11 Forwarded `__principal` scoped to specific adapters
Earlier drafts let the general resolver read `__principal` from args. That meant any ordinary query could be called with a forwarded envelope. v2.2 tightens: each transport has its own adapter that consumes its envelope kind before reaching user code. Envelopes are callee-bound, not just audience-bound.

### 30.12 Confirmation execution is one atomic Convex mutation
Orchestrating preview verification and handler execution from the MCP server creates a TOCTOU gap between transactions. The atomic mutation eliminates the gap — one transaction, serializable isolation, consistent snapshot throughout. Convex makes this easy; use it.

### 30.13 `preview` splits into `display` and `confirm`
Earlier drafts hashed the entire preview output. Any change to user-visible text (translations, timestamps, formatted counts) invalidated confirmations. The split separates "what the user sees" from "what the framework verifies invariant." Only `confirm` is hashed.

### 30.14 `tool.fromOperation` uses string reference + manifest
Operations contain Convex-only code (validators, handlers, references to Convex modules). Importing them into the Nuxt MCP bundle risks bundler issues. String references plus a Convex-build-time manifest keep the boundary clean. MCP validates at startup.

### 30.15 `ctx.runAsService` inside `httpAction`
HTTP actions that validate webhooks need to call internals with a service principal. The helper constructs a signed trusted-caller envelope bound to the target function. Without this, users hand-roll the pattern and make mistakes.

### 30.16 Purpose-specific signing keys with callee binding
Standard crypto hygiene: derive per-purpose keys from the deployment secret, include `aud` and `callee` in every envelope. Prevents a whole category of boundary bugs where one token kind validates as another, or a bridge envelope for component A is replayed against component B.

### 30.17 Explicit bridge wrappers via `bridge.from()`
Earlier drafts promised magical `runMutation` interception. Hard to lint, hard to test, hides the trust boundary. Explicit wrappers materialize typed functions that sign envelopes at call time. Direct unsigned calls fail loudly at the component.

### 30.18 Audit captures redacted/summarized by default
Stack traces, raw args, and raw results are common leak vectors for customer content, tokens, and secrets. Default production capture is conservative — hashes, summaries, code+message errors. Full capture is opt-in.

### 30.19 Replay protection default-on with per-tool opt-out
Component-backed `jti` redemption makes replay impossible by default. Tools that assert genuine idempotency opt out per-tool. No global override.

### 30.20 MCP's internal convex client auto-forwards
Inside `defineMcpApp`, the `convex` client attaches `trellis:mcp-forwarded:v1` envelopes automatically. User code doesn't construct envelopes by hand. Consistency is the runtime's job.

### 30.21 No actor resolver → startup error, no silent fallback
If no `resolveActor` is configured, `defineFunctions` throws at startup. No silent degradation where `query` behaves like `publicQuery`. The cost of typing `publicQuery` is one word; the cost of a runtime fallback that silently drops authorization is a class of bugs. Greenfield doesn't need the convenience.

### 30.22 Don't oversell the linter
Eslint rules catch the common case of forgotten authorization. They don't replace structural guarantees. Docs say this plainly. For security-critical paths, use `defineOperation`.

### 30.23 Graduated on-ramp — `rls` and `triggers` optional
Requiring the full model (principal + actor + RLS + triggers) before writing one query is a learning cliff. Making `rls` and `triggers` optional lets developers start with auth-only and add multi-tenancy when they need it. The framework scales up; it shouldn't demand the full model on day one.

### 30.24 Request vs. non-request is structural, not heuristic
Builder type determines the resolution path at definition time. `query`/`mutation`/`publicQuery`/`publicMutation` never consult `systemPrincipal`. `internalQuery`/`internalMutation` do. No runtime heuristic, no "detect via ctx.scheduler presence." This makes it impossible to accidentally escalate from `anonymous` to `service`.

### 30.25 Error semantics must be specified
A framework that silently drops authorization failures (empty results from RLS) and loudly fails on others (guard throws) with no documented distinction will confuse every user. Error types, debug logging, and fail-safe defaults for visibility pipelines are not optional.

### 30.26 Operation projections are symmetric
`query(previewOf(op))` vs `mutation(op)` is asymmetric and confusing. `query(op.preview)` and `mutation(op.execute)` read consistently and make the operation the source of truth for both projections.

### 30.27 Trellis owns the scope layer
Earlier drafts built on convex-helpers' `wrapDatabaseReader` / `wrapDatabaseWriter`. That design has two costs paid by every user: (1) post-fetch filtering shrinks paginated pages (exp 5), and (2) trigger callbacks inherit RLS and cannot freely write audit rows, producing the "trigger-scope footgun" that leaked into the spec as a whole subsection. A Trellis-owned index-based scope proxy eliminates both: pages are full (exp 8a), and trigger callbacks auto-scope from the triggering document (exp 8d). The tradeoff is ~300 LoC we own. Paid once; user ergonomics improve everywhere.

### 30.28 Compound-index rule stays explicit; no schema wrapper
An earlier revision explored `trellisTable()` — a schema wrapper that auto-compounds indexes so users never type the scope field. The wrapper buys "forgettability" but costs real ergonomics: a second authoring API for tables, hidden behavior where the dashboard shows indexes that differ from source, vendor lock-in at the schema layer, and ongoing maintenance to keep the wrapper compatible with Convex's `TableDefinition` internals.

The final decision keeps the compound-index rule explicit: users write `.index('by_org_status', ['organizationId', 'status'])` themselves on scoped tables. The rule is one rule, it's visible in `schema.ts`, and it's enforced twice — eslint at authoring, proxy at runtime. Users keep vanilla `defineTable`; Trellis stays out of the schema file. This is standard multi-tenant practice and matches how teams think about indexes at scale anyway.

### 30.29 Callee-binding uses the string form, not `fn._name`
The `_generated/api` function references do not expose a documented public accessor for their module-and-export name. Prior drafts showed `fn._name` in pseudo-code; relying on it couples Trellis to a Convex internal. The spec mandates `"module:exportName"` as the callee string (§23.3), resolved via a Trellis-generated index emitted at build time. Validated in experiment 10.

### 30.30 Polish time matters
Earlier drafts optimistically budgeted code and underestimated eslint rules, examples, and docs. Honest estimate: 8 weeks code + 6 weeks polish = ~14 weeks end-to-end.

## 31. Final decisions summary

One-page reference:

1. `defineFunctions` over `createFunctions`.
2. `publicQuery` / `publicMutation` over `anonQuery` / `anonMutation`.
3. `internalQuery` / `internalMutation` stay Trellis-aware.
4. Three db doors: `db`, `unsafeDb`, `rawDb`. Composition is framework-owned and invisible to users.
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
26. No actor resolver → startup error, no silent fallback.
27. `rls` and `triggers` optional in `defineFunctions` — graduated on-ramp.
28. Request vs. non-request detection is structural (builder type), not heuristic.
29. `load`/`preview` must be pure reads — contract, not runtime guard.
30. Error semantics specified — `TrellisGuardError`, `TrellisRLSError`, `TrellisAuthError`.
31. `unsafeDb` gets the same eslint comment requirement as `rawDb`.
32. Service actor `allowedTables` is convention, not runtime-enforced.
33. Operation projections use symmetric `op.preview` / `op.execute`.
34. Polish time is significant (~14 weeks end-to-end).
35. Trellis owns the tenant-scope layer. No convex-helpers RLS wrappers. Three-door composition is framework-owned, not user-composed.
36. Triggers auto-scope from `change.newDoc ?? change.oldDoc`. No `defineTrigger` wrapper.
37. On scoped tables, every custom index starts with the scope field. Eslint + runtime enforce. Vanilla `defineTable` in schema.
38. Callee-binding uses the `"module:exportName"` string form, not `fn._name`.
39. `@noble/hashes` v2.x requires `.js` import suffixes; SHA-256 at `sha2.js` not `sha256`.
40. `jose` accepts raw `Uint8Array` keys — no `crypto.subtle.importKey` needed.
41. `defineOperation` import aliasing blocked by eslint — AST walker matches literal name only.

## 32. Bottom line

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

*Spec v2.2, revised 2026-04-16. All technical assumptions validated via experiments (see findings.md). Begin implementation with Spike A.*