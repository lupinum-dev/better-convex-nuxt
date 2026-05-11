# Sprint 3: Backend Builder Hard Cut

Status: implemented
Owner: Matthias

Sprint 3 finishes the trust-lane cut started in Sprint 2. The goal is to make
`query.public(...)`, `query.protected(...)`, `mutation.public(...)`,
`mutation.protected(...)`, and `mutation.unsafe(...)` the only accepted 1.0
backend builder shape for app code and representative tests.

This sprint should delete ambiguity, not add compatibility. The old callable
builder implementation may stay only as a temporary internal shim while the
repository is being converted, and it must be tracked as unfinished until it is
deleted.

## Decisions From Sprint 2

- `@lupinum/trellis/backend` is the canonical backend import.
- `@lupinum/trellis/functions` is not a public package export.
- Explicit backend lane builders exist and stamp lane metadata.
- Backend no longer exports bridge APIs.
- The old callable builder spelling still exists and is not accepted as done.

## Non-Goals

- Do not finish typed unsafe permits in this sprint.
- Do not finish signed forwarding hard cut in this sprint.
- Do not finish bridge package extraction in this sprint.
- Do not migrate Ginko CMS in this sprint.
- Do not add compatibility aliases for old backend imports or builder spellings.

## Work Items

### 1. Convert Representative Backend Consumers

- [x] Convert `apps/harness/convex/functions.ts` to
      `@lupinum/trellis/backend`.
- [x] Convert `apps/harness/convex/functionsProbe.ts` imports to
      `@lupinum/trellis/backend`.
- [x] Convert `apps/harness/convex/auth/*` type/value imports to backend.
- [x] Convert the smallest public example backend import to backend.
- [x] Convert the smallest authenticated/workspace example backend import to
      backend.
- [x] Avoid bulk doc rewrites unless they are needed for surface checks.

### 2. Convert Builder Spellings In Focused Code

- [x] Convert representative public handlers from `query(...)` /
      `mutation(...)` to `query.public(...)` / `mutation.public(...)`.
- [x] Convert representative protected handlers from `query(...)` /
      `mutation(...)` to `query.protected(...)` /
      `mutation.protected(...)`.
- [x] Convert representative unsafe handlers from `unsafe.query(...)` /
      `unsafe.mutation(...)` to `query.unsafe(...)` /
      `mutation.unsafe(...)` where the handler is part of the new 1.0 surface.
- [x] Leave legacy unsafe permit-string cleanup to the typed-permits sprint.
- [x] Record remaining old builder spelling hits with owners.

### 3. Make Unclassified Backend Handlers Fail

- [x] Add a runtime guard that rejects direct calls to the old callable
      `query(...)` / `mutation(...)` builder after explicit lanes are attached.
- [x] Preserve the internal implementation path used by explicit lane builders
      without exposing it as a public callable route.
- [x] Add focused tests proving `runtime.query({...})` and
      `runtime.mutation({...})` fail with an actionable error.
- [x] Add focused tests proving `runtime.query.public({...})` does not allow a
      `guard` field.
- [x] Add focused tests proving protected handlers still require explicit
      `guard` and use the existing protected handler pipeline.

### 4. Keep Public And Generated Surfaces Honest

- [x] Update generated registry/module augmentation tests to use backend.
- [x] Update dts tests that still teach app-owned imports from functions.
- [x] Regenerate `meta/refactor/sprint1-public-surface-inventory.md`.
- [x] Update `meta/trellis-1.0-refactor-plan.md` checkboxes only for completed
      Slice 3 items.
- [x] Add or update a check that `@lupinum/trellis/functions` does not reappear
      in package exports, generated public types, or beginner templates.

### 5. Document Remaining Cleanup

- [x] Count remaining `@lupinum/trellis/functions` hits outside historical
      planning/ADR files.
- [x] Count remaining old callable builder hits in tests/examples/templates.
- [x] Separate remaining hits into: - docs rewrite; - templates/fixtures conversion; - bridge extraction; - typed unsafe permits; - historical/planning references.
- [x] Record the next sprint recommendation in the exit notes.

## Acceptance Criteria

- [x] Representative harness and example backend imports use
      `@lupinum/trellis/backend`.
- [x] Representative app handlers use explicit lane builders.
- [x] Direct `runtime.query({...})` and `runtime.mutation({...})` fail with a
      clear error.
- [x] Explicit lane builders continue to delegate through the existing backend
      authorization pipeline.
- [x] Public handlers cannot provide `guard`.
- [x] Protected handlers cannot accidentally become public.
- [x] Remaining old import/builder hits are counted and assigned to future
      slices.
- [x] `pnpm run check:refactor:surface:inventory` passes.
- [x] `pnpm run check:docs:api-surface` passes or generated docs changes are
      committed intentionally.
- [x] `pnpm run check:publish-surface` passes.
- [x] `pnpm run test:types:public` passes.
- [x] Focused backend/unit tests pass.
- [x] `git diff --check` passes.

## Suggested Verification Commands

```bash
pnpm run check:refactor:surface:inventory
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run test:types:public
pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts tests/unit/package-subpath-exports.test.ts tests/unit/backend-index-exports.test.ts
git diff --check
```

## Exit Notes To Fill At Sprint End

- Commit: `feat: hard cut backend builder lanes`.
- Old callable builder status: plain handler objects now fail through
  `runtime.query({...})` / `runtime.mutation({...})`; operation/projection
  objects still use that callable path as a tracked temporary shim until the
  operation projection slice replaces it.
- Harness/example imports converted: harness backend/auth/MCP server files,
  `examples/01-public-todo`, `examples/02-auth-todo`, and the representative
  `examples/03-team-workspace` backend/auth/domain files now use
  `@lupinum/trellis/backend` or explicit lane builders.
- Representative explicit-lane handlers converted: harness posts,
  organizations, comments, tasks, MCP keys, cross-tenant probes,
  `functionsProbe`, public todo, auth todo, and team workspace todo/workspace
  paths.
- Tests run:
  - `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts tests/unit/package-subpath-exports.test.ts tests/unit/backend-index-exports.test.ts tests/unit/module-validation.test.ts tests/unit/cli-doctor.test.ts`
  - `pnpm run test:types:public`
  - `pnpm run check:publish-surface`
  - `pnpm run check:refactor:surface:inventory`
  - `pnpm run check:docs:api-surface`
  - `pnpm run dev:prepare`
  - `git diff --check`
  - `pnpm run test:types:harness-server` still fails on existing duplicate
    Convex dependency type drift, operation typing drift, and generated harness
    API shape drift. The Sprint 3 unsafe lane `bypass` typing errors are fixed.
- Remaining old `@lupinum/trellis/functions` hits: 48 non-historical import
  hits remain, owned by docs/templates, bridge extraction, later examples
  (`04`-`08`), generated resource templates, and test/build alias fixtures.
- Remaining old builder spelling hits: remaining direct `query(...)` /
  `mutation(...)` hits in converted scope are raw Convex generated builders or
  operation projection shims; later examples still need explicit-lane
  conversion.
- Recommended Sprint 4: convert starter templates and resource generators to
  `@lupinum/trellis/backend` plus explicit lanes, then remove beginner docs
  references to the old functions path.
