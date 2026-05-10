# Sprint 60: Lint Gate Repair

## Summary

Restore the full `pnpm run lint` gate after the 1.0 hard cuts, without hiding
real issues behind broad disables and without folding unrelated architecture work
into lint cleanup.

Sprint 59 restored the aggregate type gate. The remaining verification gap in
Slice 13 is lint/format. `pnpm run lint` now reaches ESLint and fails on a small
set of concrete findings across CLI, fixture source, backend overload/types,
example tests, and type-only test files.

Owner: Codex.

## Why This Sprint

A green type gate is not enough for the 1.0 refactor. Lint is currently red, so
later sprints can accidentally add debt while assuming the repo is clean. The
failures are narrow enough to fix directly.

Current failure groups from `pnpm run lint`:

1. Example tests import confirmation-token helpers through repo-local runtime
   paths and need a clean test-only/package-safe path or a local test helper.
2. `src/cli/add-fixtures/uploads/app/pages/uploads.vue` violates the Vue
   multi-word component rule.
3. `src/cli/commands/upgrade.ts` has one useless regex non-capturing group.
4. `src/cli/starter-fixtures/workspace/convex/schema.ts` has unused imports.
5. `src/runtime/auth/define-permission.ts` has combinable overloads.
6. `src/runtime/functions/index.ts` has lint debt around unused `unsafe`,
   explicit `any`, and invalid `void` union types.
7. `tests/types/mcp-runtime.types.ts` has an unused expression in a type test.

## Constraints

- Do not make `pnpm run lint` pass by adding broad file-level disables.
- Do not weaken `no-restricted-imports` for package-consumer example code.
- Do not re-export internal confirmation-token helpers as public API just to
  satisfy example tests.
- Do not turn lint cleanup into a redesign of the backend builder types.
- Prefer deleting unused code/imports over renaming to `_` or suppressing.
- Keep fixture source valid as copied starter app code; do not add root-only
  assumptions to fixture files.

## Work Items

### 1. Reproduce And Classify

- [ ] Run `pnpm run lint` from a clean working tree state.
- [ ] Record the exact failure groups in this sprint doc if they differ from the
      current list.
- [ ] Separate sprint-introduced issues from older repo-wide lint debt.

### 2. Repair Example Confirmation Helpers

- [ ] Decide the cleanest owner for test-only confirmation-token signing used by
      examples.
- [ ] Prefer a local test helper under each example or a shared test fixture
      helper that does not become public package API.
- [ ] Remove repo-local runtime imports from example app/test code.
- [ ] Keep destructive confirmation test coverage intact.

### 3. Fix Fixture And CLI Findings

- [ ] Rename or annotate the uploads fixture page so it satisfies Vue
      multi-word component naming as generated starter code.
- [ ] Simplify the useless non-capturing group in `src/cli/commands/upgrade.ts`.
- [ ] Delete unused imports from the workspace starter fixture schema.
- [ ] Run the relevant fixture/starter checks after touching fixture source.

### 4. Fix Backend Type Lint Findings

- [ ] Combine the permission overload signatures without changing public
      behavior.
- [ ] Remove the unused `unsafe` import/reference from
      `src/runtime/functions/index.ts` if it is genuinely unused.
- [ ] Replace explicit `any` and `void` union types in
      `src/runtime/functions/index.ts` with existing local type aliases or
      narrower direct types.
- [ ] Keep the backend public type tests green.

### 5. Fix Type Test Lint Finding

- [ ] Replace the unused expression in `tests/types/mcp-runtime.types.ts` with a
      real assignment/assertion pattern that keeps the type assertion meaningful.

### 6. Update Trackers

- [ ] Add a Sprint 60 note to the 1.0 refactor tracker.
- [ ] Mark Slice 13 lint/format checks complete only after `pnpm run lint` and
      formatting checks pass.

## Verification

- [ ] `pnpm run lint`
- [ ] `pnpm run test:types`
- [ ] `pnpm run build:cli && pnpm run check:starter-fixtures`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec vitest run --project=unit tests/unit/api-surface-doc.test.ts tests/unit/runtime-facade-boundaries.test.ts`
- [ ] `pnpm exec oxfmt --check ...touched files...`
- [ ] `git diff --check`

## Done Means

- `pnpm run lint` passes without broad disables.
- Example code no longer imports repo-local runtime internals.
- Fixture source remains generated-app-valid and starter validation passes.
- Backend type lint fixes preserve the public 1.0 type gate.
- Slice 13 lint/format tracking reflects the actual verified state.
