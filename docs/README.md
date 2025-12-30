# Convexi - Nuxt Module for Convex

Real-time data composables for Nuxt 3 with SSR support, authentication, and TypeScript.

## Quick Reference

| I want to...                    | Use this pattern                                 | Doc                                                      |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------- |
| Fetch data with loading states  | `useConvexQuery` with `status`                   | [queries.md](./queries.md#status-based-rendering)        |
| Skip a query conditionally      | `computed(() => condition ? {} : 'skip')`        | [queries.md](./queries.md#conditional-queries)           |
| Wait for data before navigation | `await ready` or `await Promise.all([...ready])` | [queries.md](./queries.md#blocking-navigation)           |
| Chain dependent queries         | Computed args from previous query data           | [queries.md](./queries.md#dependent-queries)             |
| Show skeletons during SSR       | `<ClientOnly>` with `#fallback`                  | [ssr-patterns.md](./ssr-patterns.md#clientonly-skeleton) |
| Show skeletons on client        | `v-if="status === 'pending'"`                    | [ssr-patterns.md](./ssr-patterns.md#status-skeleton)     |
| Call a mutation with loading    | `useConvexMutation` with `pending`               | [mutations.md](./mutations.md#basic-mutation)            |
| Show per-item loading in list   | Manual `ref<Id                                   | null>` tracking                                          | [mutations.md](./mutations.md#per-item-loading) |
| Check if user is authenticated  | `useConvexAuth()` or `usePermissions()`          | [auth.md](./auth.md#composables)                         |
| Check user permissions          | `can('permission', resource?)`                   | [auth.md](./auth.md#the-can-function)                    |
| Protect a page                  | `usePermissionGuard('permission', '/redirect')`  | [auth.md](./auth.md#usepermissionguard)                  |
| Authorize backend mutations     | `await authorize(ctx, 'permission', resource)`   | [auth.md](./auth.md#authorize)                           |

---

## API Summary

### useConvexQuery

```typescript
const {
  data,      // Ref<T | undefined> - query result
  status,    // ComputedRef<'idle' | 'pending' | 'success' | 'error'>
  pending,   // ComputedRef<boolean> - shorthand for status === 'pending'
  error,     // Ref<Error | null>
  refresh,   // () => Promise<void> - re-execute query
  ready,     // Promise<void> - resolves when data first loads
} = useConvexQuery(query, args?, options?)
```

### useConvexMutation

```typescript
const {
  mutate,    // (args) => Promise<Result> - execute mutation
  data,      // Ref<Result | undefined> - last successful result
  status,    // ComputedRef<'idle' | 'pending' | 'success' | 'error'>
  pending,   // ComputedRef<boolean> - shorthand for status === 'pending'
  error,     // Ref<Error | null>
  reset,     // () => void - reset to idle state
} = useConvexMutation(mutation)
```

### useConvexAuth

```typescript
const {
  token,           // Ref<string | null> - JWT token
  user,            // Ref<ConvexUser | null> - user data
  isAuthenticated, // ComputedRef<boolean>
  isPending,       // Ref<boolean>
} = useConvexAuth()
```

### usePermissions

```typescript
const {
  can,             // (permission, resource?) => boolean
  role,            // ComputedRef<'owner' | 'admin' | 'member' | 'viewer' | null>
  orgId,           // ComputedRef<Id<'organizations'> | null>
  isAuthenticated, // ComputedRef<boolean>
  isLoading,       // ComputedRef<boolean>
} = usePermissions()
```

---

## Decision Flowchart

```
Need to fetch data?
├── Yes → useConvexQuery
│   ├── Data depends on condition (auth, other data)?
│   │   └── Use computed args with 'skip'
│   ├── Need to wait for data before showing page?
│   │   └── await ready (or Promise.all for multiple)
│   ├── SSR/prerender this page?
│   │   └── Wrap in <ClientOnly> with skeleton #fallback
│   └── Show loading state?
│       └── Use status === 'pending' for skeleton
│
└── Need to modify data?
    └── useConvexMutation
        ├── Single button?
        │   └── Use pending shorthand
        └── List with per-item actions?
            └── Manual ref tracking (isDeleting = id)
```

---

## Status Values

Both composables use the same status values:

| Status      | Meaning          | When                          |
| ----------- | ---------------- | ----------------------------- |
| `'idle'`    | Query skipped    | Args returned `'skip'`        |
| `'pending'` | Waiting for data | Initial load or refetch       |
| `'success'` | Have data        | Server responded successfully |
| `'error'`   | Query failed     | Server returned error         |

---

## Files

- [queries.md](./queries.md) - Complete guide to `useConvexQuery`
- [mutations.md](./mutations.md) - Complete guide to `useConvexMutation`
- [ssr-patterns.md](./ssr-patterns.md) - SSR, prerendering, and skeleton patterns
- [auth.md](./auth.md) - Authentication and role-based permissions
