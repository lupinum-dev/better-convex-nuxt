# Backend, Auth, Permissions

Use this for Convex backend code: `defineTrellis`, protected handlers, shared
args schemas, guards, actors, permission context, operations, tenant isolation,
services, and trusted-forwarding validators.

## Source Files

- Backend barrel: `src/runtime/functions/index.ts`.
- Auth barrel: `src/runtime/auth/index.ts`.
- Args barrel: `src/runtime/args/index.ts`.
- Trusted forwarding: `src/runtime/trusted-forwarding/index.ts`,
  `src/runtime/trusted-forwarding/shared.ts`.
- Visibility: `src/runtime/visibility/index.ts`.
- Feature manifests: `src/runtime/feature/index.ts`.
- Component bridge helpers: `packages/trellis-bridge/src/component.ts`,
  `packages/trellis-bridge/src/manifest.ts`.
- Observability: `src/runtime/observability/index.ts`,
  `apps/docs/content/docs/09.observability/**`.
- Docs:
  `apps/docs/content/docs/08.permissions/**`,
  `apps/docs/content/docs/13.api-reference/3.functions.md`,
  `apps/docs/content/docs/13.api-reference/8.type-primitives.md`,
  `apps/docs/content/docs/07.server-side/5.component-bridge.md`.
- Architecture: `meta/ARCHITECTURE.md`, `meta/ABSTRACTIONS.md`,
  `meta/SECURITY.md`, `meta/adr/0004-protected-handler-pipeline.md`,
  `meta/adr/0005-backend-owned-permissions-and-tenant-isolation.md`,
  `meta/adr/0006-trusted-forwarding-for-server-identity.md`.

## Protected Backend Runtime

`defineTrellis(builders, options?)` is the canonical backend seam. It returns
protected builders and keeps unsafe builders behind an explicit escape hatch.

Important options include:

- `principal`: resolve transport identity.
- `delegation`: resolve represented identity when applicable.
- `actor`: map principal/delegation to the app actor.
- `tenantIsolation`: tenant-scoped tables and global tables.
- `services`: explicit high-trust service callers.
- `observability`: semantic event emission.
- `destructiveSafety`: required before destructive operations.
- `triggers`: Convex triggers installed on the Trellis runtime path.
- `onSuccess`: post-success hooks.

Handler context adds:

- `await ctx.principal()`
- `await ctx.delegation()`
- `await ctx.actor()`
- `ctx.observe(...)`
- tenant-scoped `ctx.db`
- `ctx.db.escapeTenantIsolation({ reason })`

Use `unsafe.query`, `unsafe.mutation`, and `unsafe.action` only for deliberate
escape hatches with a justification. Do not normalize unsafe access into app
patterns.

## Handler Shape

Keep authorization reviewable in the handler:

```ts
export const setCompleted = mutation({
  args: setTodoCompleted.args,
  guard: todoRead,
  load: async (ctx, args) => {
    const todo = await ctx.db.get(args.id)
    requireRecord(todo, 'Todo')
    return { todo }
  },
  authorize: {
    check: (_actor, { todo }) => canUpdateTodo(todo),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { completed: args.completed })
  },
})
```

- `guard`: cheap, coarse entry gate.
- `load`: fetch records needed for the decision.
- `authorize`: record-specific business decision.
- `handler`: perform the work.

If the rule needs loaded data or `ctx.db`, it belongs in `load` plus
`authorize`, not in a giant guard.

## Shared Args

Use `defineArgs()` from `@lupinum/trellis/args` for shared schemas across
Convex handlers, Nitro validation, and MCP tools.

Shared args are schema-only. Do not hide trusted-forwarding transport fields in
`defineArgs()` definitions. Add transport validators with
`withTrustedForwarding(schema.args)` only at Convex boundaries that truly accept
trusted server-to-server identity.

## Auth And Permissions

Important auth exports include:

- `defineBetterAuth`
- `defineGuard`, `authRequired`, `open`
- `defineActor`
- `definePermission`
- `definePermissionContext`
- `defineServices`
- `can`, `deny`, `and`, `or`
- `enforce`
- `requireAuth`
- `requireRecord`
- `getAuth`
- `ensureTenant`
- `loadTenantResource`
- subject helpers such as `subject(...)`

The app owns actor and permission semantics. Trellis provides the runtime shape.

Permission context is a backend-owned projection for stable UI decisions:

```ts
export const getPermissionContext = query(
  definePermissionContext({
    resolve: getActor,
    permissions: teamWorkspacePermissions,
  }),
)
```

Then point Nuxt at it:

```ts
export default defineNuxtConfig({
  trellis: {
    permissions: {
      query: 'permissions/context.getPermissionContext',
    },
  },
})
```

Use `usePermissions().allows(...)` only as a browser projection of backend
decisions. Use backend `can(actor, check)` inside Convex code.

## Tenant Isolation

Trellis tenant isolation is a runtime guardrail around `ctx.db`; it is not the
business authorization model. Business policy still lives in `guard`, `load`,
`authorize`, and `handler`.

Use `ctx.db.escapeTenantIsolation({ reason })` for explicit cross-tenant reads.
The reason should explain the product case. Do not add convenience wrappers that
make cross-tenant access feel routine.

## Operations

Use `defineOperation(...)` for reusable business actions that project across UI,
server, and MCP, especially destructive preview/confirm/execute flows.

For destructive operations, require all of:

- `kind: 'destructive'`
- stable `id`
- `preview(...)`
- `destructiveSafety` configured in `defineTrellis(...)`

Do not model destructive MCP tools as plain generic tools. Project operations
through the operation-backed MCP path.

Projection helpers include:

- `executeOperationRef(operation)`
- `previewOperationRef(operation)`
- `projectOperationRef(operation, projection)`
- `previewOf(operation)`

MCP operation bindings must use real execute/preview projections of the same
operation. Tests reject mismatched refs.

## Features And Visibility

Use `defineFeature(...)` and `composeFeatures(...)` when a feature needs a
declared schema, permissions, tenant/global tables, capabilities, and operations
as app inventory. Keep feature manifests as composition metadata; do not use them
to hide handler behavior.

Use `defineCapabilities(...)` to attach `_can` flags to returned data. Use
`defineRedaction(...)` to remove fields without mutating the input. Prefer these
backend-owned visibility helpers over browser-side recalculation.

## Trusted Forwarding

Use `withTrustedForwarding(args)` to add transport validators to Convex args
that accept trusted server-to-server identity.

Use trusted-forwarding readers only after verification:

- `getTrustedForwarding(ctxOrArgs)`
- `getForwardedPrincipal(ctx, args?)`
- `getForwardedDelegation(ctx, args?)`

Forwarded principals and delegations are verified signed-envelope metadata, not
public request arguments. A valid envelope verifies the transport path; it does
not grant business authorization by itself.

## Pitfalls

- Do not build DB-policy substitutes for app authorization.
- Do not duplicate backend permission checks in the browser.
- Do not treat webhooks, MCP sessions, or service keys as authorization bypasses.
- Do not preserve old actor-wrapper APIs or compatibility shims when the current
  foundation uses principal/delegation/actor accessors.
- Do not describe custom public `rls` authoring as current Trellis API. Current
  public policy is handler phases plus `tenantIsolation`/`services` runtime
  guardrails.
