# Example 03 — Team Workspace

## What this example is for

The canonical Trellis protected app.

If someone asks, “How do I build a normal team app with Trellis?”, this is the example to open.
It is the default single-workspace reference for the repo.

## What it teaches

- the canonical `workspaceId` / `by_workspace` tenant model
- roles, guards, and permission context
- `_can`-driven frontend capability checks
- root shell plus `convex/features/*` and `app/features/*`
- protected handler shape for a normal team app
- the canonical `guard -> load -> authorize -> handler` split when a decision depends on a record
- one small server-boundary proof: webhook idempotency with a route-owned signature plus trusted forwarding delegation

## What this example assumes

You understand auth + ownership from [`02-auth-todo`](../02-auth-todo/README.md).

## Files to read first

1. `convex/auth/actor.ts`
2. `convex/auth/guards.ts`
3. `convex/features/index.ts`
4. `convex/permissions/context.ts`
5. `convex/features/todos/domain.ts`
6. `shared/features/todos/contract.ts`
7. `app/features/team-workspace/components/TeamWorkspacePage.vue`

Then, if you want the small server-boundary proof:

8. `convex/features/todos/webhooks.ts`
9. `server/api/webhook.post.ts`
10. `convex/todos.test.ts`

## Demo flow

1. Create account A and create workspace `alpha`.
2. Create account B and create workspace `beta`.
3. Add todos in both workspaces and verify the lists stay isolated.
4. Confirm the owner can manage all todos inside their own workspace.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret
- `TEAM_WORKSPACE_WEBHOOK_SECRET`: webhook route signature secret
- `TEAM_WORKSPACE_WEBHOOK_AUTH_ID`: existing workspace user that verified webhook calls act for

## Test

- `pnpm test`
- `pnpm typecheck`

This example is also the canonical `@lupinum/trellis/testing` proof for the default single-workspace
schema.

## When to stop here / move on

Stop here for most protected apps.

Move to [`04-saas-platform`](../04-saas-platform/README.md) when you want to see Nitro routes,
uploads, and other server boundaries on top of the same workspace model.

Related advanced branches:

- [`05-visibility-access`](../05-visibility-access/README.md) for hard authorization patterns
- [`06-multi-workspace`](../06-multi-workspace/README.md) for the memberships-based upgrade path
- [`07-mcp-reference`](../07-mcp-reference/README.md) for the full MCP surface
