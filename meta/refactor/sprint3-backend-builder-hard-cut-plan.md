# Sprint 3: Backend Builder Hard Cut

Status: planned
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

- [ ] Convert `apps/harness/convex/functions.ts` to
      `@lupinum/trellis/backend`.
- [ ] Convert `apps/harness/convex/functionsProbe.ts` imports to
      `@lupinum/trellis/backend`.
- [ ] Convert `apps/harness/convex/auth/*` type/value imports to backend.
- [ ] Convert the smallest public example backend import to backend.
- [ ] Convert the smallest authenticated/workspace example backend import to
      backend.
- [ ] Avoid bulk doc rewrites unless they are needed for surface checks.

### 2. Convert Builder Spellings In Focused Code

- [ ] Convert representative public handlers from `query(...)` /
      `mutation(...)` to `query.public(...)` / `mutation.public(...)`.
- [ ] Convert representative protected handlers from `query(...)` /
      `mutation(...)` to `query.protected(...)` /
      `mutation.protected(...)`.
- [ ] Convert representative unsafe handlers from `unsafe.query(...)` /
      `unsafe.mutation(...)` to `query.unsafe(...)` /
      `mutation.unsafe(...)` where the handler is part of the new 1.0 surface.
- [ ] Leave legacy unsafe permit-string cleanup to the typed-permits sprint.
- [ ] Record remaining old builder spelling hits with owners.

### 3. Make Unclassified Backend Handlers Fail

- [ ] Add a runtime guard that rejects direct calls to the old callable
      `query(...)` / `mutation(...)` builder after explicit lanes are attached.
- [ ] Preserve the internal implementation path used by explicit lane builders
      without exposing it as a public callable route.
- [ ] Add focused tests proving `runtime.query({...})` and
      `runtime.mutation({...})` fail with an actionable error.
- [ ] Add focused tests proving `runtime.query.public({...})` does not allow a
      `guard` field.
- [ ] Add focused tests proving protected handlers still require explicit
      `guard` and use the existing protected handler pipeline.

### 4. Keep Public And Generated Surfaces Honest

- [ ] Update generated registry/module augmentation tests to use backend.
- [ ] Update dts tests that still teach app-owned imports from functions.
- [ ] Regenerate `meta/refactor/sprint1-public-surface-inventory.md`.
- [ ] Update `meta/trellis-1.0-refactor-plan.md` checkboxes only for completed
      Slice 3 items.
- [ ] Add or update a check that `@lupinum/trellis/functions` does not reappear
      in package exports, generated public types, or beginner templates.

### 5. Document Remaining Cleanup

- [ ] Count remaining `@lupinum/trellis/functions` hits outside historical
      planning/ADR files.
- [ ] Count remaining old callable builder hits in tests/examples/templates.
- [ ] Separate remaining hits into:
      - docs rewrite;
      - templates/fixtures conversion;
      - bridge extraction;
      - typed unsafe permits;
      - historical/planning references.
- [ ] Record the next sprint recommendation in the exit notes.

## Acceptance Criteria

- [ ] Representative harness and example backend imports use
      `@lupinum/trellis/backend`.
- [ ] Representative app handlers use explicit lane builders.
- [ ] Direct `runtime.query({...})` and `runtime.mutation({...})` fail with a
      clear error.
- [ ] Explicit lane builders continue to delegate through the existing backend
      authorization pipeline.
- [ ] Public handlers cannot provide `guard`.
- [ ] Protected handlers cannot accidentally become public.
- [ ] Remaining old import/builder hits are counted and assigned to future
      slices.
- [ ] `pnpm run check:refactor:surface:inventory` passes.
- [ ] `pnpm run check:docs:api-surface` passes or generated docs changes are
      committed intentionally.
- [ ] `pnpm run check:publish-surface` passes.
- [ ] `pnpm run test:types:public` passes.
- [ ] Focused backend/unit tests pass.
- [ ] `git diff --check` passes.

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

- Commit:
- Old callable builder status:
- Harness/example imports converted:
- Representative explicit-lane handlers converted:
- Tests run:
- Remaining old `@lupinum/trellis/functions` hits:
- Remaining old builder spelling hits:
- Recommended Sprint 4:
