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
2. `convex/auth/permissions.ts`
3. `convex/auth/checks.ts`
4. `convex/permissions/context.ts`
5. `convex/auth/idempotency.ts`
6. `convex/auth/trustedCaller.ts`
7. `shared/schemas/todo.ts`
8. `convex/domain/todos.ts`
9. `convex/operations/todos.ts`
10. `convex/domain/webhooks.ts`
11. `pages/index.vue`
12. `server/mcp/tools/*.ts`
13. `server/api/webhook.post.ts`
14. `convex/todos.test.ts`
15. `vitest.config.ts`

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
`CONVEX_TRUSTED_CALLER_KEY`, `TRELLIS_MCP_CONFIRMATION_KEY`, `SITE_URL`, and `BETTER_AUTH_SECRET`
in `.env.local`; local Convex URLs are injected.

## MCP Demo Auth

To keep the example focused, MCP auth uses a tiny demo middleware:

- header format: `Authorization: Bearer demo:<email>`
- middleware resolves that email to a real app user in Convex
- the MCP runtime forwards a transport-shaped `mcp` principal into the same protected handlers
- role and tenant access still come from the actor lookup inside Convex, not from the middleware

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

const ctx = createTestContext<typeof schema, 'owner' | 'admin' | 'member' | 'viewer'>({
  schema,
  modules,
  trustedCallerKey: 'test-only-shared-secret',
})

const team = await ctx.seedTenant({
  name: 'Alpha',
  users: {
    owner: { role: 'owner' },
    member: { role: 'member' },
  },
})

const trustedCaller = ctx.asPrincipal({
  kind: 'user',
  userId: team.users.member.authId,
})
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
