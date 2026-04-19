# Example 06 — Multi-Workspace Agency Portal

## What this example is for

The tenant-model upgrade branch.

Open this when the canonical single-workspace model from Example 03 is no longer enough and you
need explicit memberships, active workspace switching, or carefully limited cross-workspace views.

## What it teaches

- memberships-based multi-workspace auth
- active workspace switching
- role-by-membership instead of role-on-user
- cross-workspace views with explicit limits
- when to stay on Example 03 versus when to move to this model

## What this example assumes

You already understand the canonical protected workspace model from
[`03-team-workspace`](../03-team-workspace/README.md).

## Files to read first

1. `convex/domain/workspaces.ts`
2. `convex/domain/dashboard.ts`
3. `convex/auth/actor.ts`
4. `convex/auth/agency.ts`
5. `pages/index.vue`
6. `convex/agency.test.ts`

## Demo flow

1. Sign up and create a client workspace.
2. Seed or inspect a second workspace membership.
3. Switch the active workspace.
4. Compare the current-workspace view with the agency dashboard.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret

## Test

- `pnpm test`
- `pnpm typecheck`
- `pnpm typecheck:tests`

## When to stop here / move on

Stop here if the hard problem is multi-workspace membership and switching.

Stay on [`03-team-workspace`](../03-team-workspace/README.md) if each user belongs to exactly one
workspace and that model is still serving you well.

Related branches:

- [`05-visibility-access`](../05-visibility-access/README.md) for harder authorization inside one workspace
- [`07-mcp-reference`](../07-mcp-reference/README.md) for MCP over a protected app
