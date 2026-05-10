# Sprint 9: Bridge/CMS Example Hard Cut

## Goal

Migrate the component mini CMS example and CMS starter template to the 1.0
backend lanes without pretending bridge extraction is done.

Sprint 8 cleaned maintained examples `04`-`06`. The remaining maintained example
with old public backend shape is `examples/08-component-mini-cms`, and the CMS
starter template still generates old callable builders. This sprint makes those
surfaces consistent with the new backend lane while keeping bridge package
extraction as a later, explicit sprint.

## Non-Goals

- Do not extract `@lupinum/trellis-bridge` in this sprint.
- Do not redesign the component bridge runtime.
- Do not add compatibility shims for `@lupinum/trellis/functions`.
- Do not migrate generated `.nuxt`, `.convex`, or `node_modules` files.
- Do not change Ginko CMS runtime code outside Trellis unless a verification
  failure proves this sprint broke the packaged-integration contract.
- Do not add direct MCP mutation safety metadata here; this sprint is the CMS
  hard cut only.

## Work Items

### 1. Root Mini CMS App

- [ ] Replace root app imports from `@lupinum/trellis/functions` with
      `@lupinum/trellis/backend` where the 1.0 backend surface owns the export.
- [ ] Convert root page wrappers from old callable builders to explicit lanes:
  - [ ] `listPublished`
  - [ ] `getPublished`
  - [ ] `listStudio`
  - [ ] `listDraft`
  - [ ] `create`
  - [ ] `save`
  - [ ] `publish`
  - [ ] `publishAction`
  - [ ] `previewPublish`
- [ ] Keep forwarded identity rejection on public root wrappers intact.
- [ ] Keep the bridge principal forwarding behavior intact.

### 2. Component Mini CMS Backend

- [ ] Replace component backend imports from `@lupinum/trellis/functions` with
      `@lupinum/trellis/backend` where possible.
- [ ] Convert component page handlers from old callable builders to explicit
      lanes:
  - [ ] `listPublished`
  - [ ] `getPublished`
  - [ ] `listStudio`
  - [ ] `listDraft`
  - [ ] `create`
  - [ ] `save`
- [ ] Convert publish operation preview to explicit protected lane.
- [ ] Preserve `transportMutation(publishPageOp)` for the internal bridge
      execute path until the bridge extraction sprint owns that boundary.
- [ ] Preserve operation metadata and destructive confirmation semantics.

### 3. Bridge Helper Imports

- [ ] Move bridge helper imports used by example 08 to the narrowest current
      1.0-compatible surface.
- [ ] If a helper is not yet exported from `@lupinum/trellis/backend`, either:
  - [ ] add it there only if it belongs to the backend source of truth; or
  - [ ] leave the old import documented as the bridge-extraction blocker.
- [ ] Do not add a broad public barrel or duplicate bridge helper surface.

### 4. MCP Publish Tool

- [ ] Move operation-ref helper imports away from `@lupinum/trellis/functions`
      if the backend surface already owns them.
- [ ] Preserve the explicit action-backed operation binding:
  - [ ] `previewOperationRef(...)`
  - [ ] `transportExecuteOperationRef(...)`
  - [ ] `executeOperation: 'action'`
- [ ] Keep MCP/server files from importing Convex-only implementation modules
      beyond the existing example fixture boundary; note any remaining boundary
      issue in exit notes.

### 5. CMS Starter Template

- [ ] Update `src/cli/templates/init/cmsPagesTemplate.tpl` to generate explicit
      backend lanes instead of old callable builders.
- [ ] Update `src/cli/templates/init/cmsPermissionQueryTemplate.tpl` to generate
      explicit protected lane syntax.
- [ ] Update `src/cli/lib/init.ts` generated operation snippets if they still
      emit `query(previewOf(...))` / `mutation(op)` for CMS starter output.
- [ ] Do not expand the starter into a Ginko product setup.

### 6. Test/Alias Updates

- [ ] Add `@lupinum/trellis/backend` alias to the example 08 Vitest config if
      needed.
- [ ] Update source-string assertions that still expect old imports or builder
      syntax.
- [ ] Keep generated and dependency directories out of scans.

### 7. Verification

- [ ] Run the component mini CMS example test suite.
- [ ] Run maintained examples doctor check.
- [ ] Run focused grep over example 08 and CMS templates.
- [ ] Run public type surface and publish surface checks.
- [ ] Run refactor inventory check.
- [ ] Run `git diff --check`.

Suggested commands:

```bash
pnpm --dir examples/08-component-mini-cms test
pnpm run check:examples:doctor
rg -n "@lupinum/trellis/functions|export const .* = (query|mutation|action)\\(|\\b(query|mutation|action)\\(\\{|unsafe\\.(query|mutation|action)" examples/08-component-mini-cms/convex examples/08-component-mini-cms/server src/cli/templates/init src/cli/lib/init.ts -g '!**/.nuxt/**' -g '!**/.convex/**' -g '!**/node_modules/**'
pnpm run test:types:public
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
git diff --check
```

## Acceptance Criteria

- [ ] Example `08` no longer imports public runtime backend APIs from
      `@lupinum/trellis/functions` except for explicitly recorded bridge
      extraction blockers.
- [ ] Example `08` no longer contains old unclassified backend handler
      declarations in maintained source files.
- [ ] Example `08` operation projections use explicit lanes.
- [ ] CMS starter templates no longer generate old callable backend handlers.
- [ ] Existing component mini CMS behavior and tests pass.
- [ ] No new compatibility shim, duplicate public backend path, or bridge
      package facade is added.

## Exit Notes To Capture

- [ ] Any remaining old `functions` imports and whether they are true
      bridge-extraction blockers.
- [ ] Whether `createComponentBridge` belongs on the backend surface, a future
      bridge package, or only the current internal functions runtime until
      extraction.
- [ ] Whether Sprint 10 should tackle bridge package extraction, direct MCP
      mutation safety metadata, or the remaining historical docs/meta cleanup.
