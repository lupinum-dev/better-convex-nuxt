# Auth Todo Example

This example adds real email/password auth on top of the public todo app.
It is the “personal app” stopping point: authenticated users, guaranteed actors, no tenant model.

It shows:

- Better Auth wired through Convex
- app-owned `convex/auth/actor.ts`
- a tiny `convex/permissions/resources.ts` helper for not-found + ownership checks
- Trellis-backed handlers without a tenant model
- explicit ownership checks in handlers
- auth-aware page rendering with `ConvexAuthenticated`, `ConvexUnauthenticated`, and `ConvexAuthLoading`
- the same app-owned `convex/test.setup.ts` bridge used by the larger examples

## Files To Read First

1. `convex/auth.ts`
2. `convex/auth/actor.ts`
3. `convex/permissions/resources.ts`
4. `convex/domain/todos.ts`
5. `pages/index.vue`

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

## Testing

This example now includes a small Convex test harness as the personal-auth starter reference:

- `vitest.config.ts` uses `convexTestConfig(...)`
- `convex/test.setup.ts` keeps the Vite module glob in app code
- `convex/todos.test.ts` proves that one user cannot mutate another user's todo

Ownership uses `ownerId` here on purpose. Moving from personal auth to tenant scoping later should
add `workspaceId`, not force a rename of the ownership field.
