# Trellis vNext Runtime Contract

> Status: active implementation contract as of 2026-04-16.
>
> This file is the canonical vNext runtime definition for the repo.
> When `SPEC.md`, `SPEC.vNext.md`, examples, or docs disagree with this file,
> this file wins.

## 1. Product Boundary

- [x] Trellis vNext is the protected application layer for Nuxt + Convex.
- [x] The backend runtime centers on one principal-first handler pipeline.
- [x] The agent runtime is first-class from day 1.
- [x] vNext is defined by the code we support now, not by speculative APIs we have not built.

## 2. Canonical Backend Entry Point

- [x] The only supported backend runtime factory is `defineTrellis(...)`.
- [x] `createApp(...)` is obsolete.
- [x] `createFunctions(...)` is obsolete.
- [x] The default Trellis backend file shape is:

```ts
import { defineTrellis } from '@lupinum/trellis/functions'
import {
  query as rawQuery,
  mutation as rawMutation,
  internalQuery as rawInternalQuery,
  internalMutation as rawInternalMutation,
  action as rawAction,
} from './_generated/server'

export const { query, mutation, action, internalQuery, internalMutation, raw } = defineTrellis(
  {
    query: rawQuery,
    mutation: rawMutation,
    action: rawAction,
    internalQuery: rawInternalQuery,
    internalMutation: rawInternalMutation,
  },
  {
    principal,
    actor,
    tenantIsolation,
    rls,
    triggers,
  },
)
```

- [x] Convex builder injection remains the one explicit Convex seam.
- [x] Trellis does not currently hide `./_generated/server`.
- [x] That seam is acceptable in vNext as long as the rest of the runtime is framework-owned and consistent.

## 3. Supported Builder Surface

- [x] `defineTrellis(...)` returns direct top-level builders.
- [x] `query` is supported.
- [x] `mutation` is supported.
- [x] `action` is supported when an action builder is provided.
- [x] `internalQuery` is supported when both internal builders are provided.
- [x] `internalMutation` is supported when both internal builders are provided.
- [x] `raw.query` is supported as an explicit escape hatch.
- [x] `raw.mutation` is supported as an explicit escape hatch.
- [x] `raw.action` is supported when an action builder is provided.
- [x] `raw.internalQuery` is supported when internal builders are provided.
- [x] `raw.internalMutation` is supported when internal builders are provided.
- [x] `createComponentBridge` remains exposed as an advanced runtime helper.
- [x] There is no public nested `app` runtime surface.
- [x] There is no `publicQuery`.
- [x] There is no `publicMutation`.

## 4. Public Access Model

- [x] Public-access handlers use the same `query(...)` / `mutation(...)` builders as protected handlers.
- [x] Public access is expressed through `guard: open`.
- [x] Trellis no longer has a second builder family for public actor-optional handlers.
- [x] The common rule is: one builder family, explicit guard semantics.

## 5. Handler Pipeline

- [x] Structured handlers still follow the same conceptual order:
- [x] `principal`
- [x] `actor`
- [x] `guard`
- [x] `load`
- [x] `authorize`
- [x] `handler`
- [x] This pipeline is shared across browser, server, and MCP-triggered execution.

## 6. `ctx` Contract

- [x] `ctx.principal()` is available.
- [x] `ctx.actor()` is available.
- [x] Query and mutation contexts expose `ctx.db`.
- [x] Query and mutation contexts expose `ctx.db.crossTenant`.
- [x] Query and mutation contexts expose `ctx.db.raw`.
- [x] `ctx.db.crossTenant` bypasses tenant isolation while preserving runtime service enforcement and triggers.
- [x] `ctx.db.raw` bypasses tenant isolation, service enforcement, and triggers.
- [x] `ctx.db.crossTenant` and `ctx.db.raw` are distinct trust levels in the shipped runtime.
- [x] `ctx.runAsUser(...)` is not part of the supported vNext runtime contract.
- [x] `ctx.runAsService(...)` is not part of the supported vNext runtime contract.
- [x] Service impersonation and forwarded execution remain future work, not shipped runtime guarantees.

## 7. Tenancy

- [x] Tenant scoping is supported through `tenantIsolation`.
- [x] Additional row-level rules are supported through `rls.rules`.
- [x] Trigger wrapping is supported through `triggers`.
- [x] Tenant scoping is runtime-owned, not repeated inline in every handler.
- [x] Cross-tenant access must be explicit through `ctx.db.crossTenant`.
- [x] Service principals can be runtime-constrained through `defineServices(...)`.
- [x] Service principals use the canonical shape `{ kind: 'service', serviceId: string }`.
- [x] `tenant: 'derived'`, `tenant: 'global'`, and `access: 'unrestricted'` are part of the active service contract.

## 8. Operations

- [x] `defineOperation(...)` is part of the active contract.
- [x] `previewOf(...)` is part of the active contract.
- [x] Operations can carry Trellis metadata: `id`, `name`, and `kind`.
- [x] `kind` supports `safe` and `destructive`.
- [x] Destructive operations require a stable `id`.
- [x] Destructive operation previews use `{ display, confirm }`.
- [x] The destructive flow uses a preview projection plus an execute projection.

## 9. Agent Runtime

- [x] The only supported Trellis MCP runtime factory is `defineMcpApp(...)`.
- [x] `defineMcpRuntime(...)` is obsolete.
- [x] The only supported Convex-backed tool factory is `tool(...)`.
- [x] `projectTool(...)` is obsolete.
- [x] `tool.fromOperation(...)` is part of the active contract.

## 10. `tool.fromOperation(...)` Binding Rules

- [x] Operations used with `tool.fromOperation(...)` must declare an `id`.
- [x] Destructive operations used with `tool.fromOperation(...)` must provide a preview ref.
- [x] Trellis stamps execute and preview projections with operation metadata.
- [x] `tool.fromOperation(...)` validates operation id plus projection type at startup.
- [x] Trellis derives a default schema from `operation.args` when the caller does not supply one.
- [x] The current binding contract is id-based metadata validation, not manifest-based.
- [x] The manifest path is deleted.
- [x] The operation binding story is considered shipped in this id-bound form.

## 11. Replay, Audit, and Safety Claims

- [x] Destructive preview wiring exists in the runtime and examples.
- [x] Destructive execution is bound to previewed state through a signed confirmation token.
- [x] Destructive execution revalidates confirmation inside the execute mutation, not only in Nitro.
- [x] Operation-backed destructive MCP execution writes durable `jti` redemption rows when `destructiveSafety` is configured.
- [x] Operation-backed destructive MCP execution writes durable audit rows for successful execution when `destructiveSafety` is configured.
- [x] Replay attempts fail before handler execution when the same `jti` was already redeemed.
- [x] Drifted destructive previews fail before redemption or handler execution.
- [x] Generic `tool({... destructive: true ...})` mode is not part of the shipped contract.
- [x] Capability gating exists in the runtime and examples.
- [x] Replay and audit are active runtime guarantees for operation-backed destructive MCP flows.

## 12. Deferred From vNext

- [x] `publicQuery` / `publicMutation` are cut.
- [x] `defineFunctions(...)` is cut.
- [x] `defineWebhook(...)` is not part of the active runtime contract.
- [x] `defineComponentApp(...)` is not part of the active runtime contract.
- [x] service-scoped runtime enforcement is shipped.
- [x] forwarded user/service execution helpers are deferred.
- [x] any manifest-based operation pipeline is deleted.
- [x] current `logging` means runtime/debug logging only.
- [x] first-class `observability` is shipped as semantic events, correlation, sampling, redaction, and adapter delivery.
- [x] the built-in shipped adapter is the dev sink.
- [x] audit remains separate from observability.
