# Sprint 8: Maintained Examples Hard Cut

## Goal

Migrate maintained examples `04`-`06` to the 1.0 backend surface.

Sprints 5-7 cleaned the docs front door, the MCP operation lane, and the MCP
reference example. The remaining maintained examples still teach old imports,
plain callable backend builders, and old unsafe builders. This sprint moves the
core examples to the same explicit lanes as the starters and MCP reference.

## Non-Goals

- Do not migrate `examples/08-component-mini-cms`; that belongs to the
  bridge/Ginko sprint.
- Do not redesign example business behavior.
- Do not add compatibility shims for old callable builders.
- Do not fix unrelated Nuxt/UI generated files under `.nuxt`.
- Do not tackle direct MCP mutation safety metadata in this sprint.

## Work Items

### 1. SaaS Platform Example

- [x] Replace `@lupinum/trellis/functions` imports with
      `@lupinum/trellis/backend` where the public 1.0 surface owns the export.
- [x] Convert permission context to `query.protected(...)`.
- [x] Convert project handlers:
  - [x] `list`
  - [x] `get`
  - [x] `create`
  - [x] `archive`
  - [x] `exportProjects`
- [x] Convert project operation preview to explicit protected lane.
- [x] Convert task handlers:
  - [x] `listByProject`
  - [x] `get`
  - [x] `create`
  - [x] `moveToColumn`
  - [x] `assign`
  - [x] `bulkUpdateStatus`
  - [x] `remove`
  - [x] `listForExport`
- [x] Convert task operation preview to explicit protected lane.
- [x] Convert member/comment/workspace/files handlers.
- [x] Convert `unsafe.mutation(...)` upload URL flow to `mutation.unsafe(...)`
      without changing its bypass reason.

### 2. Visibility Access Example

- [x] Replace old backend imports with `@lupinum/trellis/backend`.
- [x] Convert permission context to explicit protected lane.
- [x] Convert workspace onboarding to the correct public/protected lane.
- [x] Convert article handlers and revoke-token operation preview.
- [x] Convert knowledge-base handlers.
- [x] Preserve visibility/share-token behavior and existing test expectations.

### 3. Multi-Workspace Example

- [x] Replace old backend imports with `@lupinum/trellis/backend`.
- [x] Convert permission context to explicit protected lane.
- [x] Convert membership, dashboard, workspace, and project handlers.
- [x] Convert `unsafe.query(...)` dashboard/portfolio flow to `query.unsafe(...)`
      while preserving the explicit cross-workspace bypass reason.
- [x] Preserve workspace switching and agency portfolio behavior.

### 4. Test/Alias Updates

- [x] Add `@lupinum/trellis/backend` aliases to example Vitest configs where
      needed.
- [x] Update any source-string assertions that still expect old builder syntax.
- [x] Keep `.nuxt` generated files out of the migration scope.

### 5. Verification

- [x] Run each migrated example test suite.
- [x] Run maintained examples doctor check if it stays scoped enough.
- [x] Run focused grep over examples `04`-`06`.
- [x] Run public type surface and publish surface checks.
- [x] Run refactor inventory check.

Suggested commands:

```bash
pnpm --dir examples/04-saas-platform test
pnpm --dir examples/05-visibility-access test
pnpm --dir examples/06-multi-workspace test
pnpm run check:examples:doctor
rg -n "export const .* = (query|mutation|action)\\(|\\b(query|mutation|action)\\(\\{|unsafe\\.(query|mutation|action)|@lupinum/trellis/functions" examples/04-saas-platform/convex examples/05-visibility-access/convex examples/06-multi-workspace/convex
pnpm run test:types:public
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
```

## Acceptance Criteria

- [x] Examples `04`-`06` no longer import public runtime APIs from
      `@lupinum/trellis/functions`.
- [x] Examples `04`-`06` no longer contain old unclassified backend handler
      declarations.
- [x] Examples `04`-`06` no longer use `unsafe.query(...)` /
      `unsafe.mutation(...)`.
- [x] Operation projections in examples `04`-`06` use explicit lanes.
- [x] Example tests pass for `04`, `05`, and `06`.
- [x] No compatibility shim or dual public backend path is added.

## Exit Notes To Capture

- [x] Any remaining old builder hits outside examples `04`-`06`.
- [x] Whether example doctor checks are clean after the migration.
- [x] Whether Sprint 9 should tackle bridge/CMS or direct MCP mutation safety
      metadata.

## Exit Notes

- The focused grep over examples `04`-`06` returned no old callable builder,
  old unsafe builder, or `@lupinum/trellis/functions` hits.
- `check:examples:doctor` passed after the migration.
- Example `04` and `05` destructive tests now exercise preview plus signed
  confirmation token flow instead of directly executing destructive mutations.
- Sprint 9 should tackle the bridge/CMS lane next if we want to remove the
  remaining old public backend shape from maintained examples end to end.
