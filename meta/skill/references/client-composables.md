# Client Composables

Use this for Vue/Nuxt client work: live queries, mutations, actions,
pagination, cached detail reads, uploads, storage URLs, connection state, and
auth composables.

## Source Files

- Barrel: `src/runtime/composables/index.ts`.
- Query: `src/runtime/convex/composables/useConvexQuery.ts`.
- Paginated query: `src/runtime/convex/composables/useConvexPaginatedQuery.ts`.
- Cached query: `src/runtime/convex/composables/useCachedQuery.ts`.
- Mutation/action: `src/runtime/convex/composables/useConvexMutation.ts`,
  `src/runtime/convex/composables/useConvexAction.ts`.
- Optimistic helpers:
  `src/runtime/convex/composables/optimistic-updates.ts`.
- Uploads/storage:
  `src/runtime/convex/composables/useConvexUpload.ts`,
  `src/runtime/convex/composables/useConvexStorageUrl.ts`.
- Auth composables: `src/runtime/auth/composables/*`.
- Narrative docs: `apps/docs/content/docs/03.data-fetching/**`,
  `apps/docs/content/docs/04.mutations/**`,
  `apps/docs/content/docs/05.auth-security/**`,
  `apps/docs/content/docs/06.file-uploads/**`,
  `apps/docs/content/docs/13.api-reference/1.composables.md`.

## Query Pattern

Default to `await useConvexQuery(api.module.fn, args)` in `<script setup>` for
SSR, hydration, and live subscription.

```vue
<script setup lang="ts">
import { api } from '#trellis/api'

const {
  data: tasks,
  pending,
  error,
} = await useConvexQuery(api.tasks.list, {
  status: 'active',
})
</script>
```

Use nullish args to skip a query. Do not call composables conditionally.

```ts
const args = computed(() => (isAuthenticated.value ? {} : undefined))
const { data, status } = await useConvexQuery(api.todos.list, args)
```

Use a getter for args that depend on reactive values, especially nested values:

```ts
const { data, isStale } = await useConvexQuery(
  api.search.notes,
  () => ({ filter: { tag: tag.value } }),
  { keepPreviousData: true },
)
```

## Query Options

- `keepPreviousData: true`: keep old data visible while args change.
- `subscribe: false`: one-shot snapshot through the composable shape.
- `server: false`: skip SSR for non-critical client-only data.
- `default`: seed placeholder data.
- `transform`: derive a view of returned data; keep default and result shapes
  compatible.

Use `executeConvexQuery()` when there is no need for composable state,
subscription, or Vue lifecycle integration. It is a Nuxt auto-import, not a
package export.

## Pagination And Cache Seeding

Use `useConvexPaginatedQuery(...)` for cursor-based list UIs. Keep pagination
state in the composable rather than hand-rolling independent query calls.

Use `useCachedQuery(...)` for list-to-detail transitions where an already loaded
list item can seed the detail view while the authoritative detail query catches
up. Do not use it as a replacement for backend authorization or as a stale
client store.

## Mutations And Actions

Create the composable once near the top of `<script setup>`, then call the
returned function from handlers.

```ts
const createTodo = useConvexMutation(api.todos.create)

async function submit() {
  await createTodo({ title: title.value })
}
```

The returned function carries refs such as `status`, `pending`, `data`, `error`,
and `reset()`. Use those refs instead of separate loading/error refs.

Use `useConvexAction(...)` for Convex actions that call external systems or need
action semantics. Do not use an action for normal state-changing writes; use a
mutation.

Prefer `onSuccess` and `onError` options for toasts, redirects, and structured
error handling. Do not ignore mutation/action errors; Trellis intentionally
warns in development when failures are not observed.

## Optimistic Updates

Optimistic helpers exported by the composables barrel:

- `prependTo`
- `appendTo`
- `removeFrom`
- `updateIn`

Use them with `useConvexMutation` optimistic hooks rather than mutating query
state ad hoc.

## Auth UI

Use `useConvexAuth()` for provider-neutral reactive auth state.
Use `useBetterAuthClient()` when UI code needs direct Better Auth calls.
Use `useBetterAuthActions()` for Better Auth actions that need Convex auth
refresh after sign-in/sign-out flows.

The auth components are global only when `trellis.auth` is enabled:

- `<ConvexAuthenticated>`
- `<ConvexUnauthenticated>`
- `<ConvexAuthLoading>`
- `<ConvexAuthError>`

## Pitfalls

- Conditional composable calls break Vue lifecycle rules; pass `undefined` or
  `null` args instead.
- `subscribe: false` can silently stale a UI that expects live updates.
- Browser `allows(...)` from `usePermissions()` is a server projection, not a
  policy engine.
- Do not import backend guards into Vue code to re-run authorization.
