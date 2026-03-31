# Auth Todo Example

This example adds real email/password auth on top of the public todo app.
It is the “personal app” stopping point: authenticated users, guaranteed actors, no tenant model.

It shows:

- Better Auth wired through Convex
- app-owned `convex/auth/actor.ts`
- a tiny `convex/auth/scope.ts` helper for not-found + ownership checks
- raw Convex `query()` and `mutation()`
- explicit ownership checks in handlers
- auth-aware page rendering with `ConvexAuthenticated`, `ConvexUnauthenticated`, and `ConvexAuthLoading`

## Files To Read First

1. `convex/auth.ts`
2. `convex/auth/actor.ts`
3. `convex/todos.ts`
4. `pages/index.vue`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

`pnpm dev` starts the local Convex deployment for you. Keep `SITE_URL` and `BETTER_AUTH_SECRET` in `.env.local`;
do not set `CONVEX_URL` manually for this example.

## What To Try

1. Create an account.
2. Add a few todos.
3. Sign out and sign back in.
4. Create a second account and verify the lists stay separate.
