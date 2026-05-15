# 01 Kanban Workspace

Archived legacy experimental app. This is not a maintained Trellis example and should be treated as migration input rather than a current reference.

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

The example also ships a small header-based MCP auth bridge for local use:

- send `x-kanban-mcp-user: <authId>` to `/mcp`
- optional: send `x-kanban-mcp-agent: <agentId>` to mark the caller as an agent

That keeps the example reproducible without pretending it ships a production MCP identity layer.

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

Observability is real, but this example now states the truth about proof:

- `pnpm test` covers domain behavior plus shared policy and board-selection logic
- repo-level Trellis tests cover MCP destructive confirmation and runtime observability guarantees
- live `evlog` delivery across browser/backend/MCP still needs manual inspection while the app is running

## Status

Do not treat this app as a supported example contract. The maintained public examples live under `examples/`.

## MCP Demo

1. Start the app with the commands above.
2. Sign in once in the UI so the app creates a user row and workspace membership.
3. Use that user `authId` as `x-kanban-mcp-user` when calling `/mcp`.

Bootstrap a session:

```bash
curl -i http://localhost:3000/mcp \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'x-kanban-mcp-user: alpha-owner' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "curl", "version": "1.0.0" }
    }
  }'
```

Take the `Mcp-Session-Id` header from that response and call the destructive tool:

```bash
curl http://localhost:3000/mcp \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'x-kanban-mcp-user: alpha-owner' \
  -H 'Mcp-Session-Id: <session-id>' \
  --data '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "archive-board",
      "arguments": {
        "workspace": "alpha",
        "board": "alpha-board"
      }
    }
  }'
```

That first call returns a preview with `preview.confirmation.token`. Send the same call again with `_confirmationToken` set to that value to execute the archive.

## Observability Demo

Trellis observability is enabled in:

- `nuxt.config.ts`
- `convex/functions.ts`
- `server/mcp/runtime.ts`

To inspect it while the example is running:

1. keep `dev:nuxt` running in a terminal
2. create, move, or archive cards through the UI or `/mcp`
3. watch the server output for correlated semantic observation events
4. compare that live output with the durable audit list shown in the UI

Audit is the durable business trail.
Observability is the correlated runtime decision trail.

## Verification

This folder is archived legacy input, not a maintained example contract. Repo verification runs against the canonical `examples/` apps instead.

## Current caveat

This app is still experimental and has not been cut over to the same polished permission/story shape as the maintained `examples/` set. Treat it as framework pressure, not as copy-paste reference code.

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

It is not background noise.
The example is intentionally surfacing a real current Trellis limitation around multi-workspace reference tables.
