# Sprint 17: MCP Descriptor Boundary Hard Cut

## Goal

Remove the remaining MCP/server operation bindings that import Convex operation
implementations.

By the end of this sprint, active MCP tool files should bind
`tool.operation(...)` through shared operation descriptors plus projected refs,
not through `defineOperation(...)` implementation objects. This closes the
remaining Slice 5 boundary before we start the broader Slice 6 MCP blessed-lane
cleanup.

## Why This Sprint Comes Next

Sprint 16 made descriptors trustworthy:

- descriptor/implementation drift now fails;
- feature manifests are descriptor-first;
- inventory JSON comes from descriptors;
- projection binding has focused invariants.

The remaining Slice 5 risk is import-boundary drift. Several active MCP tool
files still import Convex implementation modules to get operation metadata:

- `apps/harness/server/mcp/tools/delete-post.ts`
- `examples/07-mcp-reference/server/mcp/tools/runbooks/delete.ts`
- `examples/07-mcp-reference/server/mcp/tools/runbooks/bulk-delete.ts`
- `examples/08-component-mini-cms/server/mcp/tools/publish-page.ts`

That keeps Convex backend implementation objects in the server/MCP runtime and
undercuts the descriptor boundary. We should hard-cut those paths now rather
than letting the old and new models live side by side.

## Current State

- Shared descriptors exist and are proven in the Phase 0 workspace-MCP fixture.
- Generated/projected operation refs exist and are proven in the Phase 0
  fixture.
- `implementOperation(descriptor, implementation)` is available for Convex
  implementation files.
- `defineFeature({ operations })` now rejects implementation objects.
- Some docs and generators still show operation implementation imports in MCP
  examples.

## Non-Goals

- Do not delete `defineOperation(...)` globally in this sprint.
- Do not delete `tool.fromOperation(...)` unless the implementation already
  proves it is unused and the deletion is smaller than planning it for Slice 6.
- Do not complete all MCP safety-class hardening.
- Do not implement doctor/explain.
- Do not add runtime source scanners to detect imports.
- Do not add compatibility aliases for operation implementations in MCP.
- Do not move bridge package ownership.

## Work Items

### 1. Convert Harness MCP Operation Binding

- [ ] Split `removePostOp` into a shared descriptor plus Convex implementation.
- [ ] Keep backend behavior in `apps/harness/convex/posts.ts`.
- [ ] Move MCP tool metadata to descriptor import, not implementation import.
- [ ] Use projected execute/preview refs created from the descriptor and exact
      generated Convex refs.
- [ ] Keep permission import only if it is a shared permission key/metadata-safe
      import; otherwise move to a shared permission key.

### 2. Convert MCP Reference Runbook Operation Bindings

- [ ] Split `removeRunbookOp` and `bulkRemoveRunbooksOp` into descriptors plus
      implementations.
- [ ] Update runbook MCP tools to import descriptors and projected refs, not
      Convex operation implementation modules.
- [ ] Preserve current delete and bulk-delete behavior, rate limit, max item
      guard, groups, and tool names.
- [ ] Update generated or hand-authored operation-ref files only if they are the
      smallest descriptor-derived source of truth.

### 3. Convert Component Mini CMS Publish Tool Binding

- [ ] Split `publishPageOp` into descriptor plus implementation if needed.
- [ ] Keep transport/action execution behavior unchanged.
- [ ] Bind server MCP tool through descriptor plus projected transport execute
      and preview refs.
- [ ] Update component mini CMS tests that currently assert implementation-based
      imports.

### 4. Update Generators And Docs That Teach The Old Pattern

- [ ] Update `src/cli/lib/resource.ts` output so generated MCP operation tools
      use descriptors/projected refs instead of operation implementation
      imports.
- [ ] Update docs snippets that still show `tool.operation(removeRunbookOp, ...)`
      from Convex implementation modules.
- [ ] Keep docs focused on the explicit checked-binding fallback, not the dream
      one-liner.
- [ ] Do not document both old and new import patterns.

### 5. Add A Boundary Regression Check

- [ ] Add a small unit or script check that fails when active server/MCP tool
      files import from Convex implementation paths.
- [ ] Scope the check to maintained harness/examples/fixtures to avoid a broad
      repo scanner becoming product logic.
- [ ] Keep the check as a test of repository hygiene, not a runtime source of
      truth.

### 6. Update The 1.0 Tracker

- [ ] Mark Slice 5 import-boundary/delete items complete only when active MCP
      tools no longer import Convex operation implementations.
- [ ] Leave Slice 6 safety-lane and `tool.fromOperation` deletion items
      unchecked unless actually completed.
- [ ] Record any remaining implementation-import path as a blocker, not a
      compatibility path.

## Verification

Focused tests:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/mcp-operation-binding.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts \
  tests/unit/public-surface-codegen.test.ts \
  tests/unit/generated-type-consumers.test.ts
```

Maintained example tests:

```bash
pnpm --dir examples/07-mcp-reference test
pnpm --dir examples/08-component-mini-cms test
```

Harness and surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Ginko cross-repo check:

```bash
pnpm --dir ../ginko-cms run test:types
```

Known non-gates unless fixed separately:

```bash
pnpm run test:types
pnpm --dir examples/07-mcp-reference typecheck
pnpm --dir examples/03-team-workspace typecheck
```

Current unrelated failures include Vue Router type identity drift, generated API
typing drift, and Convex dependency-version type drift.

## Acceptance Criteria

- [ ] Active MCP tool files no longer import Convex operation implementation
      objects for `tool.operation(...)` metadata.
- [ ] Harness delete-post MCP tool binds through descriptor plus projected refs.
- [ ] MCP reference delete and bulk-delete runbook tools bind through
      descriptors plus projected refs.
- [ ] Component mini CMS publish tool binds through descriptor plus projected
      refs while preserving transport/action execution behavior.
- [ ] Resource generator and docs no longer teach Convex implementation imports
      in MCP tool files.
- [ ] A focused regression check covers maintained server/MCP tool import
      boundaries.
- [ ] No runtime source scanner, duplicate operation registry, or compatibility
      alias is added.
- [ ] Slice 5 tracker reflects the completed import-boundary cleanup.
- [ ] Verification commands above pass except explicitly listed non-gates.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- [ ] Fill this in during implementation.
