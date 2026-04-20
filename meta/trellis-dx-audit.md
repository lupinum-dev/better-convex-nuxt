# Trellis DX & Safety Audit

**Audience:** Trellis maintainers
**Format:** Every finding has three possible fixes — code change, docs, and automation (CLI / ESLint / codegen). Team picks what's feasible.

**Legend:**

- 🔴 **Critical** — security-relevant or correctness-relevant footgun
- 🟠 **High** — real DX pain that will cost user-hours in the wild
- 🟡 **Medium** — papercut, learning curve, or confusion
- 🟢 **Low** — polish, nice-to-have

---

## Table of Contents

1. [Tenant Isolation is Opt-In](#1-tenant-isolation-is-opt-in) 🔴
2. [Trusted Forwarding Key Exposure](#2-trusted-forwarding-key-exposure) 🔴
3. [The `crossTenant` Escape Hatch](#3-the-crosstenant-escape-hatch) 🔴
4. [MCP Key Role Drift](#4-mcp-key-role-drift) 🟠
5. [Concept Vocabulary Collision](#5-concept-vocabulary-collision) 🟠
6. [Learning Cliff Between Examples 02 and 03](#6-learning-cliff-between-examples-02-and-03) 🟠
7. [Guard Composition Loading Semantics](#7-guard-composition-loading-semantics) 🟠
8. [Seven Files for One Concept](#8-seven-files-for-one-concept) 🟡
9. [`raw` Escape Hatch Naming](#9-raw-escape-hatch-naming) 🟡
10. [Redemption & Audit Table Opt-In](#10-redemption--audit-table-opt-in) 🟡
11. [Permission Matrix Duplicated in UI](#11-permission-matrix-duplicated-in-ui) 🟡
12. [Webhook Bot User Pattern](#12-webhook-bot-user-pattern) 🟡
13. [Shared Folder Runtime Rules](#13-shared-folder-runtime-rules) 🟡
14. [MCP Tool Definition Verbosity](#14-mcp-tool-definition-verbosity) 🟡
15. [`load`/`authorize`/`handler` Ordering](#15-loadauthorizehandler-ordering) 🟡
16. [Delegation Semantics Are Invisible](#16-delegation-semantics-are-invisible) 🟠
17. [Manual User Row Bootstrap](#17-manual-user-row-bootstrap) 🟡
18. [`defineTrellis` Config Shape](#18-definetrellis-config-shape) 🟢
19. [Error Messages Leak Internals](#19-error-messages-leak-internals) 🟡
20. [Testing Ergonomics](#20-testing-ergonomics) 🟢

---

## 1. Tenant Isolation is Opt-In

**Severity:** 🔴 Critical

### The problem

In `convex/functions.ts`, tenant isolation is configured by listing tables:

```ts
tenantIsolation: {
  tables: ['projects', 'tasks', 'comments', 'auditEvents'],
}
```

If someone adds a new table and forgets to add it to this array, nothing enforces tenant boundaries on that table. The whole safety model depends on a human remembering to update an array when they add a table — this is exactly the kind of thing humans don't remember. A developer adds `notifications`, writes a query, ships it, and notifications leak across workspaces. There's no compile-time signal and no runtime warning.

This is the single most dangerous footgun in the whole framework because the failure mode is silent data leakage across tenant boundaries.

### Fix option A — Code change: Invert the default

Make tenant isolation the default for any table that has a `workspaceId` field. Require explicit opt-out for global tables:

```ts
tenantIsolation: {
  // Anything with workspaceId is auto-isolated. This list is only for exceptions.
  globalTables: ['workspaces', 'users', 'auditEvents'],
}
```

The framework already knows the schema. It can introspect which tables have `workspaceId` and auto-isolate them. Opting-out should be the unusual, explicit action — not opting-in.

### Fix option B — Documentation: Add a "Safety Checklist" section

Every example's README gets a checklist section:

```markdown
## Safety checklist before shipping

- [ ] Every tenant-scoped table is listed in `tenantIsolation.tables`
- [ ] Every tenant-scoped table has a `by_workspace` index
- [ ] Every handler that calls `ctx.db.get(id)` is on a tenant-scoped path or uses `loadTenantResource`
```

This shifts the problem to the developer but makes the expectation explicit. It's a weaker fix but cheap to implement today.

### Fix option C — Automation: ESLint rule + CLI check

Two pieces:

1. **ESLint rule `trellis/tenant-isolation-complete`:** Walks the schema, finds every `defineTable` call with a `workspaceId: v.id('workspaces')` field, then checks that the table name appears in the `tenantIsolation.tables` array in `convex/functions.ts`. Reports an error if it doesn't.

2. **CLI command `trellis doctor`:** Runs the same check plus related ones (missing indexes, tables used in `loadResource` but not isolated, etc.) and exits non-zero in CI.

The ESLint rule is the right long-term answer because it catches it at write time, not review time.

---

## 2. Trusted Forwarding Key Exposure

**Severity:** 🔴 Critical

### The problem

`CONVEX_TRUSTED_FORWARDING_KEY` is the single secret that lets server code forge principals. If it leaks — committed to git, exposed via a misconfigured endpoint, included in client bundle — any caller can claim to be any user. The test in example 08 shows the framework correctly rejects non-trusted forwarding attempts, which is good. But the overall surface is still a shared-secret model with no rotation story visible in any example.

Related issue: the key only appears as a raw env var. There's no guidance on rotation, no documentation on what to do if it leaks, and no runtime check that the key isn't a default/development value in production.

### Fix option A — Code change: Detect weak keys + force rotation hooks

Add a startup check in the Convex side:

```ts
// In defineTrellis
if (process.env.NODE_ENV === 'production') {
  if (!trustedForwardingKey || trustedForwardingKey.length < 32) {
    throw new Error('CONVEX_TRUSTED_FORWARDING_KEY must be at least 32 characters in production.')
  }
  if (trustedForwardingKey.includes('dev') || trustedForwardingKey.includes('test')) {
    throw new Error('Production CONVEX_TRUSTED_FORWARDING_KEY appears to be a dev value.')
  }
}
```

Also add support for a keyring so rotation is possible without downtime:

```ts
trustedForwardingKey: {
  current: process.env.CONVEX_TRUSTED_FORWARDING_KEY_V2,
  previous: process.env.CONVEX_TRUSTED_FORWARDING_KEY_V1, // accepted for 24h
}
```

### Fix option B — Documentation: Dedicated security page

Add `docs/security.md` that covers:

- What the key does and what can happen if it leaks
- How to rotate (the mechanical steps)
- Where it's legitimately used vs. where it must never appear
- What to do if it's exposed (incident response checklist)

Link this from every example README's env-var section, not just once in the top-level docs.

### Fix option C — Automation: `trellis check-secrets` CLI

A CLI command that:

- Scans the repo for accidentally committed secrets (`git log -p` + regex for `TRELLIS_` prefixes)
- Scans build artifacts (`.output/`, `.nuxt/`) to verify no trusted-forwarding key leaked into client bundles
- Scans the app for any code path where the key could reach the client (e.g., `useRuntimeConfig().public.*`)
- Runs as a pre-commit hook and in CI

Combine with an ESLint rule that bans `process.env.CONVEX_TRUSTED_FORWARDING_KEY` reads outside of server-only files.

---

## 3. The `crossTenant` Escape Hatch

**Severity:** 🔴 Critical

### The problem

In example 06:

```ts
function crossTenantDb<DB>(db: DB): DB {
  return (db as DB & { crossTenant: DB }).crossTenant
}
```

This exists because legitimate cross-workspace operations need it (agency dashboards, onboarding, the seed action). But:

- The name is neutral. "crossTenant" sounds procedural, not dangerous.
- There's no lint or review-signal when someone uses it.
- It's untyped (the `as DB & { crossTenant: DB }` cast bypasses TypeScript).
- A new developer copy-pastes it into a handler because "it was easier" and bypasses tenant isolation.
- The same pattern shows up in example 05 (`articles.viewArticle` uses `db.crossTenant` for share tokens). It's a common-enough need that it will spread.

### Fix option A — Code change: Rename and type properly

Rename to make the danger explicit:

```ts
// The db now exposes it under a scary name
ctx.db.UNSAFE_crossTenant
// or
ctx.db.crossTenantUnsafe
// or
ctx.db.escapeTenantIsolation({ reason: 'agency_portfolio' })
```

That last variant forces a reason string that gets logged to the audit table automatically. Every crosstenant read is now a traceable event. Combine with proper typing so the `as` cast is no longer needed.

### Fix option B — Documentation: "When is cross-tenant OK?" section

A dedicated docs page that lists the legitimate use cases:

- Workspace creation (no tenant exists yet)
- Agency/admin dashboards (explicitly cross-workspace by product design)
- Share tokens (cross-tenant by design)
- Onboarding flows

Everything else should be suspect. Provide a flowchart: "If your answer is 'I'm reading data for a user who might be in another workspace,' you probably want memberships, not crossTenant."

### Fix option C — Automation: Require a justification comment

ESLint rule `trellis/crosstenant-justification`:

```ts
// @trellis-crosstenant-reason: agency dashboard shows all clients
const db = ctx.db.crossTenant
```

Without the comment annotation, the rule errors. The comment must be non-empty and at least 20 characters. Combine with a `trellis audit crosstenant` CLI that lists every use across the codebase with its justification, for periodic security review.

---

## 4. MCP Key Role Drift

**Severity:** 🟠 High

### The problem

From example 07, MCP keys bind to a user, not to a role:

```ts
effectiveRole: boundUser?.role ?? null,
```

If an admin issues an MCP key for Alice when Alice is a `member`, then promotes Alice to `admin` later, the key's effective role silently upgrades. Downgrade works the same way. This is _correct_ behavior (you want permissions to follow the user) but it's surprising, and most teams don't notice until a security incident.

The test in `mcpReference.test.ts` verifies this behavior, which is good. But there's no runtime signal to the key issuer that the bound user's permissions have changed.

### Fix option A — Code change: Add key-level role ceiling

Let the key issuer specify a maximum role at issuance time:

```ts
await createKey({
  name: 'CI agent',
  boundAuthId: 'user_alice',
  maxRole: 'member', // even if Alice becomes admin, this key stays at member
  prefix,
  hash,
})
```

The effective role is `min(key.maxRole, boundUser.role)`. This makes the key a floor-and-ceiling contract, not just a pointer. Agencies and security teams can issue scoped keys without trusting the app to never promote the user.

### Fix option B — Documentation: Mental model page

Add an explainer called "How MCP keys resolve permissions" that walks through:

- Key is a pointer to a user, not a role snapshot
- Changes to the user propagate to the key
- To freeze permissions, use `maxRole` (after option A lands) or issue a dedicated service account
- Revocation is the only guaranteed way to stop an agent from gaining new permissions

Pair this with a "When an MCP key feels like a service account" section that shows the common confusion.

### Fix option C — Automation: Role change notifications

Whenever a user's role changes, enumerate active MCP keys bound to that user and log an audit event. Optionally, send a notification to the workspace owner:

```
MCP key "CI agent" bound to alice@example.com effectively gained `admin` privileges
because alice's role was changed from `member` to `admin`.
Review: /settings/mcp-keys
```

Low-effort, high-value observability. The data is already there (`boundAuthId`); the trigger is the piece that's missing.

---

## 5. Concept Vocabulary Collision

**Severity:** 🟠 High

### The problem

Trellis has four closely related concepts that share overlapping vocabulary:

| Concept        | File              | What it does                                    |
| -------------- | ----------------- | ----------------------------------------------- |
| **Guard**      | `checks.ts`       | Predicate on actor (sometimes called "check")   |
| **Permission** | `permissions.ts`  | Named guard + role matrix                       |
| **Capability** | `capabilities.ts` | Per-record permission attached to output        |
| **Check**      | mixed             | Sometimes guard, sometimes record-bound factory |

Reading the code, you have to constantly remember which file owns which term. The `isOwnerOf` function in `checks.ts` is technically a guard-factory, but it's exported from a file called `checks`. Permissions use guards internally. Capabilities call permissions. The layering is correct; the naming just makes it hard to hold in your head.

### Fix option A — Code change: Unify under one vocabulary

Pick one term per concept and stick to it. Proposed:

- **Rule** (was guard/check): the primitive predicate
- **Permission** (unchanged): a named rule with metadata
- **Capability** (unchanged): a per-record projection
- Rename `checks.ts` → `rules.ts`
- Rename `defineGuard` → `defineRule`
- Keep `definePermission` and `defineCapabilities`

This is a breaking change, so do it at a major version bump. But the vocabulary drift will only get worse.

### Fix option B — Documentation: Glossary + concept diagram

Add a `docs/concepts.md` with:

1. A one-paragraph definition of each term
2. A diagram showing how they compose (rule → permission → capability)
3. A "When do I reach for what?" decision tree:
   - Need to gate a handler? → permission
   - Need to attach per-record flags? → capability
   - Need to compose smaller predicates? → rule/guard

Stick this at the top of every relevant section. Cross-link it from the first occurrence of each term in every example README.

### Fix option C — Automation: File convention codegen

Have the framework generate `auth/index.ts` that re-exports from each file with clarifying names:

```ts
// Auto-generated by `trellis generate auth`
export { hasRole, hasWorkspace, isOwnerOf } from './checks'
// ↑ rules: predicates on actors and resources

export { workspacePermissions } from './permissions'
// ↑ permissions: named rules with role metadata

export { taskCapabilities } from './capabilities'
// ↑ capabilities: per-record flags for the UI
```

Combine with a `trellis new permission <name>` command that scaffolds the file and adds the glossary comment automatically.

---

## 6. Learning Cliff Between Examples 02 and 03

**Severity:** 🟠 High

### The problem

Example 02 uses a single actor function with direct role checks. Example 03 introduces:

- `defineTrellis(config)` with 5+ config options
- `principal` separate from `actor`
- `tenantIsolation`
- `destructiveSafety`
- `permissions` + `checks` + `capabilities` + `context`
- `defineOperation` for destructive mutations
- `crossTenant` patterns

That's six new abstractions in one example. A developer who just got comfortable with example 02 hits a wall. The examples README says "Move to `03-team-workspace` when you want tenants, roles, and permission context" — but that undersells how much new surface area there is.

### Fix option A — Code change: Add a bridging example "02.5"

Create an intermediate example that adds _only one workspace concept at a time_:

- `02.5-workspace-basics`: Adds `workspaceId`, tenant isolation, and the `by_workspace` index. No roles. No destructive safety. No capabilities. Just "same todo app, but tenant-scoped."

Then example 03 becomes the addition of roles and permission context on top of that foundation. The cliff turns into two shorter steps.

### Fix option B — Documentation: "What's new in this example" section

Every example README gets a "What's new since the previous example" block that diffs the concepts explicitly:

```markdown
## What's new since 02-auth-todo

This example introduces, in order:

1. Multi-tenant schema (workspaces + workspaceId)
2. Actor extension (role field)
3. Guards and permissions (checks.ts, permissions.ts)
4. Permission context (`usePermissions()` composable)
5. Capabilities and `_can` (capabilities.ts)
6. Destructive operations (defineOperation)

Read in that order; each builds on the previous.
```

This is a "READMEs as teaching tool" approach, cheap to implement.

### Fix option C — Automation: Interactive tutorial

A `trellis tutorial` CLI that walks a user through building the Example 03 app step-by-step, pausing to explain each concept as it's introduced. Command-line equivalent of a guided tour. Probably overkill unless you're serious about onboarding as a product feature.

---

## 7. Guard Composition Loading Semantics

**Severity:** 🟠 High

### The problem

Guards look like plain predicates:

```ts
hasWorkspace.and(hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo))))
```

But `isOwnerOf(todo)` requires `todo` to exist _at guard evaluation time_. The framework handles this through the `load` step:

```ts
load: async (ctx, args) => {
  const todo = await ctx.db.get(args.id)
  requireRecord(todo, 'Todo')
  return { todo }
},
authorize: {
  check: (_actor, { todo }) => canUpdateTodo(todo),
},
```

But a new user tries to write:

```ts
guard: hasWorkspace.and(isOwnerOf(await ctx.db.get(args.id))), // ❌ undefined context
```

...and gets confused errors about `ctx` being undefined in the guard scope. The relationship between `guard` (static, no record), `load` (fetches records), and `authorize` (record-bound checks) is the single biggest "I thought I was doing it right" pitfall in the framework.

### Fix option A — Code change: Unify guard + authorize

Let `guard` accept a record-bound factory that takes the loaded resources:

```ts
export const toggle = mutation({
  args: { id: v.id('todos') },
  load: async (ctx, args) => ({ todo: await ctx.db.get(args.id) }),
  guard: ({ todo }) => hasWorkspace.and(canUpdateTodo(todo)),
  handler: async (ctx, args, { todo }) => {
    /* ... */
  },
})
```

One conceptual slot for "who can call this" instead of two (`guard` + `authorize`). The framework figures out whether the guard needs loaded resources and calls it accordingly.

### Fix option B — Documentation: Explicit "when to use what" table

Add to the auth docs:

| I want to check...             | Use                              |
| ------------------------------ | -------------------------------- |
| Actor has a role or permission | `guard`                          |
| Actor owns a specific record   | `authorize: { check }` + `load`  |
| Both                           | `guard` + `authorize: { check }` |

With a worked example of each side-by-side, and the common mistakes flagged explicitly.

### Fix option C — Automation: ESLint rule `trellis/guard-no-async`

Lint rule that errors if a `guard:` value contains:

- `await`
- `ctx.db.*`
- references to `args.*` in a way that looks like a record lookup

With a fix suggestion: "Move record-bound logic to `authorize.check` and load the record in `load:`." Combine with TypeScript types that make the `guard` parameter `never` for contexts that include `ctx`.

---

## 8. Seven Files for One Concept

**Severity:** 🟡 Medium

### The problem

Example 07's `convex/auth/` folder:

```
actor.ts
capabilities.ts
checks.ts
delegation.ts
permissions.ts
principal.ts
services.ts
```

Seven files. Each is small and focused, which is the right instinct. But for a small team or a first-time reader, this is cognitive load that isn't paying its way yet. The division is _correct_ — each file has a clear responsibility — but a developer reading this cold spends the first hour just building a mental map of which file does what.

The README tries to help by listing read-order, but the READMEs are long and the file layout is dense.

### Fix option A — Code change: Provide a single "starter" file

Ship a `convex/auth.ts` that re-exports everything with top-of-file documentation:

```ts
// All authorization primitives for this app, re-exported from auth/*.
// For small apps, you can import everything from here.
// For larger apps, import directly from auth/permissions, auth/checks, etc.

export * from './auth/actor'
export * from './auth/principal'
// ... etc
```

Small apps get a one-import story. Larger apps get the split. Best of both.

### Fix option B — Documentation: Visual file map

Every multi-file auth folder gets a `README.md` inside it with a diagram:

```
auth/
├── principal.ts    → "who is calling" (raw identity from transport)
├── actor.ts        → "who they are in this app" (loaded user + role)
├── checks.ts       → "what rules do we have" (predicates)
├── permissions.ts  → "what actions exist" (named rules)
├── capabilities.ts → "what can this actor do with this record"
├── delegation.ts   → "who are they acting on behalf of"
└── services.ts     → "which service accounts are allowed"
```

Put this right at the top of `auth/`. First-time readers orient in 30 seconds.

### Fix option C — Automation: `trellis explain <concept>` CLI

```bash
trellis explain actor
# → prints the one-paragraph definition, shows the relevant file in your project,
#   and links to the docs page
```

Useful for IDE integration too. Nice-to-have but probably low ROI compared to the README fix.

---

## 9. `raw` Escape Hatch Naming

**Severity:** 🟡 Medium

### The problem

The framework exposes three function builders:

```ts
export const { mutation, query, raw } = defineTrellis(...)
```

The `raw` namespace bypasses all the guard/principal/actor machinery. It's used legitimately for things like upload URL generation and workspace creation. But:

- "raw" doesn't signal danger. It could mean "raw string," "raw input," "raw database access."
- `raw.query` and `raw.mutation` look structurally identical to `query` and `mutation`; a copy-paste error turns a protected handler into an unprotected one.
- There's no way to grep for "all places that bypass the safety model" without knowing to search for this specific identifier.

### Fix option A — Code change: Rename with intent

Options, in order of strength:

```ts
export const { mutation, query, unsafe } = defineTrellis(...)
// or
export const { mutation, query, escapeHatch } = defineTrellis(...)
// or
export const { mutation, query, internal } = defineTrellis(...)
```

"internal" is probably wrong (conflicts with Convex `internalMutation`). "unsafe" is clear but aggressive. `escapeHatch` is verbose but accurate.

Better: require the user to explicitly opt-in at the definition site, not the import:

```ts
export const generateUploadUrl = mutation({
  bypass: 'authorization', // explicit, searchable, reviewable
  handler: async (ctx) => {
    /* ... */
  },
})
```

Now every bypass is a visible annotation, and you can grep for `bypass:` to audit them.

### Fix option B — Documentation: Audit checklist

Add a section: "When is `raw` the right answer?"

Legitimate cases:

- Upload URL generation (actor-scoped but not record-scoped)
- Pre-workspace operations (actor has no tenant yet)
- Public read paths that need cross-tenant queries (share tokens)

Illegitimate cases:

- "It's faster this way"
- "I couldn't figure out the guard"
- "Just this once"

Pair with a rule: every `raw.*` definition must have a `// raw: <reason>` comment above it.

### Fix option C — Automation: Audit CLI + lint

`trellis audit raw` lists every use of `raw.query` and `raw.mutation` in the codebase with file:line and the comment above the definition. Output is suitable for checking into a `SECURITY_REVIEW.md` that gets re-audited periodically.

ESLint rule `trellis/raw-requires-justification` enforces the comment convention at write time.

---

## 10. Redemption & Audit Table Opt-In

**Severity:** 🟡 Medium

### The problem

Destructive safety requires two tables:

```ts
destructiveSafety: {
  redemptionTable: 'destructiveRedemptions' as never,
  auditTable: 'destructiveAuditLog' as never,
}
```

And they must exist in the schema:

```ts
destructiveRedemptions: defineTable({
  jti: v.string(),
  // ...
}).index('by_jti', ['jti']),
destructiveAuditLog: defineTable({ /* ... */ }),
```

The `as never` casts are a red flag — they suggest the types aren't carrying through properly. If a developer adds destructive operations but forgets the schema, they won't know until a runtime error fires on the first destructive call. Or worse, they copy example 03 but forget to copy the schema tables, and the safety tables silently don't exist.

### Fix option A — Code change: Provide a schema helper

```ts
import { withDestructiveSafety } from '@lupinum/trellis/functions'

export default defineSchema({
  ...withDestructiveSafety(), // adds the two required tables
  // your tables
  projects: defineTable({
    /* ... */
  }),
})
```

Now the tables can't be forgotten. The `as never` casts go away because the framework knows the table names.

### Fix option B — Documentation: Required-tables callout

Make it a prominent, boxed callout in the destructive safety docs:

> ⚠️ **Required tables**
> Destructive safety requires two tables in your schema:
>
> - `destructiveRedemptions` with `by_jti` index
> - `destructiveAuditLog`
>   Copy these from [the schema reference](#) exactly. Missing them causes runtime errors.

Include a copy-paste block. Bold, impossible to miss.

### Fix option C — Automation: Schema validator

`trellis doctor` checks that if `destructiveSafety` is configured, the required tables exist in the schema. ESLint rule checks the same thing statically by reading the schema file.

---

## 11. Permission Matrix Duplicated in UI

**Severity:** 🟡 Medium

### The problem

Every example hardcodes a `permissionMatrix` in the page component:

```ts
const recordRuleRows = [
  { label: 'Update own todo', roles: ['owner', 'admin', 'member'] },
  { label: 'Delete own todo', roles: ['owner', 'admin', 'member'] },
]
const permissionMatrix = [...teamWorkspacePermissionMatrix, ...recordRuleRows]
```

The static permission matrix is derived from the permission definitions, which is great. But the record-level rules (`canUpdateTodo`, `canDeleteTodo`) are defined separately in `checks.ts` and then manually re-typed in the UI. The two will drift.

Also: the matrix only shows _role_-level permissions. Record-level and capability-level permissions can't be projected automatically.

### Fix option A — Code change: Annotate record rules with roles

Let record-bound checks carry role metadata:

```ts
export const canUpdateTodo = (todo: { ownerId: string }) =>
  defineGuard<Actor>(
    'Update todo',
    hasWorkspace.and(hasRole('owner', 'admin').or(hasRole('member').and(isOwnerOf(todo)))),
    { label: 'Update own todo', projectedRoles: ['owner', 'admin', 'member'] },
  )
```

Then `derivePermissionMatrix` can include record-level rules too, no UI duplication.

### Fix option B — Documentation: "Matrix drift" warning

Add a section to the permissions docs: "If you have record-level rules, remember to reflect them in your UI matrix. These are not automatically projected."

Weak but cheap.

### Fix option C — Automation: Codegen the matrix

A `trellis generate permission-matrix` command scans the auth files and generates a `matrix.ts` that includes both static and record-level rules. The UI imports from the generated file. Rebuild on schema change.

---

## 12. Webhook Bot User Pattern

**Severity:** 🟡 Medium

### The problem

The webhook bot pattern in example 03:

```ts
export async function ensureWebhookBotUser(
  ctx: MutationCtx,
  workspaceId: Id<'workspaces'>,
  now = Date.now(),
): Promise<void> {
  const authId = getWebhookBotAuthId(workspaceId)
  // Creates a user row with role: 'admin', email: webhook-bot+${workspaceId}@example.test
}
```

A bot user is created per workspace, with admin role and a synthetic email. This works, but:

- The bot user appears in member lists (have to filter it out everywhere)
- It has admin role unconditionally, with no way to scope down
- The synthetic email pattern is magic — if someone queries `users` they'll see `webhook-bot+xxx@example.test` rows
- Example 04 has a different bot pattern; example 07 uses trusted forwarding instead

Three different approaches to the same problem across four examples.

### Fix option A — Code change: First-class service accounts

Model service accounts as a distinct concept from users:

```ts
serviceAccounts: defineTable({
  key: v.string(), // 'webhook-bot'
  workspaceId: v.id('workspaces'),
  capabilities: v.array(v.string()),
  createdAt: v.number(),
})
```

And extend the actor system to recognize them:

```ts
type Actor =
  | { kind: 'user'; userId: string; role: Role; tenantId: Id<'workspaces'> }
  | { kind: 'service'; serviceId: string; tenantId: Id<'workspaces'>; capabilities: string[] }
```

Handlers can permit service actors explicitly. No more synthetic users, no more filtering.

### Fix option B — Documentation: Pick one pattern

The examples should converge on one webhook pattern. Pick trusted forwarding (it's the most principled) and deprecate the bot-user approach. Rewrite examples 03 and 04 to use trusted forwarding. Remove `ensureWebhookBotUser` from the public surface.

Document the migration path for teams already using bot users.

### Fix option C — Automation: Scaffold command

`trellis generate webhook <name>` creates a webhook route with the recommended pattern, correct imports, and matching Convex handler. One source of truth for the pattern, and new users can't pick the wrong one.

---

## 13. Shared Folder Runtime Rules

**Severity:** 🟡 Medium

### The problem

The `shared/` folder has runtime-neutrality rules documented in each README:

> Keep shared files runtime-neutral:
>
> - no Nuxt-only APIs
> - no browser-only APIs
> - no assumptions about `ctx`, `event`, or Vue component state

But nothing enforces this. A developer imports `useToast()` in a shared schema file, it compiles fine in the Nuxt bundle but breaks the Convex bundle. The error shows up as a cryptic Convex build failure.

### Fix option A — Code change: Separate TypeScript project

Make `shared/` its own TypeScript project with a restrictive `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": [],
    "lib": ["ES2022"],
    "moduleResolution": "bundler"
  }
}
```

No DOM types, no Nuxt auto-imports, no Convex server types. TypeScript errors out if you try to use anything runtime-specific.

### Fix option B — Documentation: Curated import list

Add a section: "What you can import in `shared/`":

- ✅ Zod
- ✅ Pure TS/JS
- ✅ `convex/values` (type-only imports work too)
- ❌ Nuxt composables
- ❌ Vue
- ❌ `@lupinum/trellis` server-side bits

With an explicit "if you need both sides to use it, put it here" decision guide.

### Fix option C — Automation: ESLint rule + boundary plugin

Use `eslint-plugin-boundaries` or a custom rule to enforce:

```js
// In shared/
'no-restricted-imports': ['error', {
  patterns: [
    { group: ['vue'], message: 'shared/ cannot import from Vue' },
    { group: ['#app', '#imports'], message: 'shared/ cannot use Nuxt auto-imports' },
    { group: ['convex/server'], message: 'shared/ cannot use Convex server APIs' },
  ],
}]
```

Errors at write time, not at bundle time.

---

## 14. MCP Tool Definition Verbosity

**Severity:** 🟡 Medium

### The problem

A simple MCP tool requires:

```ts
export default tool({
  schema: listRunbooks,
  call: api.domain.runbooks.listPublic,
  operation: 'query',
  group: 'public',
  tags: ['read-only', 'public'],
  meta: {
    name: 'list-public-runbooks',
  },
})
```

Most of this is duplicated metadata. The Convex handler already knows it's a query (it was defined with `query({...})`). The function name is already `listPublic`. The `group` and `tags` are useful but could have defaults based on the path.

### Fix option A — Code change: Infer everything possible

```ts
export default tool(api.domain.runbooks.listPublic)
// Infers: schema (from the Convex function), operation (query/mutation), name (from path)
```

For tools that need more, allow overrides:

```ts
export default tool(api.domain.runbooks.listPublic, {
  group: 'public',
  meta: { name: 'list-public-runbooks' }, // override default name
})
```

Reduce the 80% case to one line.

### Fix option B — Documentation: "Minimum viable tool" section

Show the absolute minimum a tool needs, then progressive enhancements. A lot of the current verbose examples aren't showing the 80% case; they're showing the 100% case.

### Fix option C — Automation: Scaffold + autocomplete

`trellis new mcp-tool <path>` generates the file with sensible defaults. Combine with improved TypeScript types so unused fields show up as hints in the IDE (deprecated when redundant).

---

## 15. `load`/`authorize`/`handler` Ordering

**Severity:** 🟡 Medium

### The problem

The handler spec has three phases:

```ts
export const toggle = mutation({
  guard: todoRead, // 1. static actor gate
  load: async (ctx, args) => ({ todo }), // 2. fetch resources
  authorize: { check: (actor, { todo }) }, // 3. record-bound gate
  handler: async (ctx, args, { todo }) => {
    // 4. do the thing
  },
})
```

This is a well-designed pipeline. But the naming `guard` → `load` → `authorize` → `handler` isn't obvious as a sequence. A reader sees four top-level keys and has to work out the ordering.

Also: `authorize` is an object with a `check` field, which means you can't write `authorize: canUpdateTodo(todo)`. You have to write `authorize: { check: (_actor, { todo }) => canUpdateTodo(todo) }`. That extra wrapper isn't paying for itself in most handlers.

### Fix option A — Code change: Simplify `authorize`

Let `authorize` be either a guard, or a function that returns a guard:

```ts
authorize: canUpdateTodo,                               // takes loaded resources
authorize: (_actor, { todo }) => canUpdateTodo(todo),   // explicit factory
authorize: { check: ..., onFailure: ... },              // object form for advanced cases
```

The common case gets shorter. The advanced case is still available.

### Fix option B — Documentation: Pipeline diagram

Visual:

```
Request
  ↓
[guard]     — actor passes static gate? (no DB access)
  ↓
[load]      — fetch records needed for authz and handler
  ↓
[authorize] — record-bound gate: actor allowed on these specific records?
  ↓
[handler]   — do the thing
  ↓
Response
```

Stick this diagram at the top of every handler doc.

### Fix option C — Automation: Sort keys

ESLint rule that forces keys in pipeline order: `args`, `guard`, `load`, `authorize`, `handler`. Never matters semantically but reading ten handlers with different orderings is mentally taxing.

---

## 16. Delegation Semantics Are Invisible

**Severity:** 🟠 High

### The problem

Delegation is the hardest concept in the framework and it's introduced with the least fanfare. From example 07:

```ts
export const delegation = defineDelegation({
  validator: mcpReferenceDelegationValidator,
  resolve: async (ctx, args): Promise<McpReferenceDelegation | null> =>
    getForwardedDelegation<McpReferenceDelegation>(ctx, args),
})
```

A reader who hasn't internalized "principal is the caller, delegation is who they act for" will see this and think it's duplicated auth. The difference between:

- `principal: agent:abc` + `delegation: user:alice` (MCP agent acting for Alice)
- `principal: user:alice` + no delegation (Alice in browser)
- `principal: service:webhook` + `delegation: user:alice` (webhook acting for Alice)

...matters _enormously_ for audit trails, permission resolution, and debugging. But the docs don't make the distinction load-bearing.

### Fix option A — Code change: Delegation in every audit event

Every audit log entry, every error message, and every trace should include both principal and delegation:

```
[denied] Create runbook
  principal: agent:mcp_key_abc123
  acting_for: user:alice
  reason: 'alice has role viewer; needs member'
```

This makes the delegation concept show up everywhere, not just in code. Users learn it by seeing it.

### Fix option B — Documentation: Dedicated delegation page

A single docs page that explains:

1. The three identity layers (principal, delegation, actor) with a visual
2. A table of realistic scenarios:
   | Scenario | Principal | Delegation | Resolved Actor |
   |---|---|---|---|
   | User in browser | `user:alice` | none | actor(alice) |
   | MCP agent for user | `agent:key` | `user:alice` | actor(alice) |
   | Webhook for user | `service:hook` | `user:bob` | actor(bob) |
   | Background job | `service:cron` | none | system |
3. When delegation is required vs. optional
4. How it interacts with permissions (delegation determines actor resolution, not permission checks)

This should be the _first_ thing someone reads after the canonical example, not an advanced branch.

### Fix option C — Automation: `trellis trace` CLI

A debug command that takes a failed request (from a log) and prints the full identity chain:

```
Request: POST /mcp — tool: create-runbook
  Principal:    agent:mcp_abc (from Bearer token)
  Delegation:   user:alice (from token binding)
  Resolved:     actor(alice, role=viewer, workspace=acme)
  Required:     runbook.create (roles: owner, admin, member)
  Result:       DENIED
```

Makes the abstract concrete.

---

## 17. Manual User Row Bootstrap

**Severity:** 🟡 Medium

### The problem

Better Auth creates an auth subject. Trellis expects a `users` row keyed by `authId`. The bridging happens through `createUserIfNeeded`, which is documented but has some sharp edges:

- The first sign-in must create the user row; if that fails, the user is in a half-created state
- Example 02's page has logic for "actorReady" that depends on the user row existing
- The pattern is repeated in every example but slightly different each time (some use `userFields: () => ({ role: 'member' })`, some don't, some have extra fields)

A new user gets Better Auth working, then their first query fails with "Current user row not found" because the bootstrap didn't fire at the right moment.

### Fix option A — Code change: Bootstrap guarantee

Make the framework guarantee that `ctx.actor()` never returns a "user exists in auth but not in app" inconsistency. If the auth subject exists and the user row doesn't, create it transparently (with configurable defaults) before the first actor resolution completes.

```ts
defineTrellis(..., {
  actorBootstrap: {
    onFirstSeen: async (ctx, authSubject) => ({
      authId: authSubject.subject,
      email: authSubject.email,
      role: 'member',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  },
})
```

No more race conditions, no more half-created users.

### Fix option B — Documentation: "The first sign-in" page

A docs page specifically about the user-row bootstrap moment. What can go wrong, how to detect it, how to recover. Include error messages you might see and what each one means.

### Fix option C — Automation: Doctor check

`trellis doctor` scans auth events and user rows, reports any auth subjects without matching user rows, and offers to repair them.

---

## 18. `defineTrellis` Config Shape

**Severity:** 🟢 Low

### The problem

The config object has grown organically:

```ts
defineTrellis(
  { query, mutation, internalQuery, internalMutation }, // generator bindings
  {
    principal, // identity resolution
    actor, // identity resolution
    delegation, // identity resolution
    services, // identity resolution
    tenantIsolation, // safety
    destructiveSafety, // safety
    trustedForwardingKey, // safety
  },
)
```

Seven top-level keys in the config object, grouped conceptually but not structurally. For a new user, it's hard to see which keys go together.

### Fix option A — Code change: Nest by concern

```ts
defineTrellis(generators, {
  identity: { principal, actor, delegation, services },
  safety: { tenantIsolation, destructiveSafety, trustedForwardingKey },
})
```

Structural grouping matches conceptual grouping. One more level of nesting, but much easier to read at a glance.

### Fix option B — Documentation: Commented reference config

A canonical "here's what every option does" config example with comments on every field:

```ts
defineTrellis(generators, {
  // === Identity resolution ===

  // Required. Resolves transport identity into a typed principal.
  // See: docs/concepts/principal.md
  principal,

  // Required. Resolves a principal into an app-level actor (user + role + tenant).
  // See: docs/concepts/actor.md
  actor,

  // Optional. Support for "A acts on behalf of B" identities.
  // See: docs/concepts/delegation.md
  delegation,
})
```

### Fix option C — Automation: Config generator

`trellis init config` prompts for the configuration choices (auth type, tenant model, MCP enabled) and writes the config file with annotations.

---

## 19. Error Messages Leak Internals

**Severity:** 🟡 Medium

### The problem

Runtime errors surface with framework terminology:

```
Forbidden: Update todo
Forbidden: Read runbooks
Document belongs to a different tenant.
Current actor is not assigned to a workspace.
```

These are fine for developers but will show up in user-facing UIs if not caught. Worse, they leak information:

- "Document belongs to a different tenant" confirms the document exists
- "Not enrolled in this knowledge base" confirms the KB exists
- The `deny('...')` messages vary in tone and information-leakage policy across examples

An attacker probing permissions can learn which records exist and which don't based on error wording.

### Fix option A — Code change: Normalize error messages

Two error levels:

- **Developer-facing** (logs, dev console): rich detail, framework vocabulary, stack traces
- **User-facing** (thrown to the client): single constant, "Not available."

```ts
throw deny('Document belongs to a different tenant.', {
  userMessage: 'Not available.',
  auditDetails: { attemptedCrossTenant: true, docId },
})
```

The framework decides which surface sees which version. Users get no information leakage; developers get full context.

### Fix option B — Documentation: Error message conventions

Document the convention: "Denial messages must not reveal existence." Provide a cheatsheet:

- ✅ "Not available."
- ✅ "Action not permitted."
- ❌ "Document belongs to a different tenant."
- ❌ "Not enrolled in this knowledge base."

Refactor the examples to follow the convention.

### Fix option C — Automation: ESLint rule

`trellis/no-info-leaking-denials` flags `deny()` calls whose message matches certain patterns (contains "tenant", "workspace", "exists", "not found" for a guard-context, etc.).

---

## 20. Testing Ergonomics

**Severity:** 🟢 Low

### The problem

The `seedTenant` helper is great, but the lower-level `createTestContext` requires manual seeding for anything off the happy path:

```ts
await ctx.seed('users', { authId, email, role, ... })
await ctx.raw.run(async (innerCtx) => {
  await innerCtx.db.patch(team.users.member.id, { workspaceId: undefined })
})
```

For complex authorization scenarios (share tokens, enrollment, prerequisites), tests get verbose. Example 05's tests run 500+ lines. Compare to the actual feature they're testing and the ratio is off.

### Fix option A — Code change: Fixture builder

```ts
const fixture = await ctx.fixture({
  tenant: 'acme',
  users: { alice: 'owner', bob: 'member' },
  knowledgeBase: { title: 'Docs', status: 'published' },
  articles: [
    { title: 'Intro', visibility: 'workspace', status: 'published' },
    { title: 'Advanced', visibility: 'workspace', prerequisite: 'Intro' },
  ],
})
```

A DSL for the common "set up a realistic scenario" pattern.

### Fix option B — Documentation: Pattern library

A docs page showing copy-pastable test setups for common scenarios: "enrollment with prerequisites," "share token flows," "agency membership," etc. Cut the boilerplate by providing working starting points.

### Fix option C — Automation: Snapshot-style assertions

```ts
expect(await alice.query(api.domain.articles.list, {})).toMatchPermissionsSnapshot({
  visible: ['Intro', 'Advanced'],
  hidden: ['Private notes'],
  redacted: { 'Internal review': ['internalNotes'] },
})
```

A custom matcher that understands permission-test semantics. Clearer intent than checking array lengths and field existence separately.

---

## Cross-Cutting Recommendations

Outside individual issues, a few patterns worth considering at the framework level.

### Adopt a "safe-by-default" stance

Tenant isolation, destructive safety, and permission checks should all be opt-out rather than opt-in. The current posture ("you can add these safety layers") invites omission. A posture of "these are on; here's how to turn them off for a specific case, with justification" invites security-first thinking.

### Ship a `trellis doctor` CLI

Several of the findings above converge on "a CLI that checks common misconfigurations would help." Consolidate them into one `trellis doctor` command that runs in CI, produces a single report, and covers:

- Tenant isolation table completeness
- Schema matches framework expectations
- Required tables for destructive safety exist
- No trusted forwarding keys in client bundles
- No `raw.*` definitions without justification comments
- No cross-tenant db accesses without reason annotations

### Ship an ESLint preset

A `@lupinum/eslint-config-trellis` package that bundles:

- All the write-time rules mentioned above
- Import boundary rules for `shared/`
- Convention enforcement for permission matrices, auth file organization, and handler pipeline ordering

Teams adopt one preset and get all the guardrails.

### Version the safety contract

When the framework changes how any of these primitives work, emit a migration note with a major version bump. Teams pinning to `@lupinum/trellis@^1` should not wake up to changed tenant isolation semantics without explicit upgrade steps.

### Document the threat model

A `SECURITY.md` at the root that explains:

- What Trellis protects against
- What Trellis explicitly does NOT protect against
- Expected incident response when the trusted forwarding key leaks
- What a Trellis-shaped app should monitor in production

Sets expectations for security-conscious teams evaluating the framework.

---

## Priority Summary

If the team can only fix five things, I'd order them:

1. **#1 — Tenant isolation opt-in.** This is a silent data-leak vector.
2. **#3 — `crossTenant` escape hatch.** Same class of problem, different vector.
3. **#7 — Guard composition semantics.** Biggest DX papercut; costs hours per team.
4. **#16 — Delegation visibility.** Hardest concept, least documented.
5. **#4 — MCP key role drift.** Will show up in a real incident eventually.

Everything else can wait for a v2 or a documentation sprint. These five are the ones where the current state actively produces bugs or security issues in real use.
