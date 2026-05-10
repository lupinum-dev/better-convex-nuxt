# Sprint 64: Delete Hidden Compatibility Aliases

## Summary

Close the last practical Slice 11 cleanup by deleting hidden test/runtime
compatibility aliases for removed 1.0 public paths. Sprint 63 proved old public
imports fail at the type/public-surface boundary. This sprint makes the repo
itself stop depending on hidden aliases that keep those old names alive during
tests.

Owner: Codex.

## Why This Sprint Comes Next

The remaining Slice 11 delete items are:

- delete old paths after codemod tests pass;
- delete compatibility aliases not listed in the plan;
- establish one supported 1.0 API shape.

The current scan shows `vitest.config.ts` still aliases
`@lupinum/trellis/functions` to `src/runtime/functions/index.ts` for unit and
Convex tests. That is not a package export, but it is still a hidden old public
specifier. Keeping it makes tests less honest: a test can import a deleted 1.0
public path and pass locally.

This sprint should remove that alias and convert remaining tests/fixtures to
canonical 1.0 imports or explicit internal source imports.

## Constraints

- Do not re-add `@lupinum/trellis/functions` to package exports,
  `typesVersions`, tsconfig paths, Vitest aliases, or generated docs.
- Do not create a new alias with the old name under another config file.
- Do not rename `src/runtime/functions/**` in this sprint. That internal source
  directory still owns backend implementation code; the public path is
  `@lupinum/trellis/backend`.
- Do not rewrite historical planning docs or migration test fixtures that
  intentionally contain old strings as test data.
- Prefer canonical package-style imports in app/example-facing tests:
  `@lupinum/trellis/backend`.
- Use relative `src/runtime/functions/**` imports only for tests that are
  explicitly testing internal implementation modules.

## Work Items

### 1. Inventory Hidden Old Public Specifiers

- [ ] Search runtime/test/config code for `@lupinum/trellis/functions` and
      `@lupinum/trellis/bridge`.
- [ ] Classify each hit as: - intentional migration test data; - historical/meta text; - hidden compatibility alias; - test import that should use `@lupinum/trellis/backend`; - internal implementation import that should use a relative source path.
- [ ] Record the classification in this sprint doc or the Slice 11 notes.

### 2. Delete Vitest Compatibility Aliases

- [ ] Remove `@lupinum/trellis/functions` aliases from all Vitest projects.
- [ ] Confirm no `@lupinum/trellis/bridge` alias exists in test config.
- [ ] Add or update a repo policy/public-surface test proving old public
      specifiers do not appear in config aliases.
- [ ] Keep `@lupinum/trellis/backend` and `@lupinum/trellis-bridge` aliases
      where tests need canonical package-style imports.

### 3. Convert Affected Imports

- [ ] Convert tests that import the old public specifier to
      `@lupinum/trellis/backend` when they model consumer-facing backend usage.
- [ ] Convert implementation-unit tests to explicit relative imports from
      `src/runtime/functions/**` only when they need internals not exported from
      the backend public surface.
- [ ] Keep migration tests that embed `@lupinum/trellis/functions` as old input
      strings.
- [ ] Do not broaden backend exports just to satisfy tests.

### 4. Prove The Hard Cut

- [ ] Existing removed-subpath type test still passes.
- [ ] Package subpath export test still proves `./functions` and `./bridge` are
      absent.
- [ ] `rg` over source/config/test imports has no active
      `@lupinum/trellis/functions` import outside intentional migration test
      data and historical/meta docs.
- [ ] `trellis upgrade --write` tests still pass and retain old strings only as
      fixture input.

### 5. Update Trackers

- [ ] Mark Slice 11 "Delete compatibility aliases not listed in this plan"
      complete only after the Vitest aliases are gone and tested.
- [ ] Mark Slice 11 "Delete old paths after codemod tests pass" complete only if
      no active old public path remains in code/config.
- [ ] Mark Slice 11 "There is one supported 1.0 API shape" complete only if the
      remaining old strings are migration tests or historical notes.
- [ ] Add a Sprint 64 completion note to the 1.0 refactor tracker.
- [ ] Do not mark cross-repo Ginko/example gate complete in this sprint.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/package-subpath-exports.test.ts tests/unit/cli-upgrade.test.ts`
- [ ] `pnpm exec vitest run --project=unit tests/unit/functions-index-exports.test.ts tests/unit/backend-index-exports.test.ts`
- [ ] `pnpm run test:types:public`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm exec oxfmt --check vitest.config.ts tests meta/refactor/sprint64-delete-hidden-compat-aliases-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- The repo no longer has hidden test aliases for deleted public Trellis
  specifiers.
- Active code/config imports use the 1.0 public path
  `@lupinum/trellis/backend` or explicit internal source imports.
- Old public names remain only as migration test inputs, historical notes, or
  explicit deleted-path assertions.
- Slice 11 can be closed locally, leaving cross-repo examples/Ginko validation
  as the next gate.
