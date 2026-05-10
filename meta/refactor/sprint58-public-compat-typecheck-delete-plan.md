# Sprint 58: Public Compat Typecheck Delete

## Summary

Delete the obsolete `public.compat` type-check path and replace it with explicit
1.0 public type verification.

This sprint should remove the remaining compatibility-shaped verification names:

- `tsconfig.types.public.compat.json`;
- `test:types:public:compat`;
- `package.json` references from `check` and `release:verify`;
- docs wording that describes the public type check as a compatibility check.

Owner: Codex.

## Why This Sprint

Slice 1 already decided that `tsconfig.types.public.compat.json` and
`test:types:public:compat` should be deleted or renamed to a 1.0 meaning.
Keeping the compat name now sends the wrong signal: Trellis 1.0 is not carrying
an old public API compatibility lane. It has one public API shape, enforced by
public type tests, publish-surface checks, and upgrade audits.

The replacement should be boring and direct:

```text
test:types:public
```

No alias. No duplicate compat script. No wrapper that keeps the old name alive.

## Constraints

- Do not keep `test:types:public:compat` as an alias.
- Do not keep `tsconfig.types.public.compat.json` as a wrapper around
  `tsconfig.types.public.json`.
- Do not weaken public type coverage.
- Do not broaden the public API to make old compat tests pass.
- Do not edit unrelated docs that use "compatibility" in the normal Nuxt/browser
  sense.
- If docs app still needs to run the root public type config, wire it through the
  existing `test:types:public` script or a clearly named 1.0 script, not a
  compat name.

## Work Items

### 1. Inspect Current Public Type Coverage

- [x] Read `tsconfig.types.public.json` and current public type fixtures.
- [x] Confirm `test:types` already includes `test:types:public`.
- [x] Confirm `test:types:public:compat` is redundant or identify the exact
      coverage it adds.

### 2. Delete Compat-Named Config And Script

- [x] Delete `tsconfig.types.public.compat.json`.
- [x] Remove `test:types:public:compat` from `package.json`.
- [x] Remove the script from `check`.
- [x] Remove the script from `release:verify`.
- [x] Do not add a new alias with the old compat name.

### 3. Preserve Or Replace Any Real Coverage

- [x] If the docs cwd invocation catches a real public type issue that root
      `test:types:public` misses, add an explicitly named 1.0 script such as
      `test:types:public:docs`.
- [x] Otherwise, rely on `test:types:public` plus existing docs/publish surface
      checks.
- [x] Ensure `test:types` remains the canonical aggregate for type verification.

### 4. Update Docs And Surface Inventory Text

- [x] Update docs text that calls this a compatibility check.
- [x] Update `scripts/generate-refactor-surface-inventory.mjs` wording if it
      still describes the compat path as pending.
- [x] Keep historical sprint docs unchanged unless they are current guidance.

### 5. Update Refactor Tracker

- [x] Add a Sprint 58 progress note under Slice 11.
- [x] Mark the `tsconfig.types.public.compat.json` migration row done or update
      it to the final 1.0 public type verification name.
- [x] Mark "Compatibility test configs/scripts are deleted or renamed to
      explicit 1.0 migration checks" complete only if the old compat name is
      gone from active scripts/config/docs.

## Verification

- [x] `rg -n "types\\.public\\.compat|test:types:public:compat|public compat|public compatibility" package.json tsconfig* apps/docs/content/docs scripts src tests`
- [x] `pnpm run test:types:public`
- [ ] `pnpm run test:types` - Fails before this sprint's public type step on existing broad fixture and
      type-primitives issues under `src/cli/starter-fixtures/**`,
      `src/cli/add-fixtures/**`, `src/module-internals/starter-fixture-codegen.ts`,
      and `src/runtime/type-primitives/index.ts`.
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec vitest run --project=unit tests/unit/public-surface-inventory-script.test.ts tests/unit/api-surface-doc.test.ts`
- [x] `pnpm exec oxfmt --check package.json apps/docs/content/docs/13.api-reference/8.type-primitives.md scripts/generate-refactor-surface-inventory.mjs meta/refactor/sprint58-public-compat-typecheck-delete-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Done Means

- No active package script, config file, or current docs page uses the
  `public.compat` type-check name.
- Public type verification still runs through the 1.0 public type script.
- `check` and `release:verify` no longer invoke compatibility-named checks.
- Slice 11 no longer has the public compat typecheck as an unresolved hard-cut
  item.
