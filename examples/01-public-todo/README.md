# Public Todo Example

This is the smallest useful V2 app.

It shows:

- `createFunctions()` with a no-op actor config
- `publicQuery` and `publicMutation`
- one `defineSchema()` object reused by Convex handlers
- `useConvexQuery()` and `useConvexMutation()` in the page

## Files To Read First

1. `convex/functions.ts`
2. `shared/schemas/todo.ts`
3. `convex/todos.ts`
4. `pages/index.vue`

## What To Try

1. Add a todo.
2. Toggle it complete.
3. Delete it.

This app has no auth and no tenant scoping, so the builder context stays intentionally minimal.
