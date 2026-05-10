# Server And MCP

Use this for Nitro routes, webhooks, server-to-server Convex calls, MCP runtime
setup, MCP tools, sessions, result envelopes, and destructive operation
projection.

## Source Files

- Server barrel: `src/runtime/server/index.ts`.
- Server Convex helpers: `src/runtime/convex/server/convex.ts`.
- Server validation: `src/runtime/convex/server/validate.ts`.
- Server auth cache: `src/runtime/auth/server/auth-cache.ts`.
- Webhooks: `src/runtime/server/webhooks.ts`.
- MCP barrel: `src/runtime/mcp/index.ts`.
- MCP app/tool implementation:
  `src/runtime/mcp/define-mcp-app.ts`,
  `src/runtime/mcp/define-convex-tool.ts`,
  `src/runtime/mcp/result-envelope.ts`,
  `src/runtime/mcp/rate-limiter.ts`,
  `src/runtime/mcp/use-mcp-server.ts`,
  `src/runtime/mcp/use-mcp-session.ts`.
- Docs:
  `apps/docs/content/docs/07.server-side/**`,
  `apps/docs/content/docs/13.api-reference/4.server.md`,
  `apps/docs/content/docs/13.api-reference/5.mcp.md`,
  `apps/docs/content/docs/14.mcp-tools/**`.

## Nitro Server Helpers

Use these from Nuxt server routes, middleware, and Nitro handlers:

```ts
import { api } from '#trellis/api'

export default defineEventHandler(async (event) => {
  return await serverConvexQuery(event, api.tasks.list, { status: 'active' })
})
```

Available per-call helpers:

- `serverConvexQuery(event, fn, args?, options?)`
- `serverConvexMutation(event, fn, args?, options?)`
- `serverConvexAction(event, fn, args?, options?)`

`ServerConvexOptions.auth` supports:

- `auto`: use session cookie when available, otherwise unauthenticated.
- `required`: fail when auth cannot be resolved.
- `none`: never attach auth; public calls only.
- `trusted`: trusted-forwarding path with explicit identity.

Use `createServerConvexCaller(event, options?)` when a request needs several
Convex calls with the same event/options.

```ts
const convex = createServerConvexCaller(event, {
  auth: 'trusted',
  principal,
  delegation,
})

const result = await convex.query(api.dashboard.get, { id })
```

Forwarded `principal` or `delegation` requires `auth: 'trusted'`. The helper
throws when forwarded identity is supplied on any other auth mode.

## Server Boundaries

- Server helpers do not replace handler authorization. They only change the
  transport by which Nitro reaches Convex.
- `serverConvexClearAuthCache` and `validateConvexArgs` are Nuxt server
  auto-imports only.
- `@lupinum/trellis/server` exports `serverConvexQuery`,
  `serverConvexMutation`, `serverConvexAction`, `createServerConvexCaller`,
  `delegateToUser`, and webhook helpers.

## Webhooks And Trusted Traffic

Pattern:

1. Verify the external request at the Nitro edge.
2. Call Convex with `auth: 'trusted'`.
3. Forward an explicit server-owned `principal`.
4. Add `delegation` when the request represents a user.
5. Let the normal Convex guard/load/authorize/handler path decide.

Never treat "it is a webhook" or "it has the trusted key" as permission to do
anything. Trusted forwarding verifies identity injection. Business authorization
still belongs in the backend handler.

## MCP Runtime

Use `defineMcpApp(options)` for the Trellis-aware MCP runtime and operation
projection path. It binds tool invocation to your Convex caller, principal
resolution, optional delegation, capability resolution, rate limiting,
sessions, confirmation identity, and observability.

Use `defineTool(options)` for standalone custom tools where the handler body
lives in MCP code.

Prefer `defineMcpApp(...).tool(...)` or
`defineMcpApp(...).tool.operation(...)` when the tool should project a
protected Convex ref or operation. That keeps MCP behavior aligned with the
same backend authorization model used by browser and server calls.

## MCP Tool Options

Common standalone `defineTool` options:

- `schema`
- `handler`
- `operation`
- `auth`
- `scoped`
- `check`
- `maxItems`
- `rateLimit`
- `resolveAuth`
- `resolvePrincipal`
- `resolveDelegation`
- `rateLimitStore`
- `middleware`
- `enabled`

`scoped: true` requires an authenticated actor with a `tenantId` and is only
valid with required auth. It is not a substitute for Convex handler guards.

`enabled` controls visibility/availability. It is not backend authorization.

## Destructive MCP Tools

Do not implement destructive generic tools through `defineTool`. Use
`defineMcpApp(...).tool.operation(...)` so preview, confirmation, and
execute stay bound to one operation identity.

Trellis rejects destructive operation bindings without the required preview
projection. Keep preview and execute refs as real exported projections of the
same operation.

Use `executeOperationRef(...)` and `previewOperationRef(...)` from the functions
surface when projecting operation-backed tools. Do not hand-construct operation
references.

## Result And Session Helpers

MCP result helpers:

- `wrapSuccess(data, summary?)`
- `wrapError(category, message, issues?)`
- `wrapPreview(preview)`
- `withSummary(result, summary)`
- `withUntrustedText(...)`

Session/server helpers:

- `useMcpServer()`
- `useMcpSession()`
- `createRedisMcpRateLimitStore(...)`

Use result envelopes instead of returning ad hoc payloads when a tool needs
consistent success/error/preview shape.

## Pitfalls

- Do not bypass Convex authorization in Nitro just because the route already did
  auth checks.
- Do not use `auth: 'none'` to silence a protected handler failure.
- Do not duplicate business operations in MCP files. Project operations or root
  handlers whenever possible.
- Do not let MCP capability visibility drift from backend checks. Visibility
  improves discovery; handlers still enforce policy.
