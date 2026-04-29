# Example 01 — Public Todo

## What this example is for

Your first contact with Trellis.

This example is intentionally tiny. It exists to make the Nuxt ↔ Trellis ↔ Convex loop obvious
before auth, tenants, permissions, or server integrations show up.

## What it teaches

- minimal Trellis setup in the feature-folder layout
- runtime-neutral contracts under `shared/features/*`
- Convex business code under `convex/features/*`
- one live query plus mutation-driven page flow
- public data only, with no auth or tenant model

## What this example assumes

Nothing. This is the start of the gallery.

## Files to read first

1. `convex/functions.ts`
2. `shared/features/todos/contract.ts`
3. `convex/features/todos/domain.ts`
4. `app/features/public-todo/components/PublicTodoPage.vue`

## Demo flow

1. Add a todo.
2. Toggle it complete.
3. Delete it.

If that round-trip feels obvious, the example has done its job.

## Run

1. `pnpm install`
2. `pnpm dev`

`pnpm dev` starts a local Convex deployment automatically and injects the local Convex URLs for
Nuxt.

## Test

- `pnpm test`
- `pnpm typecheck`

## When to stop here / move on

Stop here if you only needed to understand the public data flow.

Move to [`02-auth-todo`](../02-auth-todo/README.md) when you want the same simple domain with real
auth and ownership.
