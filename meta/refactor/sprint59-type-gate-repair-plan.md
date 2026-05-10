# Sprint 59: Type Gate Repair

## Summary

Restore the aggregate `pnpm run test:types` gate after the 1.0 hard cuts,
without broadening public API or pretending fixture source belongs to the root
Nuxt app.

Sprint 58 removed the obsolete public compatibility type-check lane. The direct
1.0 public type check passes, but the aggregate `test:types` currently fails
before reaching all subchecks because the root Nuxt typecheck and a few type
exports are out of sync with the refactor.

Owner: Codex.

## Why This Sprint

`test:types` is a release-gate command. Leaving it red makes later refactor
sprints harder to trust.

The failure has two separate causes:

1. `vue-tsc -p tsconfig.nuxt.json --noEmit` includes standalone starter/add
   fixture source under `src/cli/starter-fixtures/**` and
   `src/cli/add-fixtures/**`. Those files are generated app sources, not part of
   the root Trellis Nuxt runtime. They need their own fixture validation, not
   the root `.nuxt` type environment.
2. `src/runtime/type-primitives/index.ts` still expects operation registry types
   from `@lupinum/trellis/backend`, but the backend barrel no longer re-exports
   all of them after the 1.0 surface cleanup.
3. The canonical examples still used older Convex-era dependency versions, so
   their typecheck ran against a second Convex type universe.

## Constraints

- Do not make starter fixture files compile by adding root-only aliases or fake
  generated Convex files to the root app.
- Do not weaken fixture validation. Fixture apps are validated through starter
  fixture checks, generated output checks, and their own app contexts.
- Do not re-export old APIs just to satisfy stale type imports.
- Do not add compatibility aliases.
- Prefer one canonical owner for each type:
  - backend operation registry types stay owned by the backend/functions public
    surface;
  - starter fixture source stays owned by fixture validation, not root Nuxt
    typecheck.

## Work Items

### 1. Reproduce And Classify The Current Failure

- [x] Run `pnpm run test:types`.
- [x] Record the failure groups in this sprint doc:
      root fixture inclusion, type-primitives/backend export drift, and any
      remaining true runtime type error.
- [x] Do not fix by suppressing diagnostics globally.

### 2. Fix Root Nuxt Typecheck Scope

- [x] Update `tsconfig.nuxt.json` so root `vue-tsc` excludes
      `src/cli/starter-fixtures/**` and `src/cli/add-fixtures/**`.
- [x] Keep `src/cli/**` implementation files included.
- [x] Verify root Nuxt typecheck no longer treats generated starter app files as
      root app code.
- [x] Confirm starter fixture validation still owns fixture correctness.

### 3. Repair Type-Primitives Operation Registry Exports

- [x] Decide the canonical public owner for operation registry types used by
      `@lupinum/trellis/type-primitives`.
- [x] Prefer re-exporting existing public types from `@lupinum/trellis/backend`
      if they are part of the 1.0 contract.
- [x] Avoid a second `type-primitives` import path; `backend` remains the
      canonical public owner for these operation registry types.
- [x] Add or adjust a public type test if the operation registry type surface is
      meant to remain public.

### 4. Fix Real Runtime Type Errors

- [x] Fix the `src/module-internals/starter-fixture-codegen.ts` strictness issue
      directly, not with a cast that hides invalid manifest paths.
- [x] Run `vue-tsc -p tsconfig.nuxt.json --noEmit` after each fix until the root
      typecheck is clean.

### 5. Align Canonical Example Type Gates

- [x] Align maintained examples and harness package manifests to the repo's
      current Convex, Better Auth, TypeScript, Vitest, and `convex-test`
      versions.
- [x] Align doctor fixture package manifests so the workspace installs one
      Convex version.
- [x] Add the bridge package's direct Convex dev dependency so bridge type tests
      do not resolve a different peer copy.
- [x] Repair stale example tests after confirmation-token moved under
      `functions`.
- [x] Keep destructive confirmation typing local to the generated API call sites
      instead of adding a compatibility surface.

### 6. Update Refactor Tracker

- [x] Add a Sprint 59 note under Slice 13 verification or the most relevant
      active slice.
- [x] Mark type checks complete only if `pnpm run test:types` passes.
- [x] If fixture validation reveals separate fixture failures, open a follow-up
      sprint instead of folding unrelated fixture app work into this one.

## Verification

- [x] `pnpm exec vue-tsc -p tsconfig.nuxt.json --noEmit`
- [x] `pnpm run test:types:public`
- [x] `pnpm run test:types`
- [x] `pnpm run build:cli && pnpm run check:starter-fixtures`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec vitest run --project=unit tests/unit/api-surface-doc.test.ts tests/unit/runtime-facade-boundaries.test.ts`
- [x] `pnpm exec eslint examples/04-saas-platform/convex/projectBoard.test.ts examples/05-visibility-access/convex/knowledgeBase.test.ts --ignore-pattern '**/_generated/**'`
- [x] `pnpm exec oxfmt --check ...`
- [x] `git diff --check`

## Result

- Root Nuxt typecheck now excludes starter/add fixture app source while keeping
  CLI implementation source in scope.
- `@lupinum/trellis/backend` re-exports the operation registry types consumed by
  `@lupinum/trellis/type-primitives`.
- Maintained examples and doctor fixtures no longer install a second Convex
  type universe.
- Starter fixture validation still owns generated starter correctness and passes
  after rebuilding the CLI fixture assets.

## Done Means

- `pnpm run test:types` passes.
- Root Nuxt typecheck no longer compiles generated starter fixture app source as
  Trellis runtime source.
- Public operation registry types have one canonical public owner.
- No compatibility alias or fake generated fixture state is added.
