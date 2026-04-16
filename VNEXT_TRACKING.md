# Trellis vNext Tracking

> Status as of 2026-04-16.
>
> Short answer: the hard cut is done for the runtime surface.
> Trellis is now on the vNext contract defined in [VNEXT_RUNTIME_CONTRACT.md](/Users/matthias/Git/0_libs/WORK/trellis/VNEXT_RUNTIME_CONTRACT.md).
>
> What remains is the next feature wave, not more migration cleanup.

## 1. Runtime Contract

- [x] A canonical vNext runtime contract exists at [VNEXT_RUNTIME_CONTRACT.md](/Users/matthias/Git/0_libs/WORK/trellis/VNEXT_RUNTIME_CONTRACT.md).
- [x] The active contract is grounded in shipped code, not speculative APIs.
- [x] The contract explicitly states what is supported now.
- [x] The contract explicitly states what was cut.
- [x] The contract explicitly states what is deferred.

## 2. Backend Runtime Cutover

### 2.1 Public entrypoint

- [x] `defineTrellis(...)` is the canonical backend runtime factory.
- [x] `createApp(...)` is removed from the public runtime surface.
- [x] `createFunctions(...)` is removed from the public runtime surface.
- [x] Public tests assert that `createApp` is not exported.
- [x] Public tests assert that `defineTrellis(...)` is exported.

### 2.2 Builder surface

- [x] `defineTrellis(...)` exposes direct top-level `query`.
- [x] `defineTrellis(...)` exposes direct top-level `mutation`.
- [x] `defineTrellis(...)` exposes `action` when provided.
- [x] `defineTrellis(...)` exposes `internalQuery` when both internal builders are provided.
- [x] `defineTrellis(...)` exposes `internalMutation` when both internal builders are provided.
- [x] `defineTrellis(...)` exposes `raw.query`.
- [x] `defineTrellis(...)` exposes `raw.mutation`.
- [x] `defineTrellis(...)` exposes `raw.action` when provided.
- [x] `defineTrellis(...)` exposes `raw.internalQuery` when provided.
- [x] `defineTrellis(...)` exposes `raw.internalMutation` when provided.
- [x] `defineTrellis(...)` still exposes `createComponentBridge`.
- [x] The runtime no longer exposes a nested `app` API.
- [x] The runtime no longer exposes `publicQuery`.
- [x] The runtime no longer exposes `publicMutation`.

### 2.3 Public access semantics

- [x] Public handlers now use the same builder family as protected handlers.
- [x] `guard: open` is the active public-access mechanism.
- [x] The repo no longer treats `publicQuery` / `publicMutation` as part of vNext.

## 3. Runtime Context

- [x] `ctx.principal()` is part of the shipped runtime.
- [x] `ctx.actor()` is part of the shipped runtime.
- [x] Query and mutation handlers receive `ctx.db`.
- [x] Query and mutation handlers receive `ctx.db.crossTenant`.
- [x] Query and mutation handlers receive `ctx.db.raw`.
- [x] `ctx.db.crossTenant` bypasses tenant isolation while preserving runtime service enforcement and triggers.
- [x] `ctx.db.raw` bypasses tenant isolation, service enforcement, and triggers.
- [x] The repo now documents `crossTenant` and `raw` as distinct trust levels.
- [x] `ctx.runAsUser(...)` is not part of the active vNext contract.
- [x] `ctx.runAsService(...)` is not part of the active vNext contract.

## 4. Operations

- [x] `defineOperation(...)` is part of the shipped runtime.
- [x] `previewOf(...)` is part of the shipped runtime.
- [x] Operations can carry `id`.
- [x] Operations can carry `name`.
- [x] Operations can carry `kind`.
- [x] Operation metadata is attached at definition time.
- [x] `kind: 'destructive'` is used by the MCP projection layer.
- [x] Destructive operations require `id`.
- [x] Destructive operation previews use `{ display, confirm }`.

## 5. MCP / Agent Runtime Cutover

### 5.1 Naming and public surface

- [x] `defineMcpApp(...)` is the canonical MCP runtime factory.
- [x] `defineMcpRuntime(...)` is deleted.
- [x] `tool(...)` is the canonical Convex-backed MCP tool factory.
- [x] `projectTool(...)` is deleted.
- [x] `tool.fromOperation(...)` exists.
- [x] The MCP package exports the new vNext names.

### 5.2 Operation-backed safety

- [x] `tool.fromOperation(...)` requires an operation `id`.
- [x] `tool.fromOperation(...)` requires a preview ref for destructive operations.
- [x] `tool.fromOperation(...)` validates stamped execute projection metadata.
- [x] `tool.fromOperation(...)` validates stamped preview projection metadata.
- [x] The deleted manifest path is no longer part of the active implementation.
- [x] The active binding strategy is id-based projection validation.
- [x] Type-level MCP coverage includes `tool.fromOperation(...)`.
- [x] Destructive execution now requires `_confirmationToken`, not `_confirmed`.
- [x] Confirmation tokens bind operation id, ref paths, principal key, tenant key, args hash, preview hash, and `jti`.
- [x] Nitro now acts as preview/router only for destructive MCP tools.
- [x] Convex-side destructive execution revalidates the confirmation token atomically.
- [x] Successful destructive execution writes durable redemption and audit rows.

## 6. Example Migration

### 6.1 `examples-next/01-kanban-workspace`

- [x] The first `examples-next` app uses `defineTrellis(...)`.
- [x] The app exports direct `query`, `mutation`, and `raw`.
- [x] The app uses `guard: open` for public-access handlers.
- [x] The app uses `defineOperation(...)` for destructive work.
- [x] The app gives destructive operations a stable `id`.
- [x] The app gives the destructive operation a stable `name`.
- [x] The app marks the destructive operation as `kind: 'destructive'`.
- [x] The app uses `{ display, confirm }` previews for destructive flows.
- [x] The app exposes a preview with `previewOf(...)`.
- [x] The app includes a real MCP layer.
- [x] The MCP layer uses `defineMcpApp(...)`.
- [x] The MCP layer uses `tool.fromOperation(...)`.
- [x] The app proves a real agent-facing destructive flow.
- [x] The app boots successfully.

### 6.2 Existing examples

- [x] Existing examples use `defineTrellis(...)`.
- [x] Existing MCP examples use `defineMcpApp(...)`.
- [x] Existing MCP examples use `tool(...)`.
- [x] Shipped destructive MCP examples now use `tool.fromOperation(...)`.
- [x] Principal/actor context types were widened to include action contexts where needed.
- [x] Raw-vs-protected escape hatches were made explicit where examples truly needed them.

## 7. CLI / Tooling

- [x] CLI init templates now generate `defineTrellis(...)`.
- [x] CLI init templates now generate `defineMcpApp(...)`.
- [x] Runtime export tests are updated for `defineTrellis(...)`.
- [x] Runtime export tests are updated for the removed legacy names.
- [x] `functions-defineTrellis` coverage exists.
- [x] Action exposure is covered in `functions-defineTrellis` tests.

## 8. Docs and Repo Messaging

### 8.1 Hard-cut cleanup

- [x] `CONTRIBUTING.md` no longer teaches `createApp`.
- [x] `main.html` no longer teaches `createApp`.
- [x] Shared-schema docs no longer import `app` from `./functions`.
- [x] Permissions setup docs no longer import `app` from `./functions`.
- [x] The migration doc was renamed to `migration-to-define-trellis`.

### 8.2 Spec honesty

- [x] A legacy warning was added to [SPEC.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC.md).
- [x] The repo now has an explicit active vNext contract file.
- [x] Tracking no longer treats legacy or deleted APIs as the target state.

## 9. Verification

- [x] Core runtime unit tests passed after the cutover.
- [x] The first `examples-next` app typechecked in `convex/`.
- [x] The first `examples-next` app typechecked in Nuxt app code.
- [x] The first `examples-next` app booted and returned `HTTP 200`.
- [x] `pnpm test:types` passed after the cutover cleanup.
- [x] `pnpm lint` passed on the active vNext surface.
- [x] `pnpm test` passed across repo tests and shipped examples.
- [x] Cross-tenant examples now use `ctx.db.crossTenant` explicitly where the active contract requires it.

## 10. Deferred Work

- [x] `runAsUser` is deferred.
- [x] `runAsService` is deferred.
- [x] service-scope enforcement is shipped.
- [x] `defineWebhook(...)` is deferred from the active vNext contract.
- [x] `defineComponentApp(...)` is deferred from the active vNext contract.
- [x] replay and audit guarantees are now documented and implemented for operation-backed destructive MCP flows.

## 11. Alignment Cleanup

- [x] Finish the docs sweep for conceptual accuracy on the active runtime/docs surface.
- [x] [SPEC.vNext.md](/Users/matthias/Git/0_libs/WORK/trellis/SPEC.vNext.md) now reflects the active runtime contract instead of the older aspirational one.
- [x] The duplicate `06-*` numbering in `examples-next/` is resolved.
- [x] MCP runtime test coverage now includes a unit-testable operation-binding module instead of only type-level checks and harness behavior.
- [x] The internal harness is explicitly classified as experimental integration infrastructure, not the live vNext contract surface.
- [x] The repo lint target now covers the active runtime/examples/tests surface instead of dragging the docs app's unrelated stylistic debt into the vNext migration signal.
- [x] The deleted operations-manifest experiment is no longer carried in the active unit test suite.

## 12. Next Feature Wave

- [ ] Decide whether direct exported refs should remain the long-term operation-binding seam.
- [ ] Add guardrails so contract, tracker, docs, and examples stay aligned as new work lands.
- [ ] Repair the internal harness MCP discovery/auth e2e path so targeted `test/e2e/mcp-smoke.e2e.test.ts` is green again.
- [ ] Define the Trellis observability contract as semantic events, separate from debug/runtime logging.
- [ ] Keep `logging` as debug/runtime logging only until first-class observability is implemented.
- [ ] Phase observability implementation backend-first: identity, authorization, trust-boundary, operation, and MCP/tool events before browser/runtime chatter.

## 13. Honest Status

- [x] Trellis is fully migrated to the vNext runtime surface.
- [x] Trellis is fully migrated to the vNext MCP naming and public API.
- [x] The first `examples-next` app is a working vNext example.
- [x] Future ambitions from the old aspirational spec remain future work, not hidden active-contract promises.
- [x] That gap is now treated as future work, not as a hidden contradiction inside the active contract.
