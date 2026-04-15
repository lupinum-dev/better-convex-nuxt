# Team Workspace Example

This is the reference starting point for most real apps. It proves the framework is safe for real
team software — with roles, permissions, MCP tools, webhook idempotency, and trusted caller
verification.

It shows:

- real auth
- actor resolution
- tenant-scoped tables on the canonical `workspaceId` / `by_workspace` contract
- app-owned checks in `convex/auth/*`
- backend-owned permission context exposed to Nuxt through configured `usePermissions()`
- MCP tools built with `#trellis/mcp`
- webhook idempotency with `ensureNotProcessed` / `markProcessed`
- trusted caller verification with `resolveWebhookActor` / `verifyTrustedCallerKey`
- bot user resolution for external callers
- first-class tests with `@lupinum/trellis/testing`

## Files To Read First

1. `convex/auth/actor.ts`
2. `convex/auth/checks.ts`
3. `convex/auth/idempotency.ts`
4. `convex/auth/trustedCaller.ts`
5. `shared/schemas/todo.ts`
6. `convex/todos.ts`
7. `convex/webhooks.ts`
8. `pages/index.vue`
9. `server/mcp/tools/*.ts`
10. `server/api/webhook.post.ts`
11. `convex/todos.test.ts`
12. `vitest.config.ts`

## Demo Flow

1. Create account A and create workspace `alpha` -> that user becomes `owner`.
2. Create account B and join workspace `alpha` as `member`.
3. Create account C and create workspace `beta`.
4. Add todos in both workspaces and verify lists stay isolated.
5. Confirm the owner can manage all Alpha todos while the member is limited by ownership rules.
6. Use the MCP curl commands below to manage Alpha's todos as account A.

## Run It

1. Copy `.env.example` to `.env.local`
2. `pnpm install`
3. `pnpm dev`

The launcher starts a local Convex deployment, waits for `_generated`, and then starts Nuxt. Keep
`CONVEX_TRUSTED_CALLER_KEY`, `SITE_URL`, and `BETTER_AUTH_SECRET` in `.env.local`; local Convex URLs are injected.

## MCP Demo Auth

To keep the example focused, MCP auth uses a tiny demo middleware:

- header format: `Authorization: Bearer demo:<email>`
- middleware resolves that email to a real user in Convex
- `#trellis/mcp` then injects trusted caller auth into the scoped Convex calls

Example:

```bash
curl http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer demo:owner@example.com' \
  -d '{"method":"tools/list","params":{}}'
```

## Testing

This example is the trust proof, so it includes a small real test setup.

```ts
import { defineConfig } from 'vitest/config'
import { convexTestConfig } from '@lupinum/trellis/testing'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['convex/**/*.test.ts'],
    },
  }),
)
```

```ts
import { createTestContext } from '@lupinum/trellis/testing'
import { modules } from './test.setup'

const ctx = createTestContext({ schema, modules })
```

That zero-config test setup is the canonical path for the repo's default single-workspace schema:
`users.authId`, `users.role`, `users.workspaceId`, and `by_workspace`.

The example test file covers:

- member can update own todo
- member cannot update another member's todo
- tenants cannot see each other's todos
- trusted callers obey the same permission rules as browser and MCP callers
- invalid trusted caller key is denied
- duplicate webhook events are rejected (idempotency)
- source + event ID form the replay key
- webhook-created todos are visible in the workspace list

`convex/test.setup.ts` is intentionally app-owned. It keeps the Vite module glob in the example
app while `convexTestConfig(...)` now wires the generated-server bridge automatically.

This example uses the module-provided `usePermissions()` composable directly in the page. There is
no app-local wrapper because the point here is the default integration path.

`shared/` is also intentional. Both Convex code and Nitro/MCP code import the same args definitions,
so the folder marks a runtime boundary rather than a Nuxt convention.
