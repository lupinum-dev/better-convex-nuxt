# Public Todo Example

This is the smallest useful public-only app.

It shows:

- `trellis: { url }` and nothing else
- the smallest Trellis-backed `createApp(...)` runtime
- one `defineArgs()` object reused by Convex handlers
- `useConvexQuery()` and `useConvexMutation()` in the page

## Files To Read First

1. `shared/schemas/todo.ts`
2. `convex/todos.ts`
3. `pages/index.vue`

## Run It

1. `pnpm install`
2. `pnpm dev`

`pnpm dev` starts a local Convex deployment automatically and injects the local Convex URLs for Nuxt.

## What To Try

1. Add a todo.
2. Toggle it complete.
3. Delete it.

This app has no auth and no tenant scoping. That is the point: one page, one shared args
definition, and almost no ceremony.
