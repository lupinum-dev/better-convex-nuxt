# MCP Reference Example

This is the full MCP reference app.

It is intentionally compact on the business side and broad on the MCP side.

## What It Shows

- public MCP tools with no auth
- auth-required + tenant-scoped MCP tools
- destructive preview + confirmation flow
- tool middleware
- rate limiting and bulk-operation limits
- structured result envelopes and output schemas
- prompts and resources
- session state with `useMcpSession()`
- dynamic per-session tool registration with `useMcpServer()`
- a separate code-mode endpoint
- real MCP bearer keys stored as hashes at rest
- transport-shaped `mcp` principals forwarded into the same protected Convex handlers as the UI

## Business Domain

The app is a workspace runbook library:

- public runbooks are visible to unauthenticated MCP callers
- workspace runbooks require browser auth in the app or an MCP bearer key
- owners/admins can issue MCP keys for their workspace

That gives the example one small domain while still covering every major MCP path.

## Files To Read First

1. `convex/schema.ts`
2. `convex/runbooks.ts`
3. `convex/mcpKeys.ts`
4. `server/middleware/mcp-auth.ts`
5. `server/mcp/tools/public/*`
6. `server/mcp/tools/workspace/*`
7. `server/mcp/tools/session/*`
8. `server/mcp/resources/mcp-reference-guide.ts`
9. `server/mcp/prompts/plan-runbook-workflow.ts`
10. `server/mcp/code-mode-demo.ts`
11. `pages/index.vue`

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

`pnpm dev` starts a local Convex deployment, writes local env values, runs codegen, and then starts Nuxt.

## Demo Flow

1. Sign up and create a workspace.
2. Notice the workspace is seeded with one public and one internal runbook.
3. Issue an MCP key from the UI and copy it once.
4. Call the default MCP endpoint with that key and confirm scoped tools appear.
5. Call the code-mode endpoint and compare the smaller tool set.
6. Use the session tools to store a focus and register a temporary shortcut.

## MCP Curl Snippets

Public discovery:

```bash
curl http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

Authenticated discovery:

```bash
curl http://localhost:3000/mcp \
  -H 'Authorization: Bearer mcp_your_token_here' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

Read the guide resource:

```bash
curl http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"2","method":"resources/read","params":{"uri":"app://mcp-reference/guide"}}'
```

Use the code-mode endpoint:

```bash
curl http://localhost:3000/mcp/runbook-agent \
  -H 'Authorization: Bearer mcp_your_token_here' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'
```

## Security Notes

- MCP keys are stored as SHA-256 hashes in Convex, not plaintext.
- The full bearer token is only shown once in the UI after creation.
- MCP key validation happens in Nitro middleware and maps into `event.context.mcpAuth`.
- MCP middleware only resolves MCP transport identity; workspace role and tenant access still come from Convex actor resolution.
- Scoped MCP tools still call the same Convex handlers as the UI.
- `lastUsedAt` updates are debounced to once per minute per key to avoid unnecessary write contention.

## Why This Example Exists

Example `03-team-workspace` is the minimum viable MCP story.

Example `07-mcp-reference` is where you go when you want the full public MCP protocol surface in one place.
