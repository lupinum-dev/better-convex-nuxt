# Sprint 56: Backend Root Builder Delete

## Summary

Finish Slice 3 by deleting the callable root backend builder shape. After this
sprint, `query`, `mutation`, and `action` returned by `defineTrellis(...)` are
lane containers only:

```ts
query.public(...)
query.protected(...)
query.unsafe(...)
mutation.public(...)
mutation.protected(...)
mutation.unsafe(...)
```

The old spelling:

```ts
query({ ... })
mutation({ ... })
action({ ... })
```

must have no runtime implementation, no docs, and no local call sites.

Owner: Codex.

## Why This Sprint

Slice 3 has proved the behavior, but the old callable root builder still exists
as a runtime rejection wrapper. That is useful during migration, but it is now a
parallel API shape. For 1.0, the trust lane should be visible at the call site
and impossible to omit.

The remaining Done Means items are:

- old builder spelling has no runtime implementation;
- old builder docs are removed.

## Constraints

- Hard cut. Do not keep a callable root builder that only throws.
- Do not add compatibility aliases such as `publicQuery` or `protectedQuery`.
- Do not keep operation/projection passthroughs on the root builder.
- If operation registration currently needs root passthrough, move it to the
  explicit protected lane before deleting the root.
- Preserve explicit lane metadata on registered functions.
- Keep `runtime.unsafe.query` and `runtime.unsafe.mutation` only if they are
  still part of the chosen surface; do not use them as a workaround for root
  builder compatibility.

## Work Items

### 1. Prove No Required Root Operation Path Remains

- [x] Search for direct root backend calls in source, examples, fixtures, docs,
      and tests.
- [x] Pay special attention to operation/projection calls such as
      `mutation(operation)` and `query(previewOf(operation))`.
- [x] Convert any real operation/projection call sites to explicit lanes:
      `mutation.protected(operation)` or `query.protected(previewOf(operation))`.
- [x] Keep a focused test proving operation/projection registration still works
      through explicit lanes.

### 2. Delete The Runtime Root Callable

- [x] Remove `createUnclassifiedLaneBuilder(...)`.
- [x] Change lane attachment so `query`, `mutation`, and `action` are plain
      lane objects, not callable functions.
- [x] Update exported runtime types so `runtime.query(...)` and
      `runtime.mutation(...)` are TypeScript errors.
- [x] Remove runtime tests that expect `runtime.query({...})` to throw.
- [x] Replace them with tests asserting root builders are not callable.

### 3. Delete Old Builder Docs And Examples

- [x] Remove docs snippets that teach `query({ ... })` or `mutation({ ... })`
      for backend handlers.
- [x] Update component bridge/docs fixtures that still use old backend snippet
      text.
- [x] Keep MCP `tool.query(...)` / `tool.mutation(...)` untouched; those are a
      different surface.

### 4. Update Upgrade/Doctor Only If Needed

- [x] If the inventory scanner already detects old root backend calls, keep the
      existing audit path.
- N/A: no broad upgrade regex was added; old root call detection needs import
  aware analysis and should be handled by a future codemod/audit sprint if
  needed.
- [x] Do not add broad regex findings that confuse Convex raw builders,
      generated code, logs, or MCP tool builders.

### 5. Close Slice 3

- [x] Add a Sprint 56 progress note under Slice 3.
- [x] Mark "Old builder spelling has no runtime implementation" complete.
- [x] Mark "Old builder docs are removed" complete.
- [x] Mark Slice 3 status `done` if no residual Slice 3 work remains.

## Verification

- [x] `rg -n 'runtime\\.query\\(|runtime\\.mutation\\(|runtime\\.action\\(' src tests examples apps apps/docs/content/docs`
- [x] `rg -n 'export const .* = (query|mutation|action)\\(' src tests examples apps apps/docs/content/docs`
      returns no Trellis backend handler call sites, excluding raw Convex
      builder fixtures explicitly meant to test non-Trellis code.
- [x] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts`
- N/A: `pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts`;
  upgrade checks did not change.
- [x] `pnpm exec vitest run --project=unit tests/unit/eslint-plugin.test.ts tests/unit/cli-explain.test.ts tests/unit/public-surface-codegen.test.ts`
- [x] `pnpm exec vue-tsc -p tsconfig.types.json --noEmit`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec oxfmt --check src/runtime/functions src/eslint tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts tests/unit/eslint-plugin.test.ts tests/unit/cli-explain.test.ts tests/unit/public-surface-codegen.test.ts apps/docs/content/docs meta/refactor/sprint56-backend-root-builder-delete-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Done Means

- The root backend builder is not callable at runtime.
- TypeScript no longer presents root backend builders as callable public API.
- All backend handler examples use explicit lanes.
- Operation/projection registration still works through explicit lanes.
- Slice 3 is closed or has only clearly documented non-blocking follow-up.
