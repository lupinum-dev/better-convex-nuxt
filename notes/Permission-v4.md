# better-convex-nuxt Authorization Spec

> The module provides the kernel. Your app provides the rules.

**Version:** 4.0
**Platform:** Convex + Nuxt (via better-convex-nuxt)
**Model:** Primitives + Recipes

---

## Table of contents

1. What this is
2. Design principles
3. What the module owns vs what your app owns
4. The three shapes
5. Module API reference
6. The recipe system
7. Building your auth layer (step by step)
8. Frontend integration
9. The standard handler pattern
10. Recipe: Project management
11. Recipe: CRM
12. Recipe: Course / LMS platform
13. Recipe: E-commerce back office
14. Recipe: Freemium B2B
15. Recipe: Collaboration / document sharing
16. Recipe: Agency / multi-client portal
17. Testing
18. Anti-patterns
19. Migration from v2/v3
20. LLM prompt contract
21. SaaS coverage map

---

## 1. What this is

This spec defines how authorization works in better-convex-nuxt.

The module ships a small set of composable primitives — check runners, boolean
composition, session helpers, visibility filters, a frontend composable factory,
and testing utilities.

Your authorization logic — the roles, the rules, the tenant model, the business
guards, the visibility filters, the relationship checks — lives in your codebase
as plain functions. Recipes give you copy-paste starting points organized by SaaS type.

The framework is small and stays out of your authorization policy.

---

## 2. Design principles

### Code over configuration

Authorization rules are functions, not config objects. A permission check is a
function that returns a boolean. A guard is a function that throws on failure.
A visibility filter is a function that narrows a query. You read them, debug them,
test them, and change them.

### Owned over imported

The parts of authorization that make your app YOUR app — the roles, the ownership
rules, the enrollment checks, the plan limits — live in your `convex/auth/` folder.
You own those files. You modify them freely. The module only provides the tiny
composable pieces you build with.

### Explicit over implicit

No hidden execution order. No automatic tenant scoping you can't see. No magic
context injection. Every authorization decision is a visible function call in your
handler. When something goes wrong, you set a breakpoint in your own code.

### Three shapes, one philosophy

Not everything in authorization has the same function signature. Pure checks,
async guards, and visibility filters are different shapes. But they're all
user-owned functions composed from the same primitives. The module doesn't ask
you to categorize your logic into slots or layers — you just write functions.

### User-built helpers over framework wrappers

The module does not ship app-shaped wrappers like `scopedMutation` or
`requireTenantResource`. Instead, it provides primitives that let you build
those helpers in your own codebase. Recipes may include helper files you can
copy and adapt, but those helpers are not framework API. They're your code.

### Recipes are starting points, not contracts

Recipes are starter implementations organized by SaaS type. Copy them, rename
them, delete them, split them, or replace them entirely. They show how to compose
the primitives for common patterns. They are not the official architecture.

---

## 3. What the module owns vs what your app owns

### The module owns

- Check composition primitives (`and`, `or`, `not`, `all`, `any`)
- Authorization runners (`authorize`, `can`, `deny`)
- Session resolution (`getAuth`)
- Key verification (`verifyKey`)
- Visibility filter helpers (`defineVisibility`, `applyVisibility`)
- Frontend composable factory (`createAuth`)
- Route guard composable (`useAuthGuard`)
- Testing utilities (`createTestContext`)

### Your app owns

- The actor shape and resolution logic
- Roles and what they mean
- Tenant/workspace model
- All check functions (`hasRole`, `isOwnerOf`, `isAuthenticated`, ...)
- All guard functions (`ensureTenant`, `requireRecord`, `requireEnrollment`, ...)
- All visibility filters
- Plan and feature logic
- Sharing and token logic
- Business-state rules
- Convenience helpers
- Audit logging strategy

The module never knows about your schema, your roles, your plans, or your
business rules. It provides the kernel. You provide everything else.

---

## 4. The three shapes

Authorization code comes in three shapes. They have different signatures and
different naming conventions, but they're all user-owned functions built from
the same primitives.

### Checks — pure, synchronous, composable

A check is a function that takes an actor and returns a boolean.
Checks compose with `and`/`or`/`not`. They never touch the database.
They never throw.

Naming convention: `has*`, `is*`, `can*`

```ts
// These are checks
const isAuthenticated = (a: Actor) => a !== null;
const hasRole =
  (...roles: string[]) =>
  (a: Actor) =>
    !!a && roles.includes(a.role);
const isOwnerOf = (resource: { ownerId: string }) => (a: Actor) =>
  !!a && a.kind === "user" && resource.ownerId === a.userId;

// Checks compose with boolean logic
const canUpdateTask = (task: Doc<"tasks">) =>
  or(hasRole("owner", "admin"), and(hasRole("member"), isOwnerOf(task)));
```

Checks are safe to use on both server and client.

### Guards — async, database-backed, throw on failure

A guard is an async function that reads the database and throws `deny()` if
something is wrong. Guards enforce tenant boundaries, resource existence,
relationship requirements, and business-state rules.

Naming convention: `ensure*` for boundaries, `require*` for relationships

```ts
// These are guards
function ensureTenant(actor: Actor, resource: { workspaceId: string }): void {
  if (!actor) throw deny("Not authenticated.");
  if (actor.tenantId !== resource.workspaceId)
    throw deny("Resource not found.");
}

function requireRecord<T>(doc: T | null, label = "Resource"): asserts doc is T {
  if (!doc) throw new Error(`${label} not found.`);
}

async function requireEnrollment(db, actor: Actor, courseId) {
  const enrollment = await db
    .query("enrollments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", actor.userId).eq("courseId", courseId),
    )
    .first();
  if (!enrollment || enrollment.status !== "active")
    throw deny("Not enrolled.");
  return enrollment;
}

async function ensureWithinLimit(db, actor: Actor, resource: string) {
  // ... count rows, throw deny() if over limit
}
```

Guards are server-only. They cannot run on the client.

### Filters — query narrowing for list endpoints

A filter is a function that takes an actor and a database reader, and returns
a narrowed query or an array. Filters answer "which rows can this actor see?"
which is different from "can this actor read rows from this table?"

Naming convention: `define*Visibility`, `apply*Visibility`

```ts
const contactVisibility = defineVisibility(async (actor, db) => {
  if (["owner", "admin"].includes(actor.role)) {
    return db
      .query("contacts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", actor.tenantId));
  }
  return db
    .query("contacts")
    .withIndex("by_owner", (q) => q.eq("ownerId", actor.userId));
});
```

Prefer indexed query narrowing when possible. Use in-memory filtering only
for small datasets or complex join logic that can't be expressed as an index.

Filters are server-only.

---

## 5. Module API reference

The complete public API. This is everything you install.

### Check composition

```ts
import { and, or, not, all, any } from "better-convex-nuxt/auth";
```

- `and(...checks)` — returns `true` only if every check returns `true`
- `or(...checks)` — returns `true` if any check returns `true`
- `not(check)` — inverts a check
- `all(...checks)` — alias for `and`, reads better in long lists
- `any(...checks)` — alias for `or`, reads better in long lists

Checks are functions of shape `(actor: any) => boolean`. Composition returns
the same shape.

```ts
const canManage = or(
  hasRole("owner", "admin"),
  and(hasRole("member"), isOwnerOf(task)),
);
```

### Authorization runners

```ts
import { authorize, can, deny } from "better-convex-nuxt/auth";
```

**`authorize(actor, label, check)`** — hard check. Throws on failure.

```ts
authorize(actor, "Create task", canCreateTask);
// If canCreateTask(actor) returns false:
//   throws ConvexError({ code: 'FORBIDDEN', message: 'Forbidden: Create task' })
```

Implementation:

```ts
function authorize(actor, label, check) {
  if (typeof check === "function" ? check(actor) : check) return;
  throw new ConvexError({ code: "FORBIDDEN", message: `Forbidden: ${label}` });
}
```

**`can(actor, check)`** — soft check. Returns boolean.

```ts
if (can(actor, canUpdateTask(task))) {
  // update it
} else {
  results.skipped.push(task._id);
}
```

Implementation:

```ts
function can(actor, check) {
  try {
    return typeof check === "function" ? !!check(actor) : !!check;
  } catch {
    return false;
  }
}
```

**`deny(reason, source?)`** — throws a ConvexError with FORBIDDEN code.

```ts
throw deny("Project is archived.");
// → ConvexError({ code: 'FORBIDDEN', message: 'Project is archived.' })

throw deny("Refund window closed.", "refund_guard");
// → ConvexError({ code: 'FORBIDDEN', message: 'Refund window closed.', source: 'refund_guard' })
```

`deny()` always throws. It is used in handlers and guards, never in checks.
Checks return booleans. Guards and handlers throw denials.

### Session and key helpers

```ts
import { getAuth, verifyKey } from "better-convex-nuxt/auth";
```

**`getAuth(ctx)`** — extracts the authenticated identity from Convex auth.

```ts
const identity = await getAuth(ctx);
// → { subject: 'user_abc', email: 'alice@example.com', name: 'Alice' } | null
```

This wraps `ctx.auth.getUserIdentity()`. Your `getActor()` function calls it
and enriches the result with role, tenant, and plan from your database.

**`verifyKey(provided, expected)`** — constant-time string comparison.

```ts
const valid = verifyKey(providedKey, process.env.SERVICE_KEY ?? "");
// → boolean
```

Used in service/webhook authentication to prevent timing attacks.

### Visibility filters

```ts
import { defineVisibility, applyVisibility } from "better-convex-nuxt/auth";
```

**`defineVisibility(fn)`** — creates a named visibility filter.

```ts
const contactVisibility = defineVisibility(async (actor, db) => {
  if (["owner", "admin"].includes(actor.role)) {
    return db
      .query("contacts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", actor.tenantId));
  }
  return db
    .query("contacts")
    .withIndex("by_owner", (q) => q.eq("ownerId", actor.userId));
});
```

The function receives the actor and a database reader. It returns either a
Convex query (preferred — supports pagination and ordering downstream) or
an array (for complex join logic).

**`applyVisibility(filter, actor, db)`** — resolves a visibility filter.

```ts
const contacts = await applyVisibility(contactVisibility, actor, ctx.db);
```

If the filter returned a Convex query, `applyVisibility` collects it.
If it returned an array, it passes through. If the actor is null, returns `[]`.

For paginated endpoints, call the filter function directly instead of
using `applyVisibility`, so you keep the query object for `.paginate()`:

```ts
const query = await contactVisibility.resolve(actor, ctx.db);
return query.order("desc").paginate(args.paginationOpts);
```

### Frontend composable

```ts
import { createAuth } from "better-convex-nuxt/composables";
```

**`createAuth(opts)`** — creates the permission composable and route guard.

```ts
const { usePermissions, useAuthGuard } = createAuth({
  query: api.auth.getPermissionContext,
});
```

See section 8 (Frontend integration) for the full story.

### Testing

```ts
import { createTestContext } from "better-convex-nuxt/testing";
```

See section 17 (Testing) for the full story.

### Complete export list

```
better-convex-nuxt/auth
  and, or, not, all, any       — check composition
  authorize                    — hard check (throws)
  can                          — soft check (returns boolean)
  deny                         — throw a denial
  getAuth                  — raw session identity
  verifyKey                    — constant-time key comparison
  defineVisibility             — create a visibility filter
  applyVisibility              — resolve a visibility filter

better-convex-nuxt/composables
  createAuth                   — frontend composable factory

better-convex-nuxt/testing
  createTestContext             — test harness
```

Thirteen exports. That's the entire module surface for authorization.

---

## 6. The recipe system

Recipes drop real files into your `convex/auth/` folder. They're your code from
the moment they land. Modify them, rename them, delete parts, add parts.

### CLI

```bash
# Base auth files (every project needs these)
npx better-convex-nuxt add auth

# SaaS-specific recipes (adds additional files)
npx better-convex-nuxt add auth:crm
npx better-convex-nuxt add auth:lms
npx better-convex-nuxt add auth:ecommerce
npx better-convex-nuxt add auth:freemium
npx better-convex-nuxt add auth:collaboration
npx better-convex-nuxt add auth:agency

# Individual blocks
npx better-convex-nuxt add auth:visibility
npx better-convex-nuxt add auth:share-tokens
npx better-convex-nuxt add auth:service-auth
npx better-convex-nuxt add auth:usage-limits
npx better-convex-nuxt add auth:audit
```

### What `npx better-convex-nuxt add auth` creates

```
convex/auth/
  actor.ts          — resolves who is calling
  checks.ts         — your permission checks (pure, composable)
  scope.ts          — tenant boundary and resource-loading guards
```

### Additional files by recipe

| Recipe               | Adds                                | Purpose                                |
| -------------------- | ----------------------------------- | -------------------------------------- |
| `auth:crm`           | `visibility.ts`, `redaction.ts`     | Row-level filtering, field sensitivity |
| `auth:lms`           | `enrollment.ts`, `prerequisites.ts` | Relationship-based access              |
| `auth:ecommerce`     | `service-auth.ts`, `idempotency.ts` | Webhook/service actors                 |
| `auth:freemium`      | `plans.ts`, `limits.ts`             | Feature flags, usage counting          |
| `auth:collaboration` | `page-access.ts`, `share-tokens.ts` | Per-document access, public links      |
| `auth:agency`        | `agency.ts`                         | Cross-tenant membership                |

You only carry the files you need. A project management app has 3 files.
A collaboration platform might have 7.

---

## 7. Building your auth layer (step by step)

### Step 1: Define your actor

```ts
// convex/auth/actor.ts
// This file is YOURS. The recipe gives you a starting point.

import { getAuth, verifyKey } from "better-convex-nuxt/auth";
import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

export type Actor =
  | {
      kind: "user";
      userId: string;
      role: string;
      tenantId: string;
      plan?: string;
    }
  | { kind: "service"; serviceId: string; role: string; tenantId: string }
  | null;

type Ctx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

export async function getActor(ctx: Ctx): Promise<Actor> {
  const identity = await getAuth(ctx);
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_id", (q) => q.eq("authId", identity.subject))
    .first();

  if (!user?.workspaceId) return null;

  return {
    kind: "user",
    userId: user.authId,
    role: user.role,
    tenantId: user.workspaceId,
    plan: user.plan,
  };
}

export function getServiceActor(
  key: string,
  identity: { userId: string; role: string; tenantId: string },
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY?.trim() || "";
  if (!verifyKey(key, expected)) return null;
  return { kind: "service", serviceId: "service", ...identity };
}
```

### Step 2: Define your checks

```ts
// convex/auth/checks.ts
// Pure functions. Composable. Work on server and client.

import { and, or } from "better-convex-nuxt/auth";
import type { Actor } from "./actor";
import type { Doc } from "../_generated/dataModel";

// --- Base checks ---
export const isAuthenticated = (a: Actor) => a !== null;
export const hasRole =
  (...roles: string[]) =>
  (a: Actor) =>
    !!a && roles.includes(a.role);
export const isOwnerOf = (resource: { ownerId: string }) => (a: Actor) =>
  !!a && a.kind === "user" && resource.ownerId === a.userId;

// --- Composed checks (these are YOUR app's rules) ---
export const canCreateProject = hasRole("owner", "admin");
export const canArchiveProject = hasRole("owner", "admin");

export const canCreateTask = hasRole("owner", "admin", "member");
export const canAssignTask = hasRole("owner", "admin");
export const canUpdateTask = (task: Doc<"tasks">) =>
  or(hasRole("owner", "admin"), and(hasRole("member"), isOwnerOf(task)));

export const canComment = hasRole("owner", "admin", "member", "viewer");
export const canManageMembers = hasRole("owner", "admin");
export const canViewAudit = hasRole("owner", "admin");
```

### Step 3: Define your guards

```ts
// convex/auth/scope.ts
// Guards that throw. Server-only.

import { deny } from "better-convex-nuxt/auth";
import type { Actor } from "./actor";

export function ensureTenant(
  actor: Actor,
  resource: { workspaceId: string },
): void {
  if (!actor) throw deny("Not authenticated.");
  if (actor.tenantId !== resource.workspaceId)
    throw deny("Resource not found.");
}

export function requireRecord<T>(
  doc: T | null | undefined,
  label = "Resource",
): asserts doc is T {
  if (!doc) throw new Error(`${label} not found.`);
}

// Convenience: load + verify existence + verify tenant in one call
export function loadResource<T extends { workspaceId: string }>(
  actor: Actor,
  doc: T | null | undefined,
  label = "Resource",
): T {
  requireRecord(doc, label);
  ensureTenant(actor, doc);
  return doc;
}
```

### Step 4: Set up the context query

```ts
// convex/auth/context.ts

import { query } from "../_generated/server";
import { can } from "better-convex-nuxt/auth";
import { getActor } from "./actor";
import {
  canCreateProject,
  canArchiveProject,
  canCreateTask,
  canAssignTask,
  canComment,
  canManageMembers,
  canViewAudit,
} from "./checks";

export const getPermissionContext = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx);
    if (!actor) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", actor.userId))
      .first();

    return {
      role: actor.role,
      plan: actor.plan ?? "free",
      userId: actor.userId,
      tenantId: actor.tenantId,
      email: user?.email,
      displayName: user?.displayName,

      // Pre-computed global capabilities for the frontend.
      // Only checks that depend on role/plan go here.
      // Resource-specific checks go in withCan() on query results.
      can: {
        "project.create": can(actor, canCreateProject),
        "project.archive": can(actor, canArchiveProject),
        "task.create": can(actor, canCreateTask),
        "task.assign": can(actor, canAssignTask),
        "comment.create": can(actor, canComment),
        "workspace.members": can(actor, canManageMembers),
        "workspace.audit": can(actor, canViewAudit),
      },
    };
  },
});
```

### Step 5: Set up the frontend composable

```ts
// composables/usePermissions.ts

import { createAuth } from "better-convex-nuxt/composables";
import { api } from "~/convex/_generated/api";

export const { usePermissions, useAuthGuard } = createAuth({
  query: api.auth.context.getPermissionContext,
});
```

---

## 8. Frontend integration

The frontend never makes authorization decisions. It reads decisions the
backend already made. The backend is the enforcer. The frontend reflects.

### Two layers of permission data

**Layer 1: Global capabilities** from the context query.

These are pre-computed booleans that depend only on the actor's role and plan.
They answer "what can this user do in general?" and arrive via the
`getPermissionContext` query.

```vue
<script setup>
const { can, role, plan } = usePermissions();

// Global check — "can this role create tasks at all?"
const canCreate = can("task.create");
const canManage = can("workspace.members");
</script>

<template>
  <form v-if="canCreate" @submit.prevent="handleCreate">
    <input v-model="title" placeholder="New task" />
    <button type="submit">Add</button>
  </form>

  <NuxtLink v-if="canManage" to="/admin">Admin</NuxtLink>
</template>
```

`can('task.create')` returns a `ComputedRef<boolean>`. It reads from the
context query's `can` object. When the backend role changes, it updates
reactively through Convex's subscription system.

**Layer 2: Resource-specific permissions** colocated with query results.

These are per-item booleans that depend on the specific resource (ownership,
access level, document state). They travel with the data.

On the backend, use the `withCan` recipe helper:

```ts
// convex/auth/resource.ts — YOUR file (from recipe)

export function withCan<T extends Record<string, any>>(
  doc: T,
  checks: Record<string, boolean>,
): T & { _can: Record<string, boolean> } {
  return { ...doc, _can: checks };
}
```

```ts
// In a query handler
return tasks.map((task) =>
  withCan(task, {
    update: can(actor, canUpdateTask(task)),
    delete: can(actor, canUpdateTask(task)),
  }),
);
```

On the frontend, read `_can` directly:

```vue
<template>
  <div v-for="task in tasks" :key="task._id">
    <span>{{ task.title }}</span>
    <button v-if="task._can.update" @click="move(task._id)">Move</button>
    <button v-if="task._can.delete" @click="remove(task._id)">Delete</button>
  </div>
</template>
```

No extra composable. No extra query. The permissions came with the data.

### What usePermissions returns

```ts
const {
  ctx, // Ref<ContextResult | null> — raw context query result
  role, // Ref<string | null>
  plan, // Ref<string | null>
  userId, // Ref<string | null>
  tenantId, // Ref<string | null>
  isAuthenticated, // Ref<boolean>
  can, // (key: string) => ComputedRef<boolean>
} = usePermissions();
```

### Route guards

```vue
<script setup>
// Redirects to '/' if the actor doesn't have this capability
useAuthGuard({ can: "workspace.audit", redirectTo: "/" });
</script>
```

`useAuthGuard` reads from the context query's `can` object. It's reactive —
if a role changes while the page is open, the guard re-evaluates and redirects
if the capability is gone.

For custom guard logic:

```ts
useAuthGuard({
  check: (ctx) => ctx.role === "owner",
  redirectTo: "/",
  message: "Owner access required.",
});
```

### When to use which layer

| Question                           | Layer                         | Example                        |
| ---------------------------------- | ----------------------------- | ------------------------------ |
| Can this role create tasks?        | Global (`can('task.create')`) | Show/hide creation form        |
| Can this user update THIS task?    | Resource (`task._can.update`) | Show/hide edit button per item |
| Should this page be accessible?    | Route guard (`useAuthGuard`)  | Admin dashboard, settings      |
| How many projects can they create? | Context query (`ctx.usage`)   | Usage badge, disabled button   |

### The golden rule

Every `v-if="task._can.update"` in a template reflects a decision the backend
already made inside `withCan(task, { update: can(actor, canUpdateTask(task)) })`.
The mutation handler ALSO calls `authorize(actor, 'Update task', canUpdateTask(task))`
before doing anything. The `_can` data is a UX courtesy, not a security boundary.

If `_can` data is missing → the UI hides the action. Safe by default.
If someone hacks the frontend → the mutation rejects. Enforced on the server.
If a role changes → both context and resource queries update. Consistent.

---

## 9. The standard handler pattern

Every mutation and query follows the same sequence. This is the pattern recipes
teach and the one LLMs should follow.

### For mutations

```ts
export const create = mutation({
  args: { projectId: v.id('projects'), title: v.string() },
  handler: async (ctx, args) => {
    // 1. Resolve the actor
    const actor = await getActor(ctx)

    // 2. Check capability
    authorize(actor, 'Create task', canCreateTask)

    // 3. Load resource + verify tenant (one-liner with loadResource)
    const project = loadResource(actor, await ctx.db.get(args.projectId), 'Project')

    // 4. Business-state guards
    if (project.status === 'archived') throw deny('Project is archived.')

    // 5. Do the thing
    return ctx.db.insert('tasks', { ... })
  },
})
```

### For queries

```ts
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    // 1. Resolve the actor
    const actor = await getActor(ctx);

    // 2. Check capability
    authorize(actor, "Read tasks", canReadTask);

    // 3. Load parent resource + verify tenant
    const project = loadResource(
      actor,
      await ctx.db.get(args.projectId),
      "Project",
    );

    // 4. Query the data
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    // 5. Attach per-item permissions for the frontend
    return tasks.map((task) =>
      withCan(task, {
        update: can(actor, canUpdateTask(task)),
      }),
    );
  },
});
```

### For queries with visibility filters

```ts
export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx);
    authorize(actor, "Read contacts", hasRole("owner", "admin", "manager", "rep"));

    // Visibility filter handles "which rows"
    const contacts = await applyVisibility(contactVisibility, actor, ctx.db);
    return contacts.map((c) => redactContact(actor, c));
  },
});
```

### For bulk operations

```ts
export const bulkUpdate = mutation({
  args: { ids: v.array(v.id("tasks")), status: taskStatusValidator },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    authorize(actor, "Bulk update", hasRole("owner", "admin", "member"));

    const results = { updated: 0, skipped: [] as string[] };

    for (const id of args.ids) {
      const task = await ctx.db.get(id);
      if (!task || task.workspaceId !== actor!.tenantId) {
        results.skipped.push(id);
        continue;
      }
      // Per-item soft check
      if (!can(actor, canUpdateTask(task))) {
        results.skipped.push(id);
        continue;
      }
      await ctx.db.patch(id, { status: args.status, updatedAt: Date.now() });
      results.updated++;
    }

    return results;
  },
});
```

---

## 10. Recipe: Project management

**Covers:** Linear, Asana, Jira, ClickUp.
**Files:** `actor.ts`, `checks.ts`, `scope.ts`, `resource.ts`
**Auth shape:** Role-based access + resource ownership + business-state guards.

### Endpoint examples

**Task creation with cross-table business guard:**

```ts
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    title: v.string(),
    priority: v.optional(taskPriorityValidator),
  },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    authorize(actor, "Create task", canCreateTask);

    const project = loadResource(
      actor,
      await ctx.db.get(args.projectId),
      "Project",
    );

    if (project.status === "archived") {
      throw deny("Cannot add tasks to archived projects.");
    }

    const now = Date.now();
    return ctx.db.insert("tasks", {
      projectId: args.projectId,
      title: args.title,
      status: "backlog",
      priority: args.priority ?? "medium",
      ownerId: actor!.userId,
      workspaceId: actor!.tenantId,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

**Task move with ownership check:**

```ts
export const moveToColumn = mutation({
  args: { id: v.id("tasks"), status: taskStatusValidator },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    const task = loadResource(actor, await ctx.db.get(args.id), "Task");
    authorize(actor, "Update task", canUpdateTask(task));

    await ctx.db.patch(args.id, { status: args.status, updatedAt: Date.now() });
  },
});
```

**Comment with parent-project guard:**

```ts
export const createComment = mutation({
  args: { taskId: v.id("tasks"), body: v.string() },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    authorize(actor, "Comment", canComment);

    const task = loadResource(actor, await ctx.db.get(args.taskId), "Task");

    const project = await ctx.db.get(task.projectId);
    requireRecord(project, "Project");
    if (project.status === "archived")
      throw deny("Cannot comment in archived projects.");

    return ctx.db.insert("comments", {
      taskId: args.taskId,
      body: args.body,
      ownerId: actor!.userId,
      workspaceId: actor!.tenantId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
```

**Task list with per-item permissions for the board UI:**

```ts
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    authorize(actor, "Read tasks", hasRole("owner", "admin", "member", "viewer"));

    loadResource(actor, await ctx.db.get(args.projectId), "Project");

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .collect();

    return tasks.map((task) =>
      withCan(task, {
        update: can(actor, canUpdateTask(task)),
        delete: can(actor, canUpdateTask(task)),
      }),
    );
  },
});
```

**Frontend board page:**

```vue
<script setup>
const { can } = usePermissions();
const canCreate = can("task.create");

const { data: tasks } = await useConvexQuery(
  api.tasks.listByProject,
  computed(() => ({ projectId: projectId.value })),
);
</script>

<template>
  <form v-if="canCreate" @submit.prevent="handleCreate">...</form>

  <TaskCard v-for="task in tasks" :key="task._id" :task="task" />
</template>
```

**Frontend task card:**

```vue
<template>
  <article class="task-card">
    <span>{{ task.title }}</span>
    <button v-if="task._can.update && task.status !== 'done'" @click="move">
      Move forward
    </button>
  </article>
</template>
```

---

## 11. Recipe: CRM

**Covers:** Sales pipeline, contact management, territory-based visibility.
**Adds:** `visibility.ts`, `redaction.ts`
**Auth shape:** Role-based access + row-level visibility + field sensitivity.

### visibility.ts

```ts
import { defineVisibility } from "better-convex-nuxt/auth";
import type { Actor } from "./actor";

export const contactVisibility = defineVisibility(async (actor: Actor, db) => {
  if (!actor) return [];

  if (["owner", "admin"].includes(actor.role)) {
    return db
      .query("contacts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", actor.tenantId));
  }

  if (actor.role === "manager") {
    const team = await db
      .query("users")
      .withIndex("by_manager", (q) => q.eq("managerId", actor.userId))
      .collect();
    const teamIds = [actor.userId, ...team.map((u) => u.authId)];

    const all = await db
      .query("contacts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", actor.tenantId))
      .collect();
    return all.filter((c) => teamIds.includes(c.ownerId));
  }

  return db
    .query("contacts")
    .withIndex("by_owner", (q) => q.eq("ownerId", actor.userId));
});
```

### redaction.ts

```ts
import type { Actor } from "./actor";
import { hasRole } from "./checks";

type RedactionRule = {
  fields: string[];
  visibleTo: (a: Actor) => boolean;
};

const contactRedactions: RedactionRule[] = [
  {
    fields: ["estimatedRevenue", "internalNotes"],
    visibleTo: hasRole("owner", "admin", "manager"),
  },
  {
    fields: ["phone", "personalEmail"],
    visibleTo: hasRole("owner", "admin", "manager", "rep"),
  },
];

export function redactContact<T extends Record<string, any>>(
  actor: Actor,
  contact: T,
): T {
  const result = { ...contact };
  for (const rule of contactRedactions) {
    if (!rule.visibleTo(actor)) {
      for (const field of rule.fields) delete result[field];
    }
  }
  return result;
}
```

### Endpoint

```ts
export const list = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getActor(ctx);
    authorize(actor, "Read contacts", hasRole("owner", "admin", "manager", "rep"));

    const contacts = await applyVisibility(contactVisibility, actor, ctx.db);
    return contacts.map((c) => redactContact(actor, c));
  },
});
```

---

## 12. Recipe: Course / LMS platform

**Covers:** Teachable, Thinkific, corporate training.
**Adds:** `enrollment.ts`, `prerequisites.ts`
**Auth shape:** Role-based access + enrollment relationship + prerequisite chains.

### enrollment.ts

```ts
import { deny } from "better-convex-nuxt/auth";
import type { DatabaseReader } from "../_generated/server";
import type { Id, Doc } from "../_generated/dataModel";
import type { Actor } from "./actor";
import { hasRole, can } from "./checks";

export async function getEnrollment(
  db: DatabaseReader,
  userId: string,
  courseId: Id<"courses">,
) {
  return db
    .query("enrollments")
    .withIndex("by_user_course", (q) =>
      q.eq("userId", userId).eq("courseId", courseId),
    )
    .first();
}

export async function requireEnrollment(
  db: DatabaseReader,
  actor: Actor,
  courseId: Id<"courses">,
): Promise<Doc<"enrollments">> {
  if (!actor) throw deny("Not authenticated.");

  // Staff bypass enrollment
  if (can(actor, hasRole("owner", "admin", "instructor"))) {
    return {
      userId: actor.userId,
      courseId,
      status: "active",
      createdAt: 0,
    } as any;
  }

  const enrollment = await getEnrollment(db, actor.userId, courseId);
  if (!enrollment || enrollment.status !== "active")
    throw deny("Not enrolled in this course.");
  return enrollment;
}
```

### prerequisites.ts

```ts
import { deny } from "better-convex-nuxt/auth";
import type { DatabaseReader } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function ensurePrerequisites(
  db: DatabaseReader,
  userId: string,
  lesson: Doc<"lessons">,
): Promise<void> {
  if (!lesson.prerequisiteIds?.length) return;

  for (const prereqId of lesson.prerequisiteIds) {
    const progress = await db
      .query("lessonProgress")
      .withIndex("by_user_lesson", (q) =>
        q.eq("userId", userId).eq("lessonId", prereqId),
      )
      .first();

    if (!progress?.completedAt) {
      const prereq = await db.get(prereqId);
      throw deny(`Complete "${prereq?.title ?? "previous lesson"}" first.`);
    }
  }
}
```

### Endpoint

```ts
export const getLesson = query({
  args: { id: v.id("lessons") },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    authorize(actor, "Read lesson", isAuthenticated);

    const lesson = loadResource(actor, await ctx.db.get(args.id), "Lesson");
    const course = await ctx.db.get(lesson.courseId);
    requireRecord(course, "Course");

    // Staff see everything
    if (can(actor, hasRole("owner", "admin", "instructor"))) return lesson;

    // Students go through the full chain
    if (course.status !== "published") throw deny("Course not available.");
    if (lesson.status === "draft") throw deny("Lesson not available.");

    const enrollment = await requireEnrollment(ctx.db, actor, course._id);
    await ensurePrerequisites(ctx.db, actor!.userId, lesson);

    if (lesson.availableAfter && lesson.availableAfter > Date.now()) {
      throw deny("This lesson is not available yet.");
    }

    return { ...lesson, enrolledAt: enrollment.createdAt };
  },
});
```

---

## 13. Recipe: E-commerce back office

**Covers:** Store admin, order management, Stripe integration.
**Adds:** `service-auth.ts`, `idempotency.ts`
**Auth shape:** Human + machine actors + business-state rules + idempotency.

### service-auth.ts

```ts
import { verifyKey, deny } from "better-convex-nuxt/auth";
import type { Actor } from "./actor";

export function getServiceActor(
  key: string,
  identity: { userId: string; role: string; tenantId: string },
): Actor {
  const expected = process.env.CONVEX_SERVICE_KEY ?? "";
  if (!verifyKey(key, expected)) throw deny("Invalid service key.");
  return { kind: "service", serviceId: "webhook", ...identity };
}
```

### idempotency.ts

```ts
import { deny } from "better-convex-nuxt/auth";

export async function ensureNotProcessed(db, eventId: string): Promise<void> {
  const existing = await db
    .query("processedEvents")
    .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
    .first();
  if (existing) throw deny("Event already processed.");
}

export async function markProcessed(
  db,
  eventId: string,
  source: string,
): Promise<void> {
  await db.insert("processedEvents", {
    eventId,
    source,
    processedAt: Date.now(),
  });
}
```

### Endpoint: refund with multiple business-state guards

```ts
export const processRefund = mutation({
  args: { orderId: v.id("orders"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx);
    authorize(
      actor,
      "Process refund",
      or(hasRole("owner", "admin"), (a) => a?.kind === "service"),
    );

    const order = loadResource(actor, await ctx.db.get(args.orderId), "Order");

    if (order.status === "refunded") throw deny("Already refunded.");
    if (order.status === "pending")
      throw deny("Cannot refund unfulfilled orders.");

    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (order.fulfilledAt && order.fulfilledAt < Date.now() - thirtyDays) {
      throw deny("Refund window has closed (30 days).");
    }

    const hold = await ctx.db
      .query("fraudHolds")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .first();
    if (hold && !hold.resolvedAt) throw deny("Order is under fraud review.");

    await ctx.db.patch(args.orderId, {
      status: "refunded",
      refundedAt: Date.now(),
      refundReason: args.reason,
    });
  },
});
```

---

## 14. Recipe: Freemium B2B

**Covers:** Productivity tools with Free / Pro / Enterprise plans.
**Adds:** `plans.ts`, `limits.ts`
**Auth shape:** Role + plan feature gating + dynamic usage counting.

### plans.ts

```ts
import type { Actor } from "./actor";

const planFeatures: Record<string, string[]> = {
  free: ["projects", "tasks", "comments"],
  pro: ["projects", "tasks", "comments", "exports", "api", "custom_fields"],
  enterprise: ["*"],
};

export const hasPlan =
  (...plans: string[]) =>
  (a: Actor) =>
    !!a && plans.includes(a.plan ?? "free");

export const hasFeature = (feature: string) => (a: Actor) => {
  if (!a) return false;
  const features = planFeatures[a.plan ?? "free"] ?? [];
  return features.includes(feature) || features.includes("*");
};
```

### limits.ts

```ts
import { deny } from "better-convex-nuxt/auth";
import type { Actor } from "./actor";

const usageLimits: Record<
  string,
  {
    index: string;
    countFilter?: (doc: any) => boolean;
    limits: Record<string, number>;
  }
> = {
  projects: {
    index: "by_workspace",
    countFilter: (p) => p.status === "active",
    limits: { free: 3, pro: 50, enterprise: Infinity },
  },
  members: {
    index: "by_workspace",
    limits: { free: 5, pro: 25, enterprise: Infinity },
  },
};

export async function ensureWithinLimit(
  db,
  actor: Actor,
  resource: string,
): Promise<void> {
  if (!actor) throw deny("Not authenticated.");

  const config = usageLimits[resource];
  if (!config) return;

  const plan = actor.plan ?? "free";
  const max = config.limits[plan] ?? Infinity;
  if (max === Infinity) return;

  const rows = await db
    .query(resource)
    .withIndex(config.index, (q) => q.eq("workspaceId", actor.tenantId))
    .collect();
  const count = config.countFilter
    ? rows.filter(config.countFilter).length
    : rows.length;

  if (count >= max)
    throw deny(
      `Plan limit reached: ${count}/${max} ${resource}. Upgrade to add more.`,
    );
}

export async function getUsage(db, actor: Actor, resource: string) {
  if (!actor) return null;
  const config = usageLimits[resource];
  if (!config) return null;
  const plan = actor.plan ?? "free";
  const max = config.limits[plan] ?? Infinity;
  const rows = await db
    .query(resource)
    .withIndex(config.index, (q) => q.eq("workspaceId", actor.tenantId))
    .collect();
  const current = config.countFilter
    ? rows.filter(config.countFilter).length
    : rows.length;
  return { current, max, remaining: Math.max(0, max - current) };
}
```

### Endpoint

```ts
export const createProject = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const actor = await getActor(ctx)
    authorize(actor, 'Create project', canCreateProject)
    await ensureWithinLimit(ctx.db, actor, 'projects')

    return ctx.db.insert('projects', { ... })
  },
})
```

### Context query with usage for the frontend

```ts
// In getPermissionContext handler
return {
  ...base,
  usage: {
    projects: await getUsage(ctx.db, actor, "projects"),
    members: await getUsage(ctx.db, actor, "members"),
  },
};
```

```vue
<template>
  <button :disabled="!canCreate" @click="create">
    New project
    <span v-if="usage?.projects"
      >{{ usage.projects.current }}/{{ usage.projects.max }}</span
    >
  </button>
</template>

<script setup>
const { can, ctx } = usePermissions();
const usage = computed(() => ctx.value?.usage);
const canCreate = computed(
  () =>
    can("project.create").value && (usage.value?.projects?.remaining ?? 0) > 0,
);
</script>
```

---

## 15. Recipe: Collaboration / document sharing

**Covers:** Notion-style apps, shared docs, knowledge bases.
**Adds:** `page-access.ts`, `share-tokens.ts`
**Auth shape:** Workspace roles + per-document access levels + inheritance + public links.

### page-access.ts

```ts
import { deny } from "better-convex-nuxt/auth";
import type { DatabaseReader } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Actor } from "./actor";

export type AccessLevel = "view" | "comment" | "edit";
const hierarchy: Record<AccessLevel, number> = { view: 0, comment: 1, edit: 2 };

export async function getAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  pageId: Id<"pages">,
): Promise<AccessLevel | null> {
  if (!actor || actor.kind !== "user") return null;
  if (["owner", "admin"].includes(actor.role)) return "edit";

  const share = await db
    .query("pageShares")
    .withIndex("by_user_page", (q) =>
      q.eq("userId", actor.userId).eq("pageId", pageId),
    )
    .first();
  if (share) return share.level as AccessLevel;

  if (["member", "viewer"].includes(actor.role)) {
    const page = await db.get(pageId);
    if (page?.visibility === "workspace") return "view";
  }
  return null;
}

export async function getInheritedAccessLevel(
  db: DatabaseReader,
  actor: Actor,
  pageId: Id<"pages">,
  maxDepth = 10,
): Promise<AccessLevel | null> {
  const direct = await getAccessLevel(db, actor, pageId);
  if (direct) return direct;

  let currentId = pageId;
  for (let depth = 0; depth < maxDepth; depth++) {
    const page = await db.get(currentId);
    if (!page?.parentPageId) break;
    const parentAccess = await getAccessLevel(db, actor, page.parentPageId);
    if (parentAccess) return parentAccess;
    currentId = page.parentPageId;
  }
  return null;
}

export async function requirePageAccess(
  db: DatabaseReader,
  actor: Actor,
  pageId: Id<"pages">,
  minLevel: AccessLevel,
): Promise<AccessLevel> {
  const level = await getInheritedAccessLevel(db, actor, pageId);
  if (!level) throw deny("No access to this page.");
  if (hierarchy[level] < hierarchy[minLevel])
    throw deny(`Requires ${minLevel} access. You have ${level}.`);
  return level;
}
```

### share-tokens.ts

```ts
import { deny } from "better-convex-nuxt/auth";
import type { DatabaseReader } from "../_generated/server";
import type { AccessLevel } from "./page-access";

export type ShareGrant = {
  kind: "share_token";
  tokenId: string;
  pageId: string;
  level: AccessLevel;
};

export async function resolveShareToken(
  db: DatabaseReader,
  token: string,
): Promise<ShareGrant> {
  const record = await db
    .query("shareTokens")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();
  if (!record) throw deny("Invalid share link.");
  if (record.expiresAt && record.expiresAt < Date.now())
    throw deny("Link expired.");
  if (record.revokedAt) throw deny("Link has been revoked.");
  return {
    kind: "share_token",
    tokenId: record._id,
    pageId: record.pageId,
    level: record.level as AccessLevel,
  };
}

export function requireTokenLevel(
  grant: ShareGrant,
  minLevel: AccessLevel,
): void {
  const h = { view: 0, comment: 1, edit: 2 };
  if (h[grant.level] < h[minLevel])
    throw deny(`This link only allows ${grant.level}.`);
}
```

### Endpoint: dual auth path (session or share link)

```ts
export const viewPage = query({
  args: { id: v.id("pages"), shareToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Path 1: public share link
    if (args.shareToken) {
      const grant = await resolveShareToken(ctx.db, args.shareToken);
      if (grant.pageId !== args.id)
        throw deny("Token does not match this page.");
      const page = await ctx.db.get(args.id);
      requireRecord(page, "Page");
      return { ...page, _access: grant.level, _via: "share_link" };
    }

    // Path 2: authenticated workspace member
    const actor = await getActor(ctx);
    authorize(actor, "View page", isAuthenticated);
    const page = loadResource(actor, await ctx.db.get(args.id), "Page");
    const access = await requirePageAccess(ctx.db, actor, page._id, "view");
    return { ...page, _access: access, _via: "workspace" };
  },
});
```

---

## 16. Recipe: Agency / multi-client portal

**Covers:** Marketing agencies, white-label portals.
**Adds:** `agency.ts`
**Auth shape:** Cross-tenant memberships. Controlled exceptions to tenant isolation.

### agency.ts

```ts
import { getAuth, deny } from "better-convex-nuxt/auth";
import type { Actor } from "./actor";

export async function getAgencyActor(ctx): Promise<Actor> {
  const identity = await getAuth(ctx);
  if (!identity) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_id", (q) => q.eq("authId", identity.subject))
    .first();
  if (!user) return null;
  return {
    kind: "user",
    userId: user.authId,
    role: "agency_user",
    tenantId: "",
  };
}

export async function getMemberships(db, userId: string) {
  return db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}

export async function requireAgencyRole(
  db,
  userId: string,
  ...roles: string[]
): Promise<void> {
  const memberships = await getMemberships(db, userId);
  if (!memberships.some((m) => roles.includes(m.role)))
    throw deny("Requires agency access.");
}

export async function requireWorkspaceMembership(
  db,
  userId: string,
  workspaceId: string,
) {
  const membership = await db
    .query("memberships")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspaceId),
    )
    .first();
  if (!membership) throw deny("No access to this workspace.");
  return { role: membership.role };
}
```

### Endpoint: cross-tenant dashboard

```ts
export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const actor = await getAgencyActor(ctx);
    if (!actor) throw deny("Not authenticated.");

    await requireAgencyRole(
      ctx.db,
      actor.userId,
      "agency_admin",
      "agency_manager",
    );

    const memberships = await getMemberships(ctx.db, actor.userId);
    const clientIds = memberships
      .filter((m) => ["agency_admin", "agency_manager"].includes(m.role))
      .map((m) => m.workspaceId);

    return Promise.all(
      clientIds.map(async (wsId) => {
        const workspace = await ctx.db.get(wsId);
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", wsId))
          .collect();
        return {
          workspace: { id: wsId, name: workspace?.name },
          activeProjects: projects.filter((p) => p.status === "active").length,
        };
      }),
    );
  },
});
```

---

## 17. Testing

### Unit testing checks (no database needed)

Checks are pure functions. Test them directly.

```ts
import { describe, expect, it } from "vitest";
import { can } from "better-convex-nuxt/auth";
import { hasRole, canUpdateTask } from "./auth/checks";

const admin = { kind: "user", userId: "admin", role: "admin", tenantId: "ws1" };
const alice = {
  kind: "user",
  userId: "alice",
  role: "member",
  tenantId: "ws1",
};
const viewer = {
  kind: "user",
  userId: "viewer",
  role: "viewer",
  tenantId: "ws1",
};

describe("checks", () => {
  it("hasRole matches", () => {
    expect(can(admin, hasRole("admin"))).toBe(true);
    expect(can(alice, hasRole("admin"))).toBe(false);
    expect(can(null, hasRole("admin"))).toBe(false);
  });

  it("canUpdateTask respects ownership", () => {
    const aliceTask = { ownerId: "alice" };
    const bobTask = { ownerId: "bob" };

    expect(can(alice, canUpdateTask(aliceTask))).toBe(true);
    expect(can(alice, canUpdateTask(bobTask))).toBe(false);
    expect(can(admin, canUpdateTask(bobTask))).toBe(true);
  });
});
```

### Integration testing with database

```ts
import { createTestContext } from "better-convex-nuxt/testing";

function setup() {
  return createTestContext({
    schema,
    modules,
    tenant: { table: "workspaces", field: "workspaceId" },
    users: {
      table: "users",
      authField: "authId",
      roleField: "role",
      tenantField: "workspaceId",
    },
  });
}

describe("task authorization", () => {
  it("member updates own task but not others", async () => {
    const ctx = setup();
    const team = await ctx.seedTenant({
      name: "Alpha",
      users: {
        owner: { role: "owner" },
        alice: { role: "member" },
        bob: { role: "member" },
      },
    });

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: "Board",
    });
    const taskId = await team.users.alice.mutation(api.tasks.create, {
      projectId,
      title: "Alice task",
      priority: "medium",
    });

    await team.users.alice.mutation(api.tasks.moveToColumn, {
      id: taskId,
      status: "in_progress",
    });

    await expect(
      team.users.bob.mutation(api.tasks.moveToColumn, {
        id: taskId,
        status: "done",
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("tenants are isolated", async () => {
    const ctx = setup();
    const alpha = await ctx.seedTenant({
      name: "Alpha",
      users: { owner: { role: "owner" } },
    });
    const beta = await ctx.seedTenant({
      name: "Beta",
      users: { owner: { role: "owner" } },
    });

    const ap = await alpha.users.owner.mutation(api.projects.create, {
      name: "A",
    });
    await alpha.users.owner.mutation(api.tasks.create, {
      projectId: ap,
      title: "Alpha task",
      priority: "medium",
    });

    const tasks = await alpha.users.owner.query(api.tasks.listByProject, {
      projectId: ap,
    });
    expect(tasks).toHaveLength(1);
  });

  it("role changes propagate", async () => {
    const ctx = setup();
    const team = await ctx.seedTenant({
      name: "Alpha",
      users: { owner: { role: "owner" }, member: { role: "member" } },
    });

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: "Board",
    });
    await team.users.member.mutation(api.tasks.create, {
      projectId,
      title: "Works",
      priority: "medium",
    });

    await team.users.owner.mutation(api.members.changeRole, {
      userId: team.users.member.id,
      newRole: "viewer",
    });

    await expect(
      team.users.member.mutation(api.tasks.create, {
        projectId,
        title: "Blocked",
        priority: "medium",
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("service actors obey the same rules", async () => {
    const ctx = setup();
    const team = await ctx.seedTenant({
      name: "Alpha",
      users: { owner: { role: "owner" }, viewer: { role: "viewer" } },
    });

    const projectId = await team.users.owner.mutation(api.projects.create, {
      name: "Board",
    });
    const service = ctx.asService({
      userId: team.users.viewer.authId,
      role: "viewer",
      tenantId: team.id,
    });

    await expect(
      service.mutation(api.tasks.create, {
        projectId,
        title: "Nope",
        priority: "medium",
      }),
    ).rejects.toThrow("Forbidden");
  });
});
```

---

## 18. Anti-patterns

### Forgetting the tenant check

```ts
// BAD: loads resource without tenant verification
const task = await ctx.db.get(args.id);
authorize(actor, "Update", canUpdateTask(task!));

// GOOD: use loadResource to combine existence + tenant in one call
const task = loadResource(actor, await ctx.db.get(args.id), "Task");
authorize(actor, "Update", canUpdateTask(task));
```

### Mixing checks and guards

```ts
// BAD: a "check" that does database reads and throws
const canCreate = async (actor) => {
  const count = await db.query("projects").collect();
  if (count.length >= 3) throw deny("Limit reached.");
  return true;
};

// GOOD: checks are pure booleans. Guards are async and throw.
authorize(actor, "Create project", canCreateProject); // check (pure)
await ensureWithinLimit(ctx.db, actor, "projects"); // guard (async, throws)
```

### Giant handlers that should use helpers

```ts
// BAD: inline tenant check in every handler
if (!actor) throw deny("Not authenticated.");
const task = await ctx.db.get(args.id);
if (!task) throw new Error("Task not found.");
if (actor.tenantId !== task.workspaceId) throw deny("Not found.");

// GOOD: one-liner with loadResource
const task = loadResource(actor, await ctx.db.get(args.id), "Task");
```

### Overloading the actor

```ts
// BAD: stuffing half the database into the actor
const actor = {
  ...user,
  memberships: await loadAll(),
  enrollments: await loadAll(),
  permissions: await computeAll(),
};

// GOOD: actor is identity + role + tenant. Load the rest on demand.
const actor = {
  kind: "user",
  userId: user.authId,
  role: user.role,
  tenantId: user.workspaceId,
};
const enrollment = await requireEnrollment(ctx.db, actor, courseId); // loaded when needed
```

### Skipping backend enforcement because the frontend hides the button

```ts
// BAD: only checking permissions on the frontend
<button v-if="can('task.create')" @click="create">Create</button>
// ... but the mutation handler doesn't call authorize()

// GOOD: frontend hides the button AND backend enforces
// Frontend: v-if="can('task.create')"
// Backend: authorize(actor, 'Create task', canCreateTask)
```

---

## 19. Migration from v2/v3

### What changes

| Concept             | v2/v3                                             | v4                                                |
| ------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Permission rules    | `definePermissions({ roles, rules })` config      | Check functions in `checks.ts`                    |
| Actor resolution    | `defineActorConfig({ resolveFromAuth })`          | `getActor()` function in `actor.ts`               |
| Builder setup       | `createFunctions({ schema, actor, permissions })` | Gone. Use raw `query()`/`mutation()`              |
| Endpoint definition | `scopedMutation({ require, resource, guard })`    | `mutation({ args, handler })` with explicit calls |
| Business guards     | `guard` slot                                      | `if (...) throw deny(...)` inline                 |
| Resource loading    | `resource` slot                                   | `loadResource(actor, doc, label)`                 |
| Frontend check      | `can('task.update', task)` via config             | `task._can.update` from query result              |
| Bulk ownership      | Manual re-implementation                          | `can(actor, canUpdateTask(task))` — same function |
| Tenant scoping      | Automatic via builder                             | Explicit `ensureTenant` / `loadResource`          |

### Migration path

Your existing `scopedQuery`/`scopedMutation` endpoints keep working.
Migrate gradually:

1. Run `npx better-convex-nuxt add auth` to get the base files.
2. Write new endpoints using the v4 pattern.
3. Migrate old endpoints one at a time when you touch them.
4. Remove builder imports when fully migrated.

### Files to delete after migration

- `convex/actor.config.ts` → replaced by `convex/auth/actor.ts`
- `convex/permissions.config.ts` → replaced by `convex/auth/checks.ts`
- `convex/functions.ts` → no longer needed (no builders)

---

## 20. LLM prompt contract

This contract gives LLMs a strong default pattern for generating authorization
code. App-specific business rules and performance-sensitive visibility logic
still require human review.

```
AUTHORIZATION MODEL

Authorization uses composable primitives. Auth logic lives in convex/auth/ as
plain functions.

ACTOR
  Call getActor(ctx) at the start of every handler.
  Returns { kind, userId, role, tenantId } or null.

THREE SHAPES

  Checks (pure, boolean, composable):
    hasRole(...roles), isOwnerOf(resource), isAuthenticated
    Compose: and(), or(), not(), all(), any()

  Guards (async, throw on failure):
    ensureTenant(actor, resource)
    requireRecord(doc, label)
    loadResource(actor, doc, label)  — combines existence + tenant
    requireEnrollment(db, actor, courseId)
    ensureWithinLimit(db, actor, resource)

  Filters (query narrowing for lists):
    defineVisibility(fn), applyVisibility(filter, actor, db)

RUNNERS
  authorize(actor, label, check) — throws 'Forbidden: {label}' on false
  can(actor, check) — returns boolean (for soft/bulk checks)
  deny(reason) — throws ConvexError with FORBIDDEN code

STANDARD HANDLER PATTERN
  1. const actor = await getActor(ctx)
  2. authorize(actor, 'Action', check)
  3. const doc = loadResource(actor, await ctx.db.get(args.id), 'Label')
  4. Business guards: if (doc.status === 'archived') throw deny('...')
  5. Do the thing

FRONTEND
  Global: const { can } = usePermissions(); can('task.create')
  Per-item: task._can.update (attached via withCan in query handler)

BULK OPERATIONS
  for (const id of ids) {
    const doc = await ctx.db.get(id)
    if (!can(actor, canUpdate(doc))) { skipped.push(id); continue }
    await ctx.db.patch(id, { ... })
  }
```

---

## 21. SaaS coverage map

| SaaS type          | Auth shape                              | Recommended recipe files              |
| ------------------ | --------------------------------------- | ------------------------------------- |
| Project management | Role + ownership + state guards         | `actor.ts`, `checks.ts`, `scope.ts`   |
| CRM                | Role + row visibility + field redaction | + `visibility.ts`, `redaction.ts`     |
| Course / LMS       | Role + enrollment + prerequisites       | + `enrollment.ts`, `prerequisites.ts` |
| E-commerce         | Human + service actors + state guards   | + `service-auth.ts`, `idempotency.ts` |
| Freemium B2B       | Role + plan features + usage limits     | + `plans.ts`, `limits.ts`             |
| Collaboration      | Workspace + page access + share tokens  | + `page-access.ts`, `share-tokens.ts` |
| Agency             | Cross-tenant memberships                | + `agency.ts`                         |

Every SaaS type uses the same kernel. Different types compose different recipe files.
The module doesn't change. Your auth folder does.

---

## Complete naming reference

### Module exports (you import these)

| Name                | Shape             | Purpose                               |
| ------------------- | ----------------- | ------------------------------------- |
| `and`               | Check composition | All checks must pass                  |
| `or`                | Check composition | Any check may pass                    |
| `not`               | Check composition | Inverts a check                       |
| `all`               | Check composition | Alias for `and`                       |
| `any`               | Check composition | Alias for `or`                        |
| `authorize`         | Runner            | Hard check — throws on failure        |
| `can`               | Runner            | Soft check — returns boolean          |
| `deny`              | Error             | Throws ConvexError with FORBIDDEN     |
| `getAuth`       | Session           | Raw Convex auth identity              |
| `verifyKey`         | Utility           | Constant-time key comparison          |
| `defineVisibility`  | Filter factory    | Creates a visibility filter           |
| `applyVisibility`   | Filter runner     | Resolves a visibility filter          |
| `createAuth`        | Frontend factory  | Creates usePermissions + useAuthGuard |
| `createTestContext` | Testing           | Creates test harness                  |

### User-code names (from recipes)

| Name                  | Shape          | Convention                            |
| --------------------- | -------------- | ------------------------------------- |
| `getActor`            | Actor resolver | `get*` for resolution                 |
| `getServiceActor`     | Actor resolver | `get*` for resolution                 |
| `Actor`               | Type           | Matches resolver name                 |
| `hasRole`             | Check          | `has*` for capability predicates      |
| `isOwnerOf`           | Check          | `is*` for identity predicates         |
| `isAuthenticated`     | Check          | `is*` for identity predicates         |
| `hasPlan`             | Check          | `has*` for capability predicates      |
| `hasFeature`          | Check          | `has*` for capability predicates      |
| `canUpdateTask`       | Check          | `can*` for composed permission checks |
| `ensureTenant`        | Guard          | `ensure*` for boundary guards         |
| `requireRecord`         | Guard          | `ensure*` for boundary guards         |
| `loadResource`        | Guard          | Convenience (ensure + ensure in one)  |
| `ensureWithinLimit`   | Guard          | `ensure*` for boundary guards         |
| `ensurePrerequisites` | Guard          | `ensure*` for boundary guards         |
| `requireEnrollment`   | Guard          | `require*` for relationship guards    |
| `requirePageAccess`   | Guard          | `require*` for relationship guards    |
| `withCan`             | Helper         | Attaches `_can` to documents          |
| `_can`                | Convention     | Permission booleans on query results  |
| `usePermissions`      | Composable     | Frontend permission state             |
| `useAuthGuard`        | Composable     | Frontend route protection             |
