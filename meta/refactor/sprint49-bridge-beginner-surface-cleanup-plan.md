# Sprint 49: Bridge Beginner Surface Cleanup

## Goal

Finish the local Slice 9 cleanup that keeps normal app authors away from bridge
and CMS product setup unless they intentionally open package-author material.

Sprint 48 proved the package/import boundary. This sprint cleans the remaining
local beginner-facing docs and generic CLI naming so the repo teaches one
product surface: `public`, `personal`, `workspace`, and `workspace-mcp`.

## Why This Comes Next

Slice 9 still has three local gaps:

- beginner docs still mention `cms` as a starter in `README.md` and
  `examples/README.md`;
- generic resource scaffolding still carries a `cms` app kind even though CMS
  setup is Ginko-owned;
- Slice 9 cannot honestly reach its done state while first-reader surfaces still
  expose CMS/bridge concepts as normal app paths.

The package boundary is already enforced. The next simplest correct move is to
delete stale beginner-surface claims and rename generic CLI internals away from
CMS-specific language.

## Non-Goals

- Do not delete `examples/08-component-mini-cms`; it remains the advanced
  Ginko-shaped/package-integration fixture.
- Do not remove package-author component bridge docs.
- Do not run full Ginko cross-repo E2E.
- Do not redesign the resource generator.
- Do not add compatibility aliases for `cms` starter paths.
- Do not reopen bridge package boundaries from Sprint 48.

## Work Items

### 1. Beginner Docs Hard Cut

- [ ] Update `README.md` so official starters are `public`, `personal`,
      `workspace`, and `workspace-mcp`.
- [ ] Replace `workspace --mcp` examples with canonical `workspace-mcp` where
      the text describes 1.0 starter shape.
- [ ] Remove `cms` from beginner starter lists.
- [ ] Keep `08-component-mini-cms` framed as an advanced maintained reference,
      not a starter.
- [ ] Update `examples/README.md` so productized starting points no longer
      mention `cms` or `workspace --mcp`.

### 2. Generic CLI Naming Cleanup

- [ ] Rename the internal resource app kind from `cms` to an explicit
      non-product term such as `author-owned`.
- [ ] Keep generated behavior for author-owned schemas with `authorId` intact.
- [ ] Update unit test names and fixtures that describe this path as `cms`
      unless the test is intentionally about deleted `cms` starter migration.
- [ ] Do not change Ginko/package-author bridge terminology in advanced docs or
      bridge package tests.

### 3. Guardrails

- [ ] Add or strengthen a focused test/check proving beginner starter surfaces
      do not list `cms`.
- [ ] Add or strengthen a focused test/check proving starter docs teach
      `workspace-mcp`, not `workspace --mcp`, for the canonical 1.0 path.
- [ ] Keep allowed bridge/CMS references scoped to advanced component bridge
      docs, `08-component-mini-cms`, migration checks, and historical planning
      files.

### 4. Tracker Reconciliation

- [ ] Mark Slice 9 local docs/generic-naming items complete only when the above
      checks pass.
- [ ] Leave full Ginko E2E in the cross-repo gate.
- [ ] Mark Slice 9 done only if normal app authors no longer see bridge/CMS
      unless they intentionally open advanced package-integration docs.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/public-surface-inventory-script.test.ts tests/unit/cli-doctor.test.ts tests/unit/cli-add-resource.test.ts tests/unit/examples-gallery-docs.test.ts tests/unit/phase0-starter-manifest.test.ts`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:docs:links`
- [ ] `pnpm run check:starter-fixtures`
- [ ] `pnpm run check:refactor:surface:inventory`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check README.md examples/README.md src/cli/lib/resource.ts tests/unit/cli-add-resource.test.ts meta/refactor/sprint49-bridge-beginner-surface-cleanup-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- The beginner-facing Trellis surface no longer offers CMS as a Trellis starter.
- The canonical MCP starter spelling is `workspace-mcp`.
- Generic CLI resource logic no longer names a Ginko/CMS product concept.
- Bridge package-author material remains available only in advanced surfaces.
- Slice 9 local work is closed; full Ginko validation remains a cross-repo gate.
