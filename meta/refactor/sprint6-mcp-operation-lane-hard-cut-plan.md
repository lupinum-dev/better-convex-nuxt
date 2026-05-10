# Sprint 6: MCP Operation Lane Hard Cut

## Goal

Make `mcp.tool.operation(...)` the only public operation-backed MCP tool lane.

The current runtime still keeps `tool.fromOperation(...)` as the implementation
path and assigns `tool.operation = tool.fromOperation`. That preserves two names
for one concept. This sprint removes the old public name and updates generated
MCP resource code, doctor checks, docs, and tests to teach the 1.0 lane.

## Non-Goals

- Do not redesign operation descriptors or Convex codegen ordering in this
  sprint.
- Do not implement direct MCP mutation safety metadata yet.
- Do not migrate bridge/Ginko internals except for test fixtures that directly
  block `tool.fromOperation(...)` deletion.
- Do not add `fromOperation` as a hidden alias.
- Do not migrate raw trusted-forwarding docs or helpers.

## Work Items

### 1. Runtime API Cut

- [ ] Delete `fromOperation` from the MCP tool factory public type.
- [ ] Move the implementation body to `tool.operation(...)`.
- [ ] Delete the `tool.operation = tool.fromOperation` alias.
- [ ] Update runtime error messages from `tool.fromOperation(...)` to
      `tool.operation(...)`.
- [ ] Update operation-binding diagnostics to say `tool.operation(...)`.
- [ ] Update generic destructive-tool rejection messages to point to
      `defineMcpApp(...).tool.operation(...)`.

### 2. Generated Resource Tool Cut

- [ ] Update `src/cli/lib/resource.ts` so generated destructive MCP resource
      tools use `tool.operation(...)`.
- [ ] Update resource generation tests and snapshots/expected source.
- [ ] Keep generated imports unchanged unless the tool file no longer needs a
      legacy import.

### 3. Doctor And Inventory Cut

- [ ] Update doctor destructive MCP checks to require `tool.operation(...)`.
- [ ] Update doctor wording so destructive-looking MCP tools that skip the
      operation lane mention `tool.operation(...)`.
- [ ] Update public-surface inventory proof rows to expect `tool.fromOperation`
      absence and `tool.operation(...)` teaching.
- [ ] Keep historical/planning docs allowed, but current docs/templates/runtime
      must not mention the old API.

### 4. Docs And Examples Cut

- [ ] Update current MCP docs:
  - [ ] `apps/docs/content/docs/13.api-reference/5.mcp.md`
  - [ ] `apps/docs/content/docs/14.mcp-tools/2.define-tools.md`
  - [ ] `apps/docs/content/docs/14.mcp-tools/4.destructive-tools.md`
  - [ ] `apps/docs/content/docs/08.permissions/7.operations.md`

- [ ] Update current skill/reference docs:
  - [ ] `meta/skill/references/server-mcp.md`

- [ ] Update maintained MCP examples:
  - [ ] `examples/07-mcp-reference/server/mcp/tools/runbooks/delete.ts`
  - [ ] `examples/07-mcp-reference/server/mcp/tools/runbooks/bulk-delete.ts`
  - [ ] related example tests if they assert source text

- [ ] Leave component mini CMS / bridge example cleanup only if it is not
      required for tests. Otherwise migrate the smallest blocking source string
      and record bridge/Ginko leftovers for the bridge sprint.

### 5. Type And Unit Tests

- [ ] Update `tests/types/mcp-runtime.types.ts`.
- [ ] Update `tests/dts/mcp.types.ts`.
- [ ] Update `tests/unit/define-convex-tool.test.ts`.
- [ ] Update `tests/unit/public-surface-codegen.test.ts`.
- [ ] Update `tests/unit/generated-type-consumers.test.ts`.
- [ ] Update `tests/unit/cli-doctor.test.ts`.
- [ ] Update `src/module-internals/public-surface-codegen.ts` only if the
      source classifier should rename `fromOperation` to `operation`.

### 6. Verification

- [ ] Run MCP-focused unit tests.
- [ ] Run CLI doctor/resource generation tests touched by this sprint.
- [ ] Run type/DTS tests touched by this sprint.
- [ ] Run docs and public-surface checks.
- [ ] Run refactor inventory check.
- [ ] Run a final grep proving current runtime/docs/templates/tests no longer
      contain public `tool.fromOperation(...)` usage.

Suggested commands:

```bash
pnpm vitest run tests/unit/define-convex-tool.test.ts tests/unit/public-surface-codegen.test.ts tests/unit/generated-type-consumers.test.ts tests/unit/cli-doctor.test.ts
pnpm run test:types
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
rg -n "tool\\.fromOperation|fromOperation" src tests apps/docs/content meta/skill examples/07-mcp-reference
```

## Acceptance Criteria

- [ ] `tool.fromOperation(...)` is gone from runtime public types.
- [ ] `tool.fromOperation(...)` is gone from runtime implementation.
- [ ] `tool.operation(...)` is the direct implementation path, not an alias.
- [ ] Generated resource MCP tools use `tool.operation(...)`.
- [ ] Current MCP docs teach only `mcp.tool.operation(...)` /
      `tool.operation(...)`.
- [ ] Doctor and error messages teach `tool.operation(...)`.
- [ ] Tests pass for the touched MCP/runtime/docs/public-surface paths.

## Exit Notes To Capture

- [ ] Whether any `fromOperation` hits remain only in historical planning docs.
- [ ] Whether component mini CMS still needs a bridge/Ginko-specific migration.
- [ ] Whether Sprint 7 should tackle direct MCP mutation safety metadata or
      advanced examples next.
