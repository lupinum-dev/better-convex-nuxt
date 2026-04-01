# Team Todo Example

This is the smallest example that proves the framework is safe for real team software.

It shows:

- real auth
- actor resolution
- tenant-scoped tables on the canonical `workspaceId` / `by_workspace` contract
- app-owned checks in `convex/auth/*`
- backend-owned permission context exposed to Nuxt through configured `usePermissions()`
- MCP tools built with `#convex/mcp`
- first-class tests with `better-convex-nuxt/testing`

## Files To Read First

1. `convex/auth/actor.ts`
2. `convex/auth/checks.ts`
3. `shared/schemas/todo.ts`
4. `convex/todos.ts`
5. `composables/usePermissions.ts`
6. `server/mcp/tools/*.ts`
7. `convex/todos.test.ts`
8. `vitest.config.ts`

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
- `#convex/mcp` then injects trusted caller auth into the scoped Convex calls

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
import { convexTestConfig } from 'better-convex-nuxt/testing'

export default defineConfig(
  convexTestConfig({
    test: {
      include: ['convex/**/*.test.ts'],
    },
  }),
)
```

```ts
import { createTestContext } from 'better-convex-nuxt/testing'
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

`convex/test.setup.ts` is intentionally app-owned. It uses `createConvexTestModules(...)` and
`convexServerMock` from `better-convex-nuxt/testing`, but the Vite glob and generated-server mock
still live in the example app.

`composables/usePermissions.ts` is intentionally tiny. It exists so Nuxt can auto-import
`usePermissions()` everywhere else in the app while the raw permission `ctx` query stays in Convex-land.

`shared/` is also intentional. Both Convex code and Nitro/MCP code import the same args definitions,
so the folder marks a runtime boundary rather than a Nuxt convention.
