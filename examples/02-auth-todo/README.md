# Auth Todo Example

This example adds real email/password auth on top of the public todo app.
It is the “personal app” stopping point: authenticated users, guaranteed actors, no tenant model.

It shows:

- Better Auth wired through Convex
- app-owned `convex/auth/actor.ts`
- raw Convex `query()` and `mutation()`
- explicit ownership checks in handlers
- auth-aware page rendering with `ConvexAuthenticated`, `ConvexUnauthenticated`, and `ConvexAuthLoading`

## Files To Read First

1. `convex/auth.ts`
2. `convex/auth/actor.ts`
3. `convex/todos.ts`
4. `pages/index.vue`

## What To Try

1. Create an account.
2. Add a few todos.
3. Sign out and sign back in.
4. Create a second account and verify the lists stay separate.
