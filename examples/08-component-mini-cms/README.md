# Example 08 — Component Mini CMS

## What this example is for

The architecture branch.

Open this when you want to understand a local component boundary, root-app wrappers, caller
forwarding, and MCP projected over bridge-backed operations. This is intentionally niche and comes
after the main app and MCP examples.

The main lesson here is the component boundary. MCP is secondary in this example; it only exists to
show that the same bridge-backed operations can be projected outward after the host/component split
is already clear.

## What it teaches

- local Convex component boundaries
- caller forwarding across browser, root app, and component
- app-owned bridge inventory with `createComponentBridge(...)`
- MCP over internal bridge refs and action-backed bridge operations
- why a component/host architecture differs from ordinary root-app handlers

## What this example assumes

You already understand the canonical protected workspace model from
[`03-team-workspace`](../03-team-workspace/README.md) and the MCP surface from
[`07-mcp-reference`](../07-mcp-reference/README.md).

## Files to read first

1. `convex/components/miniCms/features/pages/domain.ts`
2. `convex/components/miniCms/features/pages/operations.ts`
3. `convex/features/pages/{bridge,domain}.ts`
4. `server/mcp/tools/publish-page.ts`
5. `server/lib/mcp-runtime.ts`
6. `app/features/pages/components/MiniCmsStudioPage.vue`

## Demo flow

1. Start the example and sign in to the studio.
2. Create or edit a draft through the root-app wrappers.
3. Inspect how the root app forwards the caller into the component.
4. Use the demo MCP caller to exercise the action-backed publish operation over the same bridge.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret
- `CONVEX_IDENTITY_FORWARDING_KEY`: identity forwarding into the component boundary
- `JWKS`: local auth bootstrap for the example
- `DEMO_MCP_TOKEN`: server-only MCP caller token required for agent write/publish recordAccess

## Test

- `pnpm test`
- `pnpm typecheck`

## When to stop here / move on

Stop here if your question is architectural: “how do I structure a host app around a local
component and still project it cleanly into MCP?”

Related example:

- [`07-mcp-reference`](../07-mcp-reference/README.md) for the full MCP surface without the
  component boundary
