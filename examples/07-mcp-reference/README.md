# Example 07 — MCP Reference

## What this example is for

The full MCP branch.

This is not an onboarding example. Open it when you already understand the protected app model and
you want the complete Trellis MCP surface in one place.

The runbook domain is intentionally small. If you find yourself reading business logic instead of
transport, session, confirmation, key-auth behavior, and identity-forwarding flows, you are looking
at the wrong thing.

## What it teaches

- public vs scoped tools
- browser user, MCP agent, and verified webhook traffic converging on the same protected runbook
  layer
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

1. `convex/features/runbooks/domain.ts`
2. `convex/features/mcpKeys/domain.ts`
3. `convex/auth/caller.ts`
4. `convex/auth/actingFor.ts`
5. `convex/auth/appIdentity.ts`
   This is where the three caller shapes converge into one permission model: direct browser user,
   MCP agent acting for a user, and verified webhook/service traffic acting for a user.
6. `convex/auth/services.ts`
7. `server/middleware/mcp-auth.ts`
8. `server/api/runbook-webhook.post.ts`
9. `server/mcp/tools/runbooks/*`
10. `server/mcp/tools/session/*`
11. `server/mcp/resources/runbooks/reference-guide.ts`
12. `server/mcp/prompts/runbooks/plan-workflow.ts`

## Demo flow

1. Sign up and create a workspace.
2. In the `users` table, note the workspace owner's `authKey`.
3. Set `MCP_REFERENCE_WEBHOOK_SECRET` and `MCP_REFERENCE_WEBHOOK_USER_ID` locally.
4. Issue an MCP key from the UI.
5. Call the default MCP endpoint and confirm scoped tools appear.
6. POST to `/api/runbook-webhook` with `x-example-signature` and watch the same protected
   `domain.runbooks.create` mutation accept a service caller plus delegated user.
7. Call the code-mode endpoint and compare the smaller surface.
8. Use the session tools to store a focus and register a temporary shortcut.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret
- `CONVEX_IDENTITY_FORWARDING_KEY`: identity-forwarded server-to-Convex lane
- `MCP_RATE_LIMIT_REDIS_URL`: Redis connection string for distributed MCP rate limiting
- `MCP_REFERENCE_WEBHOOK_SECRET`: route secret for the verified webhook example
- `MCP_REFERENCE_WEBHOOK_USER_ID`: local `users._id` the verified webhook delegates to

Rate-limited MCP tools in this example use Trellis's Redis-backed store. For local development, run a
Redis instance such as `docker run --rm -p 6379:6379 redis:7-alpine` and keep
`MCP_RATE_LIMIT_REDIS_URL` pointed at it.

## Production notes

- This is the full Trellis server-owned identity example: the MCP key or webhook service is the real
  caller, and actingFor is how that caller is allowed to act for one bound workspace user.
- Rate-limited MCP tools are wired to a distributed Redis-backed store here on purpose. Treat that as
  part of the deployment contract, not as optional demo polish.
- The public runbook catalog is also intentional and bounded. Those handlers escape isolation
  only for records whose visibility is already `public`, and the search path caps the candidate set
  instead of pretending public access means unbounded scans are acceptable.
- The verified webhook route still keeps the transport boundary intentionally simple so the caller
  and actingFor flow stay readable. For production integrations, add timestamped HMAC verification,
  replay windows, and provider event ids on top of the identity-forwarding lane shown here.

## Test

- `pnpm test`
- `pnpm typecheck`

## When to stop here / move on

Stop here if the next thing you need to ship is MCP.

Stop here if you want one app that shows the three caller shapes together:

- browser user signing in directly
- MCP `agent:*` traffic delegated to `user:*`
- webhook `service:*` traffic delegated to `user:*`

Move to [`08-component-mini-cms`](../08-component-mini-cms/README.md) when MCP is not enough and
you also need a component / host bridge architecture.
