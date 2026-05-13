# Example 05 — Visibility and Access Knowledge Base

## What this example is for

The advanced authorization branch.

Open this when the canonical workspace model from Example 03 is still right, but your access rules
are now the hard part.

This example is intentionally not a tenant-model or integration example. The point is to study
authorization inside one workspace without mixing in MCP or multi-workspace concerns.

## What it teaches

- row-level visibility
- field redaction
- enrollment-based access
- prerequisite chains
- share tokens
- inherited access levels

Every major feature in this example maps to a recognizable production authorization problem.

## What this example assumes

You already understand the canonical protected workspace model from
[`03-team-workspace`](../03-team-workspace/README.md).

## Files to read first

1. `convex/features/articles/domain.ts`
2. `convex/features/knowledgeBases/domain.ts`
3. `convex/features/articles/permissions.ts`
4. `convex/features/articles/operations.ts`
5. `convex/knowledgeBase.test.ts`

## Demo flow

1. Sign up and create a workspace.
2. Create a knowledge base and a few articles.
3. Compare what different roles can see.
4. Add prerequisites and enrollment requirements.
5. Generate or revoke a share token and confirm inherited access behavior.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret

## Production notes

- The share-token path is the only intentional cross-scope read in this example. It exists so one
  hashed token can resolve one article without first resolving a workspace appIdentity.
- That escape hatch stays narrow on purpose: the token lookup is hashed at rest, matched back to the
  requested article id, and covered by revoke and expiry behavior in the example tests.
- Treat this as a bounded external-access seam, not as a generic public-content pattern. If most of
  your content is meant to be public, model that directly instead of routing everything through share
  tokens.

## Test

- `pnpm test`
- `pnpm typecheck`
- `pnpm typecheck:tests`

## When to stop here / move on

Stop here if your hard problem is authorization design inside a single workspace.

Related branches:

- [`06-multi-workspace`](../06-multi-workspace/README.md) if the tenant model itself must change
- [`07-mcp-reference`](../07-mcp-reference/README.md) if the next hard problem is MCP, not access control
