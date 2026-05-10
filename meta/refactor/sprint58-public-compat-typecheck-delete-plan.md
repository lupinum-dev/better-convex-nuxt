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

- [ ] Read `tsconfig.types.public.json` and current public type fixtures.
- [ ] Confirm `test:types` already includes `test:types:public`.
- [ ] Confirm `test:types:public:compat` is redundant or identify the exact
      coverage it adds.

### 2. Delete Compat-Named Config And Script

- [ ] Delete `tsconfig.types.public.compat.json`.
- [ ] Remove `test:types:public:compat` from `package.json`.
- [ ] Remove the script from `check`.
- [ ] Remove the script from `release:verify`.
- [ ] Do not add a new alias with the old compat name.

### 3. Preserve Or Replace Any Real Coverage

- [ ] If the docs cwd invocation catches a real public type issue that root
      `test:types:public` misses, add an explicitly named 1.0 script such as
      `test:types:public:docs`.
- [ ] Otherwise, rely on `test:types:public` plus existing docs/publish surface
      checks.
- [ ] Ensure `test:types` remains the canonical aggregate for type verification.

### 4. Update Docs And Surface Inventory Text

- [ ] Update docs text that calls this a compatibility check.
- [ ] Update `scripts/generate-refactor-surface-inventory.mjs` wording if it
      still describes the compat path as pending.
- [ ] Keep historical sprint docs unchanged unless they are current guidance.

### 5. Update Refactor Tracker

- [ ] Add a Sprint 58 progress note under Slice 11.
- [ ] Mark the `tsconfig.types.public.compat.json` migration row done or update
      it to the final 1.0 public type verification name.
- [ ] Mark "Compatibility test configs/scripts are deleted or renamed to
      explicit 1.0 migration checks" complete only if the old compat name is
      gone from active scripts/config/docs.

## Verification

- [ ] `rg -n "types\\.public\\.compat|test:types:public:compat|public compat|public compatibility" package.json tsconfig* apps/docs/content/docs scripts src tests`
- [ ] `pnpm run test:types:public`
- [ ] `pnpm run test:types`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec vitest run --project=unit tests/unit/public-surface-inventory-script.test.ts tests/unit/api-surface-doc.test.ts`
- [ ] `pnpm exec oxfmt --check package.json apps/docs/content/docs/13.api-reference/8.type-primitives.md scripts/generate-refactor-surface-inventory.mjs meta/refactor/sprint58-public-compat-typecheck-delete-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- No active package script, config file, or current docs page uses the
  `public.compat` type-check name.
- Public type verification still runs through the 1.0 public type script.
- `check` and `release:verify` no longer invoke compatibility-named checks.
- Slice 11 no longer has the public compat typecheck as an unresolved hard-cut
  item.
