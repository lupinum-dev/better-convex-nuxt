# Example 02 — Auth Todo

## What this example is for

The smallest Trellis app with real auth.

This is the personal-app stopping point: authenticated users, resolved actors, personal ownership,
and no tenant model yet.

## What it teaches

- Better Auth wiring through Convex
- app-owned appIdentity resolution
- signed-in / signed-out UI states
- personal ownership checks in handlers
- feature layout with `shared/features/*`, `convex/features/*`, and `app/features/*`
- Trellis-backed handlers without workspace or role complexity

## What this example assumes

You understand the public data flow from [`01-public-todo`](../01-public-todo/README.md).

## Files to read first

1. `convex/auth.ts`
2. `convex/auth/appIdentity.ts`
3. `shared/features/todos/contract.ts`
4. `convex/features/todos/domain.ts`
5. `app/features/auth-todo/components/AuthTodoPage.vue`

## Demo flow

1. Create an account.
2. Add a few todos.
3. Sign out and sign back in.
4. Create a second account and verify the lists stay separate.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret

Do not set `CONVEX_URL` manually for this example. The launcher injects it.

## Test

- `pnpm test`
- `pnpm typecheck`

This example includes a small Convex test harness as the personal-auth starter reference.

## When to stop here / move on

Stop here if your app is personal and ownership-based.

Move to [`03-team-workspace`](../03-team-workspace/README.md) when you need the canonical protected
team app with tenants, roles, and access context.
