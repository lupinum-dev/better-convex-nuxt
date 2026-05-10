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

- [x] Delete `fromOperation` from the MCP tool factory public type.
- [x] Move the implementation body to `tool.operation(...)`.
- [x] Delete the `tool.operation = tool.fromOperation` alias.
- [x] Update runtime error messages from `tool.fromOperation(...)` to
      `tool.operation(...)`.
- [x] Update operation-binding diagnostics to say `tool.operation(...)`.
- [x] Update generic destructive-tool rejection messages to point to
      `defineMcpApp(...).tool.operation(...)`.

### 2. Generated Resource Tool Cut

- [x] Update `src/cli/lib/resource.ts` so generated destructive MCP resource
      tools use `tool.operation(...)`.
- [x] Update resource generation tests and snapshots/expected source.
- [x] Keep generated imports unchanged unless the tool file no longer needs a
      legacy import.

### 3. Doctor And Inventory Cut

- [x] Update doctor destructive MCP checks to require `tool.operation(...)`.
- [x] Update doctor wording so destructive-looking MCP tools that skip the
      operation lane mention `tool.operation(...)`.
- [x] Update public-surface inventory proof rows to expect `tool.fromOperation`
      absence and `tool.operation(...)` teaching.
- [x] Keep historical/planning docs allowed, but current docs/templates/runtime
      must not mention the old API.

### 4. Docs And Examples Cut

- [x] Update current MCP docs:
  - [x] `apps/docs/content/docs/13.api-reference/5.mcp.md`
  - [x] `apps/docs/content/docs/14.mcp-tools/2.define-tools.md`
  - [x] `apps/docs/content/docs/14.mcp-tools/4.destructive-tools.md`
  - [x] `apps/docs/content/docs/08.permissions/7.operations.md`

- [x] Update current skill/reference docs:
  - [x] `meta/skill/references/server-mcp.md`

- [x] Update maintained MCP examples:
  - [x] `examples/07-mcp-reference/server/mcp/tools/runbooks/delete.ts`
  - [x] `examples/07-mcp-reference/server/mcp/tools/runbooks/bulk-delete.ts`
  - [x] related example tests if they assert source text

- [x] Leave component mini CMS / bridge example cleanup only if it is not
      required for tests. Otherwise migrate the smallest blocking source string
      and record bridge/Ginko leftovers for the bridge sprint.

### 5. Type And Unit Tests

- [x] Update `tests/types/mcp-runtime.types.ts`.
- [x] Update `tests/dts/mcp.types.ts`.
- [x] Update `tests/unit/define-convex-tool.test.ts`.
- [x] Update `tests/unit/public-surface-codegen.test.ts`.
- [x] Update `tests/unit/generated-type-consumers.test.ts`.
- [x] Update `tests/unit/cli-doctor.test.ts`.
- [x] Update `src/module-internals/public-surface-codegen.ts` only if the
      source classifier should rename `fromOperation` to `operation`.

### 6. Verification

- [x] Run MCP-focused unit tests.
- [x] Run CLI doctor/resource generation tests touched by this sprint.
- [x] Run type/DTS tests touched by this sprint.
- [x] Run docs and public-surface checks.
- [x] Run refactor inventory check.
- [x] Run a final grep proving current runtime/docs/templates/tests no longer
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

- [x] `tool.fromOperation(...)` is gone from runtime public types.
- [x] `tool.fromOperation(...)` is gone from runtime implementation.
- [x] `tool.operation(...)` is the direct implementation path, not an alias.
- [x] Generated resource MCP tools use `tool.operation(...)`.
- [x] Current MCP docs teach only `mcp.tool.operation(...)` /
      `tool.operation(...)`.
- [x] Doctor and error messages teach `tool.operation(...)`.
- [x] Tests pass for the touched MCP/runtime/docs/public-surface paths.

## Exit Notes To Capture

- [x] Whether any `fromOperation` hits remain only in historical planning docs.
- [x] Whether component mini CMS still needs a bridge/Ginko-specific migration.
- [x] Whether Sprint 7 should tackle direct MCP mutation safety metadata or
      advanced examples next.

Exit notes:

- Remaining `fromOperation` hits are historical/spec/planning text plus the
  refactor inventory script's search token. Runtime, current MCP docs, tests,
  harness MCP tools, and maintained MCP tool examples use `tool.operation(...)`.
- Component mini CMS only needed the direct MCP tool source assertion updated.
  Its broader bridge imports and raw forwarding paths remain for the bridge/Ginko
  sprint.
- `pnpm --dir examples/07-mcp-reference test` still fails before exercising the
  MCP tool rename because that example has old unclassified backend handlers.
  That should be the next example migration sprint, not part of this method-name
  hard cut.
