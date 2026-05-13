# Example 04 — Server Integration Workspace

## What this example is for

The last step in the beginner ladder.

This example keeps the protected workspace model from Example 03, then shows how server-side
surfaces fit into that model: Nitro routes, uploads, and one realistic external integration
boundary.

## What it teaches

- Nitro routes calling Convex
- route verification at the server boundary
- internal mutations behind a verified webhook route
- uploads and attachment authorization
- nested resource guards in a still-familiar workspace app

Canonical v1 server-to-server identity in Trellis is identity forwarding plus optional actingFor. This example keeps one narrow verified-route-to-internal-mutation boundary so the board and upload flows stay readable; see `examples/07-mcp-reference` for the full identity-forwarding + actingFor shape.

It is no longer the “big month-two SaaS showcase.” Its job is to show how protected server surfaces
fit into the canonical workspace model.

## What this example assumes

You already understand the canonical protected app from
[`03-team-workspace`](../03-team-workspace/README.md).

## Files to read first

1. `convex/features/index.ts`
2. `convex/features/tasks/domain.ts`
3. `app/features/project-board/components/ProjectBoardPage.vue`
4. `server/api/webhook.post.ts`
5. `server/api/export.get.ts`
6. `convex/projectBoard.test.ts`

## Demo flow

1. Sign up and create a workspace.
2. Create a project and open its board.
3. Add a task and open its detail view.
4. Upload an attachment on a comment.
5. Trigger the webhook route or inspect the webhook test to see the verified-route-to-internal-mutation path.

## Run

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

App-owned env vars:

- `SITE_URL`: Better Auth callback origin
- `BETTER_AUTH_SECRET`: Better Auth signing secret
- `PROJECT_BOARD_WEBHOOK_SECRET`: webhook route signature secret

## Production notes

- The webhook route here is intentionally narrower than the full Trellis identity-forwarding model.
  It verifies one route-owned secret and hands work to an internal mutation instead of forwarding a
  service caller through the whole protected app.
- That keeps the server-integration example readable, but it is not the full production identity
  story for complex integrations. Use [`07-mcp-reference`](../07-mcp-reference/README.md) when you
  need explicit service principals plus delegated users on the protected root refs themselves.
- If you keep this narrower route-owned pattern in production, add the normal transport hardening
  around it: timestamped HMAC signatures, replay windows, secret rotation, and provider-specific
  event idempotency if the sender retries independently of your Convex writes.

## Test

- `pnpm test`
- `pnpm test:e2e`
- `pnpm typecheck`
- `pnpm typecheck:tests`

## When to stop here / move on

Stop here if your next problem is “how do server routes, uploads, and integrations fit into my
workspace app?”

Move to an advanced branch when the problem changes:

- [`05-visibility-access`](../05-visibility-access/README.md) for advanced authorization
- [`06-multi-workspace`](../06-multi-workspace/README.md) for memberships-based multi-workspace
- [`07-mcp-reference`](../07-mcp-reference/README.md) for the full MCP surface
