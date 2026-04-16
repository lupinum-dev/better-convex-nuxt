# 01 Kanban Workspace

Inspired by: **Trello**

This is the first real `examples-next` app.

It stays intentionally plain in the UI:

- Nuxt page + local components
- layout-only CSS
- no color system
- no border-heavy design
- no UI library surface

The point is to prove backend and runtime concepts, not styling.

## vNext status

This example now uses the **vNext-facing Trellis runtime shape**:

- direct `query` / `mutation` exports from `defineTrellis(...)`
- no nested `app` builder object in feature files
- operations used as a first-class business seam

One legacy Convex seam still remains:

- `convex/functions.ts` still has to import generated builders from `./_generated/server`

That is a real underlying constraint of the current runtime, not something this example should fake away.

## What this implementation covers

- Better Auth sign up / sign in
- app-owned user rows and actor resolution
- workspace creation and demo join flow
- tenant-scoped kanban tables (`boards`, `columns`, `cards`)
- role-gated mutations
- ordered card movement between columns
- destructive board archive preview using `defineOperation(...)` + `previewOf(...)`

## Why this matters

This is the smallest example that still proves Trellis can handle:

- protected app auth
- tenancy
- real-time board queries
- app-owned business rules
- a real destructive preview flow

If this cannot feel clean, the framework is not ready for more ambitious app families.

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

## Demo Flow

1. Create account A and create workspace `alpha`
2. Add a few cards across the seeded columns
3. Create account B and join `alpha` as `viewer`
4. Confirm account B can read the board but cannot create or move cards
5. Sign back in as account A and preview archive of the board

## Files To Read First

1. `convex/schema.ts`
2. `convex/auth/principal.ts`
3. `convex/auth/actor.ts`
4. `convex/auth/checks.ts`
5. `convex/workspaces.ts`
6. `convex/boards.ts`
7. `composables/useKanbanBoard.ts`
8. `pages/index.vue`

## Next Improvements

This first cut is deliberately narrow.

Possible follow-ups:

- card comments
- list creation and reordering
- board members and invitations
- MCP projection over the archive operation
- activity log
