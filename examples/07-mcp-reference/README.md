# Example 07 — MCP Reference

## What this example is for

The full MCP branch.

This is not an onboarding example. Open it when you already understand the protected app model and
you want the complete Trellis MCP surface in one place.

## What it teaches

- public vs scoped tools
- MCP key auth
- destructive preview + confirmation
- prompts and resources
- sessions and dynamic per-session tools
- a separate code-mode endpoint

The business domain stays intentionally small so the MCP layer is the thing you are really reading.

## What this example assumes

You already understand the canonical protected workspace model from
[`03-team-workspace`](../03-team-workspace/README.md).

## Files to read first

1. `convex/domain/runbooks.ts`
2. `convex/domain/mcpKeys.ts`
3. `server/middleware/mcp-auth.ts`
4. `server/mcp/tools/public/*`
5. `server/mcp/tools/workspace/*`
6. `server/mcp/tools/session/*`
7. `server/mcp/resources/mcp-reference-guide.ts`
8. `server/mcp/prompts/plan-runbook-workflow.ts`

## Demo flow

1. Sign up and create a workspace.
2. Issue an MCP key from the UI.
3. Call the default MCP endpoint and confirm scoped tools appear.
4. Call the code-mode endpoint and compare the smaller surface.
5. Use the session tools to store a focus and register a temporary shortcut.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret
- `CONVEX_TRUSTED_CALLER_KEY`: trusted server-to-Convex lane
- `TRELLIS_MCP_CONFIRMATION_KEY`: destructive MCP confirmation signing

## Test

- `pnpm test`
- `pnpm typecheck`

## When to stop here / move on

Stop here if the next thing you need to ship is MCP.

Move to [`08-component-mini-cms`](../08-component-mini-cms/README.md) when MCP is not enough and
you also need a component / host bridge architecture.
