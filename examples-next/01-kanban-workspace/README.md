# 01 Kanban Workspace

Inspired by: **Trello**

This example is the Trellis **stress-test reference app** for a collaborative workspace product.

It is intentionally plain in the UI. The goal is not visual fidelity. The goal is proving that Trellis can support the hard parts of a real Trello-style MVP without collapsing into compatibility glue or fake shortcuts.

## What This Example Proves

- Better Auth sign up / sign in / sign out
- app-owned user rows
- explicit workspace memberships
- active workspace switching
- multiple boards per workspace
- ordered columns and ordered cards
- real reorder semantics, not append-only movement
- role-gated mutations
- destructive archive preview + confirm
- first-class MCP tools for workspace/board/card workflows
- audit visibility for human and MCP actions
- Trellis observability wired for backend, browser, and MCP surfaces

## Deliberate Non-Goals

This example does **not** try to be full Trello parity.

Out of scope for this version:

- polished design system
- comments
- labels
- due dates
- attachments
- notifications
- power-ups

## Important Model Decisions

This example intentionally does **not** use the old shortcuts:

- no single-workspace membership model on the user row
- no self-select-your-role join form
- no implicit “first board is the current board”
- no left/right-only card movement
- no append-only fake ordering
- no MCP backdoor around business rules

Instead:

- `users.activeWorkspaceId` stores only the current workspace selection
- real memberships live in `memberships`
- boards are listed and explicitly selected
- card and column ordering is handled through real reorder operations

## Core Flows

### Human flow

1. Sign up as user A
2. Create a workspace
3. Create boards
4. Add user B by email to the workspace
5. Switch between boards
6. Create columns and cards
7. Reorder columns
8. Reorder cards within a column
9. Move cards across columns
10. Preview and confirm board archive

### MCP flow

Available MCP tools include:

- `list-workspaces`
- `list-boards`
- `create-card`
- `move-card`
- `archive-board`

Example intents:

- “add a card to workspace `alpha`”
- “add a card to board `alpha-board` in column `Doing`”
- “move card `Agent card` to `Done`”
- “archive board `alpha-board`”

Destructive archive still goes through preview + confirm.

## Observability and Audit

The example enables Trellis observability in:

- browser
- backend
- MCP

It also writes durable audit events for:

- member add / role change
- board creation
- column creation / rename / reorder
- card creation / update / movement
- board archive

The UI shows the latest workspace audit events so the behavior is visible while testing.

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. In one terminal: `pnpm --dir examples-next/01-kanban-workspace convex:dev`
4. In another terminal: `pnpm --dir examples-next/01-kanban-workspace dev:nuxt`

## Verification

- `pnpm --dir examples-next/01-kanban-workspace typecheck`
- `pnpm --dir examples-next/01-kanban-workspace test`

## Files To Read First

1. `requirements.md`
2. `convex/schema.ts`
3. `convex/auth/principal.ts`
4. `convex/auth/actor.ts`
5. `convex/workspaces.ts`
6. `convex/boards.ts`
7. `server/mcp/runtime.ts`
8. `pages/index.vue`

## Current Caveat

Trellis currently warns that `memberships` has a tenant-shaped field (`workspaceId`) without being registered as a tenant-isolated table.

That is intentional in this example:

- `memberships` must remain queryable across a user’s accessible workspaces
- the example uses explicit business checks instead of pretending memberships are single-tenant data

That warning reflects a real framework tension this example is meant to expose.
