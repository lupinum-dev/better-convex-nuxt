# Sprint 36: Operation And Tool Inventory Agreement

## Goal

Start proving that inventory can explain operation/tool agreement, using the
existing public-surface metadata extractor instead of adding another scanner.

By the end of this sprint, CLI inventory should expose operation, projection,
and MCP tool metadata from the same metadata extraction path used by public
surface codegen. Doctor should add one focused agreement finding that warns when
destructive operations exist but no operation-backed MCP tool bindings are
visible.

This is a first agreement check. It should not become full `explain`, full
upgrade, or a broad public-surface rewrite.

## Why This Sprint Comes Next

Sprints 31-35 established inventory as a real source:

- versioned, secret-safe JSON;
- forwarding/MCP doctor facts;
- backend risk doctor facts;
- static app-inventory discovery;
- first doctor finding backed by app inventory.

The next Slice 8 proof item is:

```text
Doctor and public-surface checks agree on operations/tools.
```

The repo already has `extractPublicSurfaceCodegenMetadata(...)` in
`src/module-internals/public-surface-codegen.ts`, which extracts:

- operation definitions;
- preview/execute projection bindings;
- MCP tools.

This sprint should reuse that existing extractor as the inventory source. Do not
add a parallel operation/tool scanner.

## Current State

- `inventory.backend.destructiveOperations` carries source locations from the
  doctor scanner.
- `inventory.mcp.destructiveToolMisuses` catches destructive-looking tools that
  skip `tool.operation(...)`.
- `extractPublicSurfaceCodegenMetadata(...)` already understands operations,
  projections, and MCP tool exports.
- CLI inventory does not yet include public-surface operation/tool metadata.
- Doctor does not yet compare destructive operations to operation-backed MCP
  tool bindings.

## Non-Goals

- Do not implement `trellis explain`.
- Do not implement `trellis upgrade --check`.
- Do not replace the public-surface codegen script.
- Do not infer full operation descriptor semantics from arbitrary code.
- Do not execute or import app source.
- Do not make missing MCP bindings a failure; this sprint should warn only when
  the app appears to have MCP enabled and destructive operations have no
  operation-backed tool surface.
- Do not require every destructive operation to have MCP exposure. Some apps may
  intentionally keep destructive operations backend-only.

## Design Target

### Inventory Public Surface Section

Add a small inventory section sourced from
`extractPublicSurfaceCodegenMetadata(project.cwd)`, for example:

```ts
type TrellisCliInventory = {
  publicSurface: {
    operations: Array<{
      id: string
      exportName: string
      kind: 'safe' | 'destructive'
      source: TrellisCliInventorySourceLocation
    }>
    projections: Array<{
      operationId: string
      projection: 'preview' | 'execute'
      exportName: string
      source: TrellisCliInventorySourceLocation
    }>
    tools: Array<{
      name: string
      source: 'tool' | 'operation' | 'defineTool'
      sourceLocation: TrellisCliInventorySourceLocation
    }>
  }
}
```

Keep it safe: path + line only, no source snippets.

### Doctor Agreement Finding

Add one finding, likely:

```text
id: operation-tool-agreement
category: advanced
title: Operation/tool agreement
```

Behavior:

- no operations: pass;
- operations but no MCP layer: pass, because backend-only operations are valid;
- MCP enabled and destructive operations all have at least one `source:
'operation'` MCP tool visible: pass;
- MCP enabled and destructive operations exist but no operation-backed MCP tools
  are visible: warn;
- missing preview/execute projections for destructive operation ids may warn if
  the extractor can prove the projection mismatch without guessing.

Keep the first version conservative. It should catch obvious drift and avoid
claiming more than metadata proves.

### Agreement Source

Doctor must read the agreement facts from `inventory.publicSurface`, not from a
new local scan.

## Work Items

### 1. Extend Inventory

- [x] Import/reuse `extractPublicSurfaceCodegenMetadata(...)` from the existing
      module-internals extractor.
- [x] Add `inventory.publicSurface.operations`.
- [x] Add `inventory.publicSurface.projections`.
- [x] Add `inventory.publicSurface.tools`.
- [x] Map all metadata locations to the safe inventory source-location shape.
- [x] Preserve existing `inventory.backend`, `inventory.mcp`, and
      `inventory.surfaces` fields.

### 2. Add Doctor Agreement Finding

- [x] Add `operation-tool-agreement` finding backed by
      `inventory.publicSurface`.
- [x] Keep backend-only destructive operations as pass when MCP is not enabled.
- [x] Warn only for clear MCP/destructive operation drift.
- [x] Keep human output concise and source-location based.

### 3. Add Tests

- [x] Test inventory reports operation definitions, projections, and MCP tools
      from the Phase 0 fixture or generated feature fixture.
- [x] Test backend-only destructive operation remains pass.
- [x] Test MCP-enabled destructive operation without operation-backed tool
      produces a warning only when metadata proves drift.
- [x] Test operation-backed MCP tool passes agreement.
- [x] Test JSON remains snippet-free and secret-safe.

### 4. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 notes for public-surface metadata in inventory.
- [x] Mark `Doctor and public-surface checks agree on operations/tools` only if
      the extractor-backed inventory and doctor finding prove the agreement path.
- [x] Leave upgrade and explain replacement unchecked.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
```

Inventory/public-surface checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-doctor.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/feature-compose.test.ts
```

Starter and surface checks:

```bash
pnpm run check:starter-fixtures
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/lib/inventory.ts \
  src/cli/commands/doctor.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint36-operation-tool-inventory-agreement-plan.md
```

## Acceptance Criteria

- [x] Inventory JSON includes operation, projection, and MCP tool metadata from
      the existing public-surface extractor.
- [x] Doctor has an operation/tool agreement finding backed by inventory.
- [x] Backend-only destructive operations remain valid.
- [x] Clear MCP/destructive operation drift warns without overclaiming.
- [x] No app source is executed or imported.
- [x] Inventory JSON remains snippet-free and secret-safe.
- [x] Slice 8 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `inventory.publicSurface` with operations, projections, and MCP tools
  sourced from `extractPublicSurfaceCodegenMetadata(...)`.
- Public-surface inventory stores path + line locations only.
- Added `operation-tool-agreement`, a conservative doctor finding backed by
  `inventory.publicSurface`.
- Backend-only destructive operations remain passing when MCP is not enabled.
- MCP-enabled apps with destructive operations and no operation-backed MCP tools
  warn.
- Operation-backed MCP tools clear the agreement warning.

## Next Sprint Candidate

After operation/tool agreement is inventory-backed, the next Slice 8 sprint
should decide whether public-surface checks can consume the same inventory
metadata directly, or whether `upgrade --check` should become the first CLI
consumer beyond doctor.
