# Sprint 20: Custom MCP Unsafe Permit Hard Cut

## Goal

Close the remaining Slice 6 app-write escape hatch in standalone MCP tools.

By the end of this sprint, `defineTool(...)` remains available for genuinely
custom MCP tools, but it is no longer a quiet path for app-backed Convex writes.
Custom tools must declare their effect class, and any non-standard/custom effect
must carry a typed unsafe permit. Protected app writes should use
`defineMcpApp(...).tool.mutation(...)` for bounded writes or
`defineMcpApp(...).tool.operation(...)` for sensitive/destructive/external work.

## Why This Sprint Comes Next

Sprint 19 hard-cut app-backed tools to explicit blessed lanes:

```ts
tool.query(...)
tool.mutation(...)
tool.operation(...)
```

That removed the ambiguous app-backed `tool({... operation })` shape. The
remaining ambiguity is standalone `defineTool(...)`: a handler can still call
`ctx.mutation(...)` or `ctx.action(...)`, which lets a custom tool behave like a
second backend surface.

We should close that now, before building the shared inventory engine. Inventory
should not have to explain two different write models.

## Current State

- `defineMcpApp(...).tool` now exposes only `query`, `mutation`, and
  `operation`.
- Direct app-backed mutations require backend/generated ref safety metadata.
- Destructive app-backed MCP work must use `tool.operation(...)`.
- Standalone `defineTool(...)` still has `operation?: "query" | "mutation" |
"action"` and handler context methods `ctx.query`, `ctx.mutation`, and
  `ctx.action`.
- No typed `unsafe.permit(...)` primitive exists yet.
- Existing harness/custom examples use standalone `defineTool(...)` for app
  writes.

## Non-Goals

- Do not redesign `defineMcpApp(...)` lanes again.
- Do not add a direct `tool.action(...)` lane.
- Do not finish the full inventory engine in this sprint.
- Do not migrate Ginko destructive MCP wrappers in this sprint.
- Do not add compatibility aliases or feature flags for the old custom app-write
  behavior.
- Do not keep both string unsafe reasons and typed permits as supported 1.0
  shapes.

## Design Target

### Typed Unsafe Permit

Add one typed permit mechanism that later backend unsafe surfaces can reuse:

```ts
unsafe.permit({
  kind: 'externalService',
  reason: 'Calls a diagnostic external service without app writes.',
  scope: ['mcp'],
  reviewBy: '2026-07-01',
})
```

The minimum permit fields for 1.0:

- `kind`
- `reason`
- `scope`
- optional `reviewBy`

`reviewBy` can remain a strict-mode/future enforcement detail, but the field
must exist in the type now.

### Custom Tool Effect Classes

Standalone `defineTool(...)` should require one explicit effect class:

```ts
effect: 'read' | 'diagnostic' | 'external-service'
```

Allowed behavior:

- `read`: can call `ctx.query(...)`; cannot call `ctx.mutation(...)` or
  `ctx.action(...)`.
- `diagnostic`: can do local/diagnostic work and `ctx.query(...)`; cannot call
  `ctx.mutation(...)` or `ctx.action(...)`.
- `external-service`: can call external services and may call `ctx.query(...)`;
  requires a typed unsafe permit; cannot call protected Convex writes directly.

Unsupported behavior:

- `app-write`
- direct `ctx.mutation(...)`
- direct `ctx.action(...)` for business-impacting work

If a tool needs those, use `tool.mutation(...)` or `tool.operation(...)`.

## Work Items

### 1. Add Typed Unsafe Permit Primitive

- [x] Add a small `unsafe` namespace or equivalent focused export.
- [x] Implement `unsafe.permit(...)` with runtime validation for non-empty
      `kind`, `reason`, and `scope`.
- [x] Leave `defineUnsafePermitKinds(...)` for the inventory/doctor sprint; no natural home exists yet.
- [x] Keep the permit type reusable by backend unsafe builders later.
- [x] Export the permit only from the narrow surface that needs it; avoid broad
      barrel creep.

### 2. Make Standalone Tool Effects Explicit

- [x] Add required `effect` to `DefineConvexToolOptions`.
- [x] Keep `defineTool(...)` read/custom focused.
- [x] Make `operation` derived from `effect` where possible instead of a public
      source of truth.
- [x] Reject `destructive: true` as today.
- [x] Reject `effect: "external-service"` without a typed unsafe permit.

### 3. Delete Direct Custom App Writes

- [x] Remove public handler context access to `ctx.mutation(...)` from
      standalone `defineTool(...)`, or make it throw with a clear 1.0 error if
      the type surface cannot be removed in one step.
- [x] Remove public handler context access to `ctx.action(...)`, or make it
      unavailable except through a later operation-backed action design.
- [x] Keep `ctx.query(...)` for custom read/diagnostic tools.
- [x] Update custom examples and harness tools that write app data to
      `defineMcpApp(...).tool.mutation(...)` or operation-backed tools.

### 4. Update Tests

- [x] Type tests prove `defineTool(...)` requires `effect`.
- [x] Type tests prove standalone custom handlers cannot call `ctx.mutation`.
- [x] Type tests prove standalone custom handlers cannot call `ctx.action`.
- [x] Unit tests prove `external-service` requires `unsafe.permit(...)`.
- [x] Unit tests prove malformed permits fail loudly.
- [x] Existing destructive generic tool rejection tests still pass.

### 5. Update Doctor And Docs

- [x] Doctor flags standalone `defineTool(...)` handlers that call
      `ctx.mutation(...)` or `ctx.action(...)`.
- [x] Doctor message points to `tool.mutation(...)` or `tool.operation(...)`.
- [x] MCP docs explain standalone `defineTool(...)` as custom read/diagnostic
      only.
- [x] API reference deletes `operation` as the primary custom-tool decision and
      teaches `effect`.
- [x] Main 1.0 tracker marks the relevant Slice 6 items complete.

## Verification

Focused MCP tests:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/cli-doctor.test.ts \
  tests/types/dx-typing.types.ts \
  tests/types/mcp-runtime.types.ts \
  tests/dts/mcp.types.ts
```

Harness/custom surface checks:

```bash
pnpm run check:cli
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
```

Example checks:

```bash
pnpm --dir examples/07-mcp-reference test
pnpm --dir examples/08-component-mini-cms test
```

Cross-repo smoke:

```bash
pnpm --dir ../ginko-cms run test:types
```

Search checks:

```bash
rg -n "ctx\\.mutation\\(|ctx\\.action\\(" apps examples tests src -g '*.{ts,md}'
rg -n "operation:\\s*['\\\"](?:mutation|action)['\\\"]" apps examples tests src -g '*.{ts,md}'
```

Known non-gates unless fixed separately:

```bash
pnpm run format:check
pnpm run test:types:contracts
```

Current unrelated failures include the existing formatting baseline drift and
Vue Router package identity drift between Trellis and Ginko workspaces.

## Acceptance Criteria

- [x] `defineTool(...)` requires an explicit custom-tool `effect`.
- [x] Standalone `defineTool(...)` cannot be used for direct protected Convex
      app writes.
- [x] External-service custom tools require `unsafe.permit(...)`.
- [x] Typed permits are structured and reusable by later backend unsafe work.
- [x] Maintained custom write tools are migrated to app-backed blessed lanes or
      operation-backed tools.
- [x] Doctor detects custom app-write bypasses.
- [x] Docs present `defineTool(...)` as custom read/diagnostic/external-service
      only.
- [x] Slice 6 no longer has a raw app-write escape hatch.
- [x] Verification commands above pass except explicitly listed non-gates.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `unsafe.permit(...)` as the first typed unsafe permit primitive for MCP custom tools.
- Standalone `defineTool(...)` now requires an explicit `effect` and only exposes `ctx.query(...)`; app writes moved to app-backed blessed lanes.
- Harness write tools now use `tool.mutation(...)` with backend/ref-owned bounded-write safety.
- Doctor now reports `mcp-custom-app-write-bypass` when standalone custom tools call `ctx.mutation(...)` or `ctx.action(...)`.
- Docs now frame `defineTool(...)` as read/diagnostic/external-service only.
- Search hits for `ctx.mutation(...)` / `ctx.action(...)` are limited to negative type tests, doctor fixture coverage, and docs that describe the removed path.
