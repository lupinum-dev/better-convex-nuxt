# better-convex-nuxt

Build real apps with Convex and Nuxt. Auth, teams, permissions — all handled.

---

## The Idea

You picked Convex because queries are live and mutations are atomic. You picked Nuxt because SSR works and the file system makes sense. You picked Vue because reactivity just clicks.

This module connects them. Not with glue code — with an opinion. You write your business logic. The framework handles auth, tenant isolation, permission checks, and the bridge between Convex's servers and Nuxt's.

If you've ever shipped a multi-tenant app and spent more time on authorization plumbing than on the actual product... this is for you.

---

## Show Me

### The simplest app

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: { url: process.env.CONVEX_URL },
})
```

```vue
<!-- pages/index.vue -->
<script setup>
const { data: notes } = await useConvexQuery(api.notes.list, {})
const addNote = useConvexMutation(api.notes.add)
</script>

<template>
  <div v-for="note in notes" :key="note._id">{{ note.title }}</div>
  <button @click="addNote({ title: 'Hello' })">Add</button>
</template>
```

That's SSR, live subscriptions, and type-safe mutations. No providers, no context setup, no client initialization.

### With auth

```ts
// convex/functions.ts
import { createFunctions } from 'better-convex-nuxt/convex'
import actorConfig from './actor.config'

export const { authedQuery, authedMutation } = createFunctions({
  actor: actorConfig,
})
```

```ts
// convex/todos.ts
export const list = authedQuery({
  args: {},
  handler: async ({ db, actor }) => {
    return await db
      .query('todos')
      .withIndex('by_user', (q) => q.eq('userId', actor.userId))
      .collect()
  },
})
```

`actor` is guaranteed. If the user isn't signed in, the function never runs. No `if (!identity) throw` boilerplate.

### With teams and permissions

```ts
// convex/todos.ts
export const create = scopedMutation({
  args: createTodo.args,
  require: 'todo.create',
  handler: async ({ db, actor }, args) => {
    return await db.insert('todos', {
      title: args.title,
      ownerId: actor.userId,
      createdAt: Date.now(),
    })
  },
})
```

`db` only sees the current team's data. `require` checks the permission before the handler runs. `db.insert` sets the team field automatically. You write four lines of business logic. The framework handles the rest.

---

## How It Works

### You write functions in three flavors

| Builder                          | Auth     | Team scoping | When to use                  |
| -------------------------------- | -------- | ------------ | ---------------------------- |
| `publicQuery` / `publicMutation` | None     | None         | Landing pages, public APIs   |
| `authedQuery` / `authedMutation` | Required | None         | User settings, personal data |
| `scopedQuery` / `scopedMutation` | Required | Automatic    | Team resources, shared data  |

There's also `openQuery` / `openMutation` for the "works for everyone, better if signed in" pattern.

All eight come from one call:

```ts
// convex/functions.ts — the one file you create
import { createFunctions } from 'better-convex-nuxt/convex'

export const {
  publicQuery,
  publicMutation,
  openQuery,
  openMutation,
  authedQuery,
  authedMutation,
  scopedQuery,
  scopedMutation,
} = createFunctions({
  schema,
  actor: actorConfig,
  permissions: permissionConfig,
})
```

Why a factory and not auto-imports? Because this code runs on Convex's servers, not Nuxt's. The `convex/` directory is a separate runtime with its own build. The factory is the bridge between the two worlds.

Destructure only what you use. A public-only app takes `publicQuery` and ignores the rest.

### Each builder gives you a different context

```ts
// Public — just the database
handler: async ({ db }) => { ... }

// Authed — database plus the verified user
handler: async ({ db, actor }) => { ... }

// Scoped — team-filtered database plus the verified user with team membership
handler: async ({ db, actor }) => { ... }
```

The scoped `db` is the key innovation. It's a wrapper around Convex's database that automatically filters by team. `db.query('todos')` returns only the current team's todos. `db.get(id)` throws if the document belongs to a different team. `db.insert('todos', data)` sets the team field for you.

You cannot accidentally read or write across team boundaries through the scoped `db`. It's not discipline — it's structure.

If you genuinely need raw access (admin tools, migrations), there's an escape hatch:

```ts
handler: async ({ db, actor, raw }) => {
  // raw.ctx.db is the unscoped Convex database
  // The name 'raw' is intentionally blunt — it should stand out in code review
}
```

---

## Permissions

### Declare them once

```ts
// convex/permissions.config.ts
import { definePermissions } from 'better-convex-nuxt/convex'

export const permissionConfig = definePermissions({
  roles: ['owner', 'admin', 'member', 'viewer'],
  rules: {
    todo: {
      create: { roles: ['owner', 'admin', 'member'] },
      read: { roles: ['owner', 'admin', 'member', 'viewer'] },
      update: { own: ['member'], any: ['owner', 'admin'] },
      delete: { own: ['member'], any: ['owner', 'admin'] },
    },
  },
})
```

That's it. No `checkPermission` function to write. The framework generates it from the rules. The `own` / `any` pattern means members can update their own todos, admins can update anyone's.

### Use them on the backend

```ts
export const update = scopedMutation({
  args: { id: v.id('todos'), title: v.string() },
  require: 'todo.update',
  resource: (args) => args.id,
  handler: async ({ db }, args) => {
    await db.patch(args.id, { title: args.title })
  },
})
```

`require: 'todo.update'` — checked before the handler runs. If the actor's role doesn't have access, the handler never executes.

`resource: args => args.id` — the framework loads the todo, verifies it belongs to the current team, and if the permission has ownership rules, checks that the actor owns it. All before the handler.

The handler just does the business logic. Four lines.

### Use them on the frontend

```vue
<script setup>
const { can, role, tenantId } = usePermissions()
</script>

<template>
  <button v-if="can('todo.create')">New Todo</button>

  <div v-for="todo in todos" :key="todo._id">
    {{ todo.title }}
    <button v-if="can('todo.update', todo)" @click="edit(todo)">Edit</button>
    <button v-if="can('todo.delete', todo)" @click="remove(todo)">Delete</button>
  </div>
</template>
```

`can()` returns a reactive ref. It uses the same rules the backend uses. When the user's role changes, the UI updates automatically. No page refresh.

### When it fails, it tells you why

In development, permission denials look like this:

```
Forbidden: todo.update

  Actor:    { userId: 'alice', role: 'member', tenantId: 'team_abc' }
  Resource: { _id: 'todo_xyz', ownerId: 'bob' }
  Rule:     { own: ['member'], any: ['owner', 'admin'] }
  Reason:   Role 'member' has own-only access. resource.ownerId ('bob') ≠ actor.userId ('alice').
  Hint:     Members can only update their own todos.
```

In production, it's just `"Forbidden: todo.update"`. The diagnostics are dev-only.

---

## Teams (Multi-Tenancy)

### Configure once

```ts
// nuxt.config.ts
convex: {
  tenant: {
    field: 'teamId',          // whatever your documents call it
    index: 'by_team',         // the index on scoped tables
  },
}
```

The framework reads your Convex schema and finds every table that has a `teamId` field with a `by_team` index. Those tables are scoped. Everything else isn't. No arrays to maintain.

If your field is `organizationId` and your index is `by_organization`, that's the default — you don't even need the config.

### The actor carries the team

```ts
// convex/actor.config.ts
export default defineActorConfig({
  resolveFromAuth: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const user = await ctx.db
      .query('users')
      .withIndex('by_auth_id', (q) => q.eq('authId', identity.subject))
      .first()

    if (!user) return null

    return {
      userId: user.authId,
      role: user.role,
      tenantId: user.teamId,
    }
  },
})
```

`tenantId` is the framework's name for "which team is this user in." Your database calls it whatever you want — `teamId`, `workspaceId`, `storeId`, `schoolId`. The actor bridges the two.

### Scoped handlers never think about teams

```ts
export const list = scopedQuery({
  args: {},
  handler: async ({ db }) => {
    // This only returns the current team's todos.
    // There is no way to query another team's data through this db.
    return await db.query('todos').order('desc').collect()
  },
})

export const create = scopedMutation({
  args: { title: v.string() },
  handler: async ({ db, actor }, args) => {
    // db.insert automatically sets teamId.
    // You never write teamId in your handler.
    return await db.insert('todos', {
      title: args.title,
      ownerId: actor.userId,
      createdAt: Date.now(),
    })
  },
})
```

That's it. No `if (doc.teamId !== actor.tenantId)` checks. No `...args, teamId: actor.tenantId` in inserts. The scoped database handles both.

---

## Schemas

### Define once, use everywhere

```ts
// shared/schemas/todo.ts
import { v } from 'convex/values'
import { defineArgs } from 'better-convex-nuxt/schema'

export const createTodo = defineArgs({
  description: 'Create a team todo',
  args: {
    title: v.string(),
  },
  meta: {
    title: {
      label: 'Title',
      description: 'What needs to be done',
      examples: ['Review the PR', 'Update the docs'],
    },
  },
})
```

One definition gives you:

- `createTodo.args` — Convex function args
- `createTodo.meta` — labels and descriptions for tools and forms
- `createTodo.zod` — Zod schema for runtime validation
- `createTodo.parse(input)` — validate unknown data and get typed output

Use it in Convex functions:

```ts
export const create = scopedMutation({
  args: createTodo.args,
  handler: async ({ db, actor }, args) => { ... },
})
```

Use it in MCP tools:

```ts
export default defineTool({
  schema: createTodo,
  name: 'create-todo',
  handler: async (args, ctx) => { ... },
})
```

Use it for input validation:

```ts
const parsed = createTodo.parse(req.body) // throws if invalid
```

The `meta` is optional. If you skip it, labels are auto-generated from field names and descriptions from validator types.

---

## MCP Tools

### One import, one pattern

```ts
// server/mcp/tools/create-todo.ts
import { defineTool } from '#convex/mcp'
import { api } from '~/convex/_generated/api'
import { createTodo } from '~/shared/schemas/todo'

export default defineTool({
  schema: createTodo,
  name: 'create-todo',
  auth: 'required',
  require: 'todo.create',
  scoped: true,
  handler: async (args, ctx) => {
    const id = await ctx.mutation(api.todos.create, args)
    return ctx.ok({ id }, `Created todo "${args.title}"`)
  },
})
```

`#convex/mcp` is generated by the module with your permission config baked in. Every tool follows the same pattern. `ctx.mutation` injects service auth automatically when `scoped: true`. The tool author never thinks about service keys.

### Destructive tools preview before executing

```ts
export default defineTool({
  schema: deleteTodo,
  name: 'delete-todo',
  auth: 'required',
  require: 'todo.delete',
  scoped: true,
  destructive: true,

  preview: async (args, ctx) => {
    const todo = await ctx.query(api.todos.get, { id: args.id })
    if (!todo) return ctx.blocked('Todo not found')
    return ctx.preview(`Will permanently delete "${todo.title}"`)
  },

  handler: async (args, ctx) => {
    await ctx.mutation(api.todos.remove, args)
    return ctx.ok({ deleted: true })
  },
})
```

First MCP call returns the preview. Second call (with `_confirmed: true`) executes the handler. The tool author writes both functions; the framework handles the flow.

---

## On the Frontend

### Queries are live

```ts
const { data, pending, error } = await useConvexQuery(api.todos.list, {})
```

SSR on first load. WebSocket subscription on the client. When data changes on the server, `data` updates. No polling, no refetching, no cache invalidation.

### Mutations have built-in state

```ts
const addTodo = useConvexMutation(api.todos.create)

await addTodo({ title: 'Ship it' })

addTodo.pending.value // was it in flight?
addTodo.error.value // did it fail?
addTodo.status.value // 'idle' | 'pending' | 'success' | 'error'
addTodo.reset() // back to idle
```

### Queries skip when they should

```ts
// Only fetch when the user is signed in
const { data } = await useConvexQuery(
  api.todos.list,
  computed(() => (isAuthenticated.value ? {} : undefined)),
)
```

Pass `undefined` as args and the query doesn't run. Pass real args and it does. Reactive.

### Auth just works

```vue
<ConvexAuthLoading>
  <p>Checking session...</p>
</ConvexAuthLoading>

<ConvexAuthenticated>
  <p>Welcome, {{ user.name }}</p>
</ConvexAuthenticated>

<ConvexUnauthenticated>
  <p>Please sign in.</p>
</ConvexUnauthenticated>
```

Route protection:

```ts
definePageMeta({ convexAuth: true })
```

---

## Testing

### Zero-config runner

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { convexTestConfig } from 'better-convex-nuxt/testing'

export default defineConfig(convexTestConfig())
```

### One-line setup

```ts
import { createTestContext } from 'better-convex-nuxt/testing'

const ctx = createTestContext({ schema })
```

### The only test helper you need

```ts
const team = await ctx.seedTenant({
  name: 'Acme',
  users: {
    alice: { role: 'owner' },
    bob: { role: 'member' },
    carol: { role: 'viewer' },
  },
})
```

One call. Team created. Three users created, each with a role. Each user has `.query()` and `.mutation()` methods that are already authenticated.

### Write the test

```ts
it('members can only update their own todos', async () => {
  const team = await ctx.seedTenant({
    name: 'Acme',
    users: {
      alice: { role: 'member' },
      bob: { role: 'member' },
    },
  })

  const todoId = await team.users.alice.mutation(api.todos.create, {
    title: 'Alice todo',
  })

  await expect(
    team.users.bob.mutation(api.todos.update, { id: todoId, title: 'Hacked' }),
  ).rejects.toThrow('Forbidden: todo.update')

  await team.users.alice.mutation(api.todos.update, {
    id: todoId,
    title: 'Updated',
  })
})
```

One line of setup. The rest is the test. The assertion reads like a sentence.

### Test tenant isolation

```ts
it('teams cannot see each other', async () => {
  const acme = await ctx.seedTenant({
    name: 'Acme',
    users: { alice: { role: 'member' } },
  })
  const globex = await ctx.seedTenant({
    name: 'Globex',
    users: { bob: { role: 'member' } },
  })

  await acme.users.alice.mutation(api.todos.create, { title: 'Acme secret' })
  await globex.users.bob.mutation(api.todos.create, { title: 'Globex secret' })

  const aliceTodos = await acme.users.alice.query(api.todos.list, {})
  const bobTodos = await globex.users.bob.query(api.todos.list, {})

  expect(aliceTodos).toHaveLength(1)
  expect(aliceTodos[0].title).toBe('Acme secret')
  expect(bobTodos).toHaveLength(1)
  expect(bobTodos[0].title).toBe('Globex secret')
})
```

### Test service auth

```ts
it('MCP tools use the same permission rules', async () => {
  const team = await ctx.seedTenant({
    name: 'Acme',
    users: { viewer: { role: 'viewer' } },
  })

  const service = ctx.asService({
    userId: team.users.viewer.authId,
    role: 'viewer',
    tenantId: team.id,
  })

  await expect(service.mutation(api.todos.create, { title: 'Nope' })).rejects.toThrow(
    'Forbidden: todo.create',
  )
})
```

### Errors explain themselves

When a test fails because of a permission denial, the error message tells you exactly what happened and what to do about it. Not just "Forbidden" — the full context: actor, rule, resource, mismatch, hint.

---

## Growing Your App

### Start here (5 minutes)

```
nuxt.config.ts          ← convex: { url }
convex/functions.ts     ← createFunctions()
convex/todos.ts         ← publicQuery, publicMutation
pages/index.vue         ← useConvexQuery, useConvexMutation
```

No auth. No teams. No permissions. Just Convex queries in Nuxt.

### Add auth (15 minutes)

```
+ convex/actor.config.ts   ← how to resolve the signed-in user
  convex/functions.ts      ← add: actor: actorConfig
+ convex/auth.ts           ← Better Auth wiring
+ convex/http.ts           ← auth route registration
  convex/todos.ts          ← change: authedQuery, authedMutation
  nuxt.config.ts           ← add: auth: true
```

Now mutations belong to users. The actor is guaranteed in every handler.

### Add teams and permissions (15 more minutes)

```
+ convex/permissions.config.ts  ← roles and rules
  convex/functions.ts           ← add: schema, permissions
  convex/actor.config.ts        ← add: tenantId to actor
  convex/todos.ts               ← change: scopedQuery, scopedMutation
  nuxt.config.ts                ← add: tenant config
```

Now data is isolated by team. Permissions are checked declaratively.

### Add MCP tools (10 more minutes)

```
+ server/mcp/index.ts               ← defineMcpHandler({})
+ server/mcp/tools/create-todo.ts   ← defineTool({ ... })
+ server/middleware/mcp-auth.ts      ← auth for MCP requests
```

Same Convex functions. Same permissions. New interface.

Each step adds a few files and changes a few lines. Nothing gets rewritten.

---

## What This Module Is Not

**Not a database.** Convex is the database. This module connects it to Nuxt.

**Not an auth provider.** Better Auth (or your auth of choice) handles authentication. This module resolves the authenticated identity into an application actor.

**Not a compliance framework.** The tenant model provides logical data isolation — queries are filtered by team. For regulatory data isolation (HIPAA, SOX, FedRAMP), you need separate database deployments per tenant. This module doesn't do that.

**Not magic.** The `convex/` directory runs on Convex's servers, not Nuxt's. That's why `createFunctions()` is a factory call, not an auto-import. The module bridges two runtimes — it can't erase the boundary.

---

## Defaults

| Setting                 | Default                                  | Override                            |
| ----------------------- | ---------------------------------------- | ----------------------------------- |
| SSR for queries         | On                                       | `server: false`                     |
| Live subscriptions      | On                                       | `subscribe: false`                  |
| Tenant field            | `'organizationId'`                       | `tenant.field` in config            |
| Tenant index            | `'by_organization'`                      | `tenant.index` in config            |
| Owner field             | `'ownerId'`                              | Per-table in `createFunctions`      |
| Actor config            | Required if using `authed*` or `scoped*` | —                                   |
| Permission config       | Required if using `require`              | —                                   |
| Scoped table detection  | Inferred from schema (field + index)     | `tenant.exclude` / `tenant.include` |
| Auth-required MCP tools | Hidden from anonymous `tools/list`       | `enabled` option                    |
| Error detail level      | Full in dev, terse in production         | —                                   |

---

## API Reference

### Nuxt Config

```ts
convex: {
  url: string                           // Convex deployment URL
  siteUrl?: string                      // Your app URL (for auth token exchange)
  auth?: boolean                        // Enable auth integration (default: false)
  logging?: 'debug' | 'info' | 'warn' | 'error' | false
  permissions?: {
    config: string                      // Path to permissions.config.ts
  }
  tenant?: {
    field?: string                      // Document field (default: 'organizationId')
    index?: string                      // Index name (default: 'by_organization')
  }
}
```

### Convex Builders

```ts
createFunctions(config?) → {
  publicQuery, publicMutation,
  openQuery, openMutation,
  authedQuery, authedMutation,
  scopedQuery, scopedMutation,
}

defineActorConfig({ resolveFromAuth, serviceKey? })
definePermissions({ roles, rules, checkPermission? })
```

### Builder Options

```ts
// All builders
{ args, handler }

// authedQuery / authedMutation — adds:
{ resource?, ownerField? }

// scopedQuery / scopedMutation — adds:
{ require?, resource? }
```

### Vue Composables

```ts
useConvexQuery(functionRef, args, options?)    → { data, pending, error, status, refresh }
useConvexPaginatedQuery(functionRef, args, options?) → { results, status, loadMore, refresh, reset }
useConvexMutation(functionRef, options?)       → callable & { pending, error, status, data, reset }
useConvexAuth()                                → { isAuthenticated, isPending, user, client, signOut }
useConvexConnectionState()                     → { state, isConnected, isReconnecting, ... }
usePermissions()                               → { can, role, tenantId, user, pending }
```

### MCP Tools

```ts
defineTool({
  schema,
  name: string,
  auth?: 'required' | 'optional',
  require?: string,
  scoped?: boolean,
  destructive?: boolean,
  preview?: (args, ctx) => Promise<result>,
  handler: (args, ctx) => Promise<result>,
})
```

### Testing

```ts
convexTestConfig(options?)                     → Vitest config
createTestContext({ schema, actor?, permissions?, tenant? }) → ctx
ctx.seedTenant({ name, users })                → { id, users }
ctx.asService({ userId, role, tenantId? })     → service client
ctx.seed(table, data)                          → document ID
ctx.readAll(table)                             → documents
```

---

_Made for developers who'd rather ship than configure._
