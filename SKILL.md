---
name: better-convex-nuxt
description: >
  Use this skill when working with Convex in a Nuxt application. This includes Convex queries,
  mutations, actions, optimistic updates, authentication with Better Auth, file uploads, paginated
  queries, server-side Convex calls, permissions, real-time subscriptions, or connection state.
  Activate whenever a Nuxt project uses the better-convex-nuxt module or any of its composables:
  useConvexQuery, useConvexMutation, useConvexAction, useConvexPaginatedQuery, useConvexAuth,
  useConvexUpload, useConvexStorageUrl, useConvexConnectionState, createPermissions,
  serverConvexQuery, serverConvexMutation, serverConvexAction, ConvexAuthenticated,
  ConvexUnauthenticated, ConvexAuthLoading, ConvexAuthError, prependTo, appendTo, removeFrom,
  updateIn. Also use when the user
  mentions Convex+Nuxt integration, even if they don't name the module explicitly.
---

# better-convex-nuxt

Full-featured Nuxt 4+ module for [Convex](https://convex.dev) with SSR, real-time WebSocket subscriptions, Better Auth authentication, file uploads, permissions, and server utilities. All composables and components are **auto-imported**.

Docs: https://better-convex-nuxt.vercel.app

For deeper context on any feature, read the corresponding file under `docs/content/docs/` in this repo.

## Project Structure

```
nuxt.config.ts          # modules: ['better-convex-nuxt'], convex: { ... }
.env.local              # CONVEX_URL=https://your-app.convex.cloud
convex/                 # Backend functions
  schema.ts             # Database schema
  *.ts                  # Queries, mutations, actions
  _generated/api.ts     # Typed API object (auto-generated)
app/pages/              # Vue pages
app/components/         # Vue components
server/api/             # Nuxt server routes using serverConvex*
```

Always import the API object as `import { api } from '~~/convex/_generated/api'`.

## Core Patterns

### Queries

`useConvexQuery` fetches data with SSR and real-time subscriptions. Use `await` for SSR hydration.

```vue
<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

// SSR + real-time subscription
const { data: tasks, status, pending, error, refresh, clear } = await useConvexQuery(
  api.tasks.list,
  { status: 'active' }
)
</script>
```

Reactive args via getter function:

```ts
const filter = ref('active')
const { data } = await useConvexQuery(api.tasks.list, () => ({ status: filter.value }))
```

Options: `default` (initial value), `transform` (post-process), `server` (SSR toggle), `subscribe` (real-time toggle), `shared` (deduplicate across components), `keepPreviousData`.

Reference: `docs/content/docs/2.data-fetching/1.queries.md`

### Conditional Queries

Return `null` from args to skip the query. Status becomes `'skipped'`.

```ts
const teamId = ref<string | null>(null)

const { data: members } = await useConvexQuery(
  api.teams.getMembers,
  () => teamId.value ? { teamId: teamId.value } : null
)
// Query runs only when teamId is non-null
```

Never wrap the composable call in `v-if` — always call it unconditionally and use the null-args pattern.

Reference: `docs/content/docs/2.data-fetching/3.conditional-queries.md`

### Paginated Queries

```vue
<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { results, status, loadMore, hasNextPage, isLoading, isExhausted, refetch, restart }
  = await useConvexPaginatedQuery(api.posts.listPaginated, {}, { initialNumItems: 10 })
</script>

<template>
  <article v-for="post in results" :key="post._id">{{ post.title }}</article>
  <button v-if="hasNextPage" @click="loadMore(10)" :disabled="isLoading">Load More</button>
</template>
```

The backend function must accept `paginationOpts` — do NOT pass it from the client; the composable injects it.

Status values: `'skipped' | 'loading-first-page' | 'ready' | 'loading-more' | 'exhausted' | 'error'`

Reference: `docs/content/docs/2.data-fetching/2.paginated-queries.md`

### Mutations

`useConvexMutation` returns a callable function with reactive state properties.

```vue
<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const createTask = useConvexMutation(api.tasks.create, {
  onSuccess: (result) => { /* handle success */ },
  onError: (error) => { /* handle error */ },
})

async function handleCreate() {
  await createTask({ text: 'Ship it' })
}
</script>

<template>
  <button @click="handleCreate" :disabled="createTask.pending.value">Create</button>
</template>
```

Returns: callable function + `{ data, status, pending, error, reset }` as properties on the function.

Reference: `docs/content/docs/3.mutations/1.mutations.md`

### Optimistic Updates

#### Builder API (ctx.query / ctx.paginatedQuery)

```ts
const addNote = useConvexMutation(api.notes.add, {
  optimisticUpdate: (ctx, args) => {
    // Regular query: .update() or .set()
    ctx.query(api.notes.list, {}).update(notes =>
      notes ? [{ ...args, _id: crypto.randomUUID(), _creationTime: Date.now() }, ...notes] : []
    )

    // Paginated query: .insertAtTop(), .deleteItem(), .updateItem(), .insertAtPosition()
    ctx.paginatedQuery(api.messages.list, { channelId: args.channelId })
      .insertAtTop({ ...args, _id: crypto.randomUUID(), _creationTime: Date.now() })
  },
})
```

`ctx.query(ref, args)` — args must exactly match the query's active subscription args.
`ctx.matchQuery(ref)` — update ALL active subscriptions for a query regardless of args.
`ctx.matchPaginatedQuery(ref)` — same for paginated queries.
`ctx.store` — escape hatch to the raw Convex `OptimisticLocalStore`.

#### Standalone Helpers (auto-imported)

```ts
// Prepend to array query
prependTo(ctx, api.notes.list, {}, { ...args, _id: crypto.randomUUID(), _creationTime: Date.now() })

// Append to array query
appendTo(ctx, api.notes.list, {}, newItem)

// Remove by predicate
removeFrom(ctx, api.notes.list, {}, note => note._id === args.id)

// Update by predicate
updateIn(ctx, api.notes.list, {}, note => note._id === args.id, note => ({ ...note, ...args }))
```

Reference: `docs/content/docs/3.mutations/3.optimistic-updates.md`

### Actions

`useConvexAction` has the same shape as mutations but no `optimisticUpdate`. For external APIs and long tasks.

```ts
const generateReport = useConvexAction(api.reports.generate)
await generateReport({ reportId: '123' })
```

Reference: `docs/content/docs/3.mutations/2.actions.md`

### Authentication

#### Reading auth state

```vue
<script setup lang="ts">
const { user, isAuthenticated, isPending, signOut } = useConvexAuth()
</script>
```

`user` is a `ConvexUser` with: `id, name, email, emailVerified?, image?, createdAt?, updatedAt?`

#### Sign-in (via Better Auth client)

Sign-in uses Better Auth directly, NOT `useConvexAuth()`.

```ts
import { createAuthClient } from 'better-auth/vue'

const authClient = createAuthClient({ baseURL: '/api/auth' })

// OAuth — page redirects, auth state auto-updates on return
await authClient.signIn.social({ provider: 'github' })

// Email/password — must call refreshAuth() after
const { refreshAuth } = useConvexAuthInternal()
const { error } = await authClient.signIn.email({ email, password })
if (!error) {
  await refreshAuth()
  navigateTo('/')
}
```

#### Auth components

```vue
<ConvexAuthenticated>Only visible when signed in</ConvexAuthenticated>
<ConvexUnauthenticated>Only visible when signed out</ConvexUnauthenticated>
<ConvexAuthLoading>Only visible while auth is loading</ConvexAuthLoading>
<ConvexAuthError v-slot="{ retry, error }">Auth failed: {{ error }} <button @click="retry">Retry</button></ConvexAuthError>
```

#### Route protection

```ts
// In page component
definePageMeta({ convexAuth: true })        // Require auth, redirect unauthenticated users
definePageMeta({ skipConvexAuth: true })     // Skip auth token fetching (use on sign-in/public pages)
```

Reference: `docs/content/docs/4.auth-security/`

### File Uploads

```vue
<script setup lang="ts">
import { api } from '~~/convex/_generated/api'

const { upload, data: storageId, status, pending, progress, error } = useConvexUpload(
  api.files.generateUploadUrl,
  { allowedTypes: ['image/*'], maxSizeBytes: 5_000_000 }
)

const imageUrl = useConvexStorageUrl(api.files.getUrl, storageId)
</script>

<template>
  <input type="file" @change="upload(($event.target as HTMLInputElement).files![0])" />
  <div v-if="pending">{{ progress }}%</div>
  <img v-if="imageUrl" :src="imageUrl" />
</template>
```

Reference: `docs/content/docs/5.file-uploads/`

### Server-Side Utilities

Use in `server/api/` routes or server middleware. These are auto-imported in server context.

```ts
// server/api/data.get.ts
import { api } from '~~/convex/_generated/api'

export default defineEventHandler(async (event) => {
  return await serverConvexQuery(event, api.data.getList, {}, { auth: 'auto' })
})
```

Auth modes: `'auto'` (use session if available), `'required'` (throw if no session), `'none'` (skip auth).

Also available: `serverConvexMutation`, `serverConvexAction`.

Reference: `docs/content/docs/6.server-side/`

### Permissions

Enable in config: `convex: { permissions: true }`.

```ts
// app/composables/usePermissions.ts
import { createPermissions } from '#imports'
import { api } from '~~/convex/_generated/api'

export const { usePermissions, usePermissionGuard } = createPermissions({
  query: api.auth.getPermissionContext,  // Returns { role, userId, ... }
  checkPermission: (context, action, resource?) => {
    if (context.role === 'admin') return true
    if (action === 'post.edit') return resource?.authorId === context.userId
    return false
  },
})
```

```vue
<script setup lang="ts">
const { can, isAuthenticated } = usePermissions()
</script>
<template>
  <button v-if="can('post.create').value">New Post</button>
</template>
```

`can()` returns `ComputedRef<boolean>` — use `.value` in templates or store in a variable.

Reference: `docs/content/docs/7.permissions/`

### Connection State

```ts
const { isConnected, isReconnecting, pendingMutations, shouldShowOfflineUi }
  = useConvexConnectionState()
```

Use `shouldShowOfflineUi` (not `!isConnected`) to avoid hydration flash — it's `false` during SSR and only becomes `true` after a real disconnect.

Reference: `docs/content/docs/8.real-time/2.connection-state.md`

## Configuration

```ts
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,      // Auto-derived, override if needed
    auth: true,                                  // true | false | AuthOptions
    // auth: { route: '/api/auth', trustedOrigins: ['https://*.vercel.app'] },
    query: { server: true, subscribe: true },    // SSR and real-time defaults
    upload: { maxConcurrent: 3 },
    permissions: false,                          // Enable createPermissions
    logging: false,                              // false | 'info' | 'debug'
  },
})
```

Reference: `docs/content/docs/9.configuration/1.module-options.md`

## Common Gotchas

1. **Import path**: Always `import { api } from '~~/convex/_generated/api'` — not from `convex/`.
2. **Mutations/actions are client-only**: `useConvexMutation` and `useConvexAction` do not run during SSR. Use `serverConvexMutation` for server-side mutations.
3. **SSR requires await**: `await useConvexQuery(...)` for SSR hydration. Without `await`, data starts as `null` and loads client-side.
4. **Conditional queries**: Return `null` from args getter to skip. Never wrap the composable in `v-if`.
5. **Optimistic update args must match**: `ctx.query(ref, args)` — the `args` must exactly match what the active query was called with. Use `ctx.matchQuery(ref)` when unsure.
6. **Email sign-in needs refreshAuth**: After `authClient.signIn.email()`, call `refreshAuth()` from `useConvexAuthInternal()`. OAuth doesn't need this (page redirects).
7. **Sign-in page meta**: Use `definePageMeta({ skipConvexAuth: true })` on sign-in/sign-up pages to prevent redirect loops.
8. **Don't pass paginationOpts**: The paginated query composable injects `paginationOpts` automatically.
9. **Load env correctly**: Run `nuxt dev --dotenv .env.local` to pick up `CONVEX_URL`.
10. **Async context for serverConvex without event**: If omitting the `event` parameter from `serverConvexQuery`, enable `experimental: { asyncContext: true }` in nuxt.config.

## Error Handling

Convex calls can throw `ConvexCallError` with `{ message, code, status, helper, operation, functionPath, convexUrl, authMode }`. Errors are also available on the reactive `error` ref.

The `convex:unauthorized` Nuxt hook fires on 401/403 errors when `auth.unauthorized.enabled` is true. Configure `auth.unauthorized.redirectTo` for automatic redirects.

Reference: `docs/content/docs/3.mutations/4.error-handling.md`

## Documentation Reference

| Topic | File |
|-------|------|
| Getting started | `docs/content/docs/1.guide/` |
| Queries | `docs/content/docs/2.data-fetching/1.queries.md` |
| Paginated queries | `docs/content/docs/2.data-fetching/2.paginated-queries.md` |
| Conditional queries | `docs/content/docs/2.data-fetching/3.conditional-queries.md` |
| Transforms & defaults | `docs/content/docs/2.data-fetching/4.transforms-and-defaults.md` |
| Shared queries | `docs/content/docs/2.data-fetching/5.shared-queries.md` |
| Mutations | `docs/content/docs/3.mutations/1.mutations.md` |
| Actions | `docs/content/docs/3.mutations/2.actions.md` |
| Optimistic updates | `docs/content/docs/3.mutations/3.optimistic-updates.md` |
| Error handling | `docs/content/docs/3.mutations/4.error-handling.md` |
| Authentication | `docs/content/docs/4.auth-security/` |
| File uploads | `docs/content/docs/5.file-uploads/` |
| Server-side | `docs/content/docs/6.server-side/` |
| Permissions | `docs/content/docs/7.permissions/` |
| Real-time | `docs/content/docs/8.real-time/` |
| Configuration | `docs/content/docs/9.configuration/` |
| Deployment | `docs/content/docs/10.deployment/` |
| API reference | `docs/content/docs/12.api-reference/` |

Read these files for deeper context when working on specific features.
