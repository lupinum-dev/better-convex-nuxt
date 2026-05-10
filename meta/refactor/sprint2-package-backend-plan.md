# Sprint 2: Package Boundary And Backend Builder Foundation

Status: planned
Owner: Matthias

Sprint 2 starts the hard cut from the Sprint 1 decisions. The goal is not to
finish bridge extraction or convert every handler. The goal is to create the
1.0 package/backend shape in code, prove the old public surfaces are no longer
the source of truth, and leave the repo ready for the larger conversion slices.

## Decisions From Sprint 1

- `@lupinum/trellis/backend` is the canonical 1.0 backend subpath.
- `@lupinum/trellis/functions` is deleted as a public 1.0 path.
- Backend builders use explicit trust lanes:
  - `query.public(...)`
  - `query.protected(...)`
  - `mutation.public(...)`
  - `mutation.protected(...)`
  - `mutation.unsafe(...)`
- Bridge APIs move out of core/functions and into bridge-owned tooling.
- `cms` is not a Trellis beginner starter.
- `workspace-mcp` is canonical; `workspace --mcp` is deleted.

## Non-Goals

- Do not finish signed forwarding hard cut in this sprint.
- Do not finish bridge package extraction in this sprint.
- Do not migrate Ginko CMS in this sprint.
- Do not convert every example and starter in this sprint.
- Do not add compatibility aliases for old public paths.

## Work Items

### 1. Create The Backend Subpath

- [ ] Add `src/runtime/backend/index.ts` as the canonical 1.0 backend barrel.
- [ ] Move or re-export only backend-owned APIs from the old functions barrel.
- [ ] Add `./backend` to `package.json` exports.
- [ ] Remove `./functions` from `package.json` exports.
- [ ] Update public type surface tests to import backend APIs from
      `@lupinum/trellis/backend`.
- [ ] Add a negative type/public-surface test proving
      `@lupinum/trellis/functions` is not a public export.

### 2. Split Bridge From Backend Surface

- [ ] Inventory every export currently leaving through
      `src/runtime/functions/index.ts`.
- [ ] Move component bridge creation, manifest helpers, render helpers, and
      bridge package-author types out of the backend barrel.
- [ ] If the bridge package shell does not exist yet, create only the minimum
      package boundary needed to host those exports.
- [ ] Add a boundary test proving backend/root exports do not expose bridge
      APIs.
- [ ] Leave broader bridge CLI/runtime migration to the bridge extraction slice.

### 3. Add Explicit Builder Lane API

- [ ] Add `query.public(...)`, `query.protected(...)`, `mutation.public(...)`,
      `mutation.protected(...)`, and `mutation.unsafe(...)` entrypoints.
- [ ] Make the lane metadata visible to tests/doctor/inventory, even if the
      inventory engine is still simple.
- [ ] Keep implementation boring: delegate into the existing handler pipeline
      internally while the old API is being removed.
- [ ] Do not keep a compatibility story for old builder spelling once converted
      tests pass.

### 4. Remove Accidental Public Semantics

- [ ] Identify current tests or fixtures where missing guard implies public
      behavior.
- [ ] Convert them to explicit `query.public(...)` or `mutation.public(...)`.
- [ ] Add a failure test for an unclassified handler/builder call.
- [ ] Add a failure test for a protected handler missing principal/actor wiring.
- [ ] Preserve the distinction between missing actor resolver wiring and a
      resolved-null actor.

### 5. Update First Consumer Surface

- [ ] Convert the smallest representative backend tests to
      `@lupinum/trellis/backend`.
- [ ] Convert the smallest representative fixture/template imports from
      `@lupinum/trellis/functions` to `@lupinum/trellis/backend`.
- [ ] Do not bulk-convert all starters yet unless needed to keep tests green.
- [ ] Record remaining old import hits in the Sprint 2 exit notes.

### 6. Keep The Inventory Honest

- [ ] Regenerate `meta/refactor/sprint1-public-surface-inventory.md`.
- [ ] Update the inventory generator if the new `backend` export or removed
      `functions` export changes the public surface.
- [ ] Update `meta/trellis-1.0-refactor-plan.md` checkboxes for completed Slice
      2 and Slice 3 items only.

## Acceptance Criteria

- [ ] `@lupinum/trellis/backend` exists and is the canonical backend import.
- [ ] `@lupinum/trellis/functions` is not present in package exports.
- [ ] Backend public-surface/type tests use `backend`, not `functions`.
- [ ] Bridge helpers are not exported from root/backend.
- [ ] Explicit builder lane API exists and has focused tests.
- [ ] Missing/unclassified backend trust lane fails.
- [ ] Existing focused backend/function tests pass after conversion.
- [ ] `pnpm run check:refactor:surface:inventory` passes.
- [ ] `pnpm run check:docs:api-surface` passes or its generated docs changes are
      committed intentionally.
- [ ] `pnpm run check:publish-surface` passes.
- [ ] `git diff --check` passes.

## Suggested Verification Commands

```bash
pnpm run check:refactor:surface:inventory
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts
pnpm exec vitest run --project=unit tests/unit/runtime-facade-boundaries.test.ts
git diff --check
```

## Exit Notes To Fill At Sprint End

- Commit:
- Backend export shape:
- Bridge exports removed from backend/root:
- Builder lanes implemented:
- Tests run:
- Remaining old `@lupinum/trellis/functions` hits:
- Remaining old builder spelling hits:
