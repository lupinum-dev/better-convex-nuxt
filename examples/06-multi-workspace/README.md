# Example 06 — Multi-Workspace Agency Portal

## What this example is for

The tenant-model upgrade branch.

Open this when the canonical single-workspace model from Example 03 is no longer enough and you
need explicit memberships, active workspace switching, or carefully limited cross-workspace views.

This is the architectural fork from Example 03, not just “more features.” If one user still maps
cleanly to one workspace, staying on Example 03 is the simpler and better design.

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

1. `convex/features/index.ts`
2. `convex/features/workspaces/domain.ts`
3. `convex/features/dashboard/domain.ts`
4. `convex/auth/appIdentity.ts`
5. `shared/features/workspaces/contract.ts`
6. `app/features/multi-workspace/components/AgencyPortalPage.vue`
7. `convex/agency.test.ts`

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

## Production notes

- The cross-scope seams here are intentional and membership-bounded. Trellis escapes tenant
  isolation only to resolve memberships, switch the active workspace, or aggregate the agency
  portfolio across workspaces the caller already belongs to.
- That makes this example an architectural fork from `03-team-workspace`, not a permission shortcut.
  If each user still belongs to exactly one workspace, staying on the single-workspace model is the
  safer and simpler design.
- The agency dashboard is a bounded operator view, not a general cross-scope query pattern. Keep
  the membership gate and explicit unsafe permits if you adapt it for production.

## Test

- `pnpm test`
- `pnpm typecheck`
- `pnpm typecheck:tests`

## Layout notes

- runtime-neutral contracts live in `shared/features/*`
- backend business modules live in `convex/features/*`
- `convex/schema.ts`, `convex/functions.ts`, `convex/auth.ts`, and other Convex shell files stay at the root
- `pages/*` stay thin route shells; the UI lives in `app/features/multi-workspace/*`

## When to stop here / move on

Stop here if the hard problem is multi-workspace membership and switching.

Stay on [`03-team-workspace`](../03-team-workspace/README.md) if each user belongs to exactly one
workspace and that model is still serving you well.

Related branches:

- [`05-visibility-access`](../05-visibility-access/README.md) for harder authorization inside one workspace
- [`07-mcp-reference`](../07-mcp-reference/README.md) for MCP over a protected app
