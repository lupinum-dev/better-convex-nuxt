# Sprint 69: Ginko Convex Declaration Portability

## Summary

Make `@lupinum/ginko-cms-convex` declaration emit portable again after the
Trellis 1.0 signed-forwarding and backend-builder cutovers.

Sprint 68 proved the generated bridge no longer exposes raw forwarding fields,
but the next cross-repo gate is blocked by TypeScript declaration emit:
exported Ginko Convex functions infer registered-function types through
Trellis' workspace dependency path. This sprint closes that blocker with one
clean type boundary instead of hand-annotating every exported function.

## Why This Sprint

The Trellis 1.0 tracker still needs full Ginko validation before the
cross-repo gate can close:

- packed Trellis packages install into Ginko CMS;
- Ginko CMS `pnpm run check` passes against the refactored Trellis packages;
- the real bridge consumer does not rely on deleted Trellis APIs.

Current focused verification shows:

- Ginko signed bridge forwarding tests pass;
- `tsc -p packages/convex/tsconfig.json --noEmit --declaration false` passes;
- `pnpm --filter @lupinum/ginko-cms-convex run typecheck` fails with TS2883
  because declaration emit cannot name inferred Convex registered-function
  return types without referencing
  `@lupinum/trellis/node_modules/.../convex/server`.

That means the remaining failure is a package typing/declaration portability
problem, not a signed-forwarding behavior problem.

## Non-Goals

- Do not disable declaration emit or remove the Convex package typecheck.
- Do not manually annotate every exported Ginko Convex handler unless a smaller
  boundary fix is proven impossible.
- Do not reintroduce raw `_trustedForwardingKey` / `_trustedForwarding` fields.
- Do not add compatibility aliases for deleted Trellis 1.0 APIs.
- Do not redesign Ginko's bridge registry, schema, or operation descriptors.
- Do not mark the full packed-package gate complete unless it actually runs and
  passes.

## Action Plan

### 1. Reproduce And Classify The Failure

- [x] Run `pnpm --filter @lupinum/ginko-cms-convex run typecheck` in Ginko and
      capture the first representative TS2883 errors.
- [x] Confirm the package still typechecks when declaration emit is bypassed:
      `pnpm exec tsc -p packages/convex/tsconfig.json --noEmit --declaration false`.
- [x] Identify the smallest representative exported query, mutation, action,
      schema, cron, and component definition that emits non-portable types.

### 2. Find The Type Boundary Leak

- [x] Inspect Trellis backend/function builder public declarations and confirm
      whether registered Convex types are exported through a nested dependency
      path instead of the consumer's `convex/server`.
- [x] Inspect Ginko package dependency graph for `convex` and Trellis package
      links to confirm whether this is dependency duplication, exported generic
      ownership, or inferred handler return type leakage.
- [x] Check whether a Trellis-side declaration change can make consumers infer
      portable `convex/server` types without Ginko-side per-export annotations.

### 3. Choose One Source-Of-Truth Fix

- [x] Prefer a single Trellis type-boundary fix if the backend builders are
      leaking Trellis-owned Convex types into consumers.
- [x] Otherwise prefer a small Ginko local helper/type alias that owns exported
      component function typing once.
- [x] Reject broad per-handler annotations unless the investigation proves they
      are the only maintainable option.
- [x] Record the chosen approach in this plan before implementing the broad
      change.

### 4. Implement The Minimal Fix

- [x] Apply the smallest Trellis and/or Ginko code changes needed to make
      declaration emit portable.
- [x] Keep the registered-function source of truth in the backend builders or
      one local helper, not in repeated export annotations.
- [x] Preserve signed-forwarding metadata and operation metadata on exported
      handlers.
- [x] Do not change runtime behavior unless the type-boundary fix requires a
      simplification that tests can prove.

### 5. Verify Ginko

- [x] `pnpm --filter @lupinum/ginko-cms-convex run typecheck`
- [x] `pnpm run typecheck`
- [x] `pnpm exec vitest run test/component/backup.test.ts test/module/bridge-api-parity.test.ts test/module/package-boundaries.test.ts test/refactor/workflow-vertical-slice.test.ts`
- [x] `rg -n "_trustedForwardingKey|_trustedForwarding\\b" packages/cms/src packages/convex/src test/fixtures/basic/convex/ginkoCms test/helpers.ts test/refactor -g '!**/docs/refactor/**'`
      returns no live raw forwarding hits.
- [x] `git diff --check`

### 6. Verify Trellis If Touched

- [x] `pnpm exec vitest run tests/unit/functions-defineTrellis.test.ts tests/unit/trusted-forwarding.test.ts tests/unit/create-component-bridge.test.ts`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec oxfmt --check meta/refactor/sprint69-ginko-convex-declaration-portability-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

### 7. Update The Refactor Tracker

- [x] Add a Sprint 69 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [x] If Ginko Convex package typecheck passes, record that the declaration
      portability blocker from Sprint 68 is closed.
- [x] Leave packed Trellis install, full Ginko `pnpm run check`, and docs/setup
      wording open unless those gates actually pass.

## Completion Notes

- The failure was declaration emit resolving inferred Convex registered-function
  types through Trellis' workspace symlink path. Ginko's Convex package now sets
  `preserveSymlinks: true`, so declaration emit preserves the package boundary
  and names the consumer-visible package path instead of the Trellis workspace
  realpath.
- The only remaining TS2883 after that change was `PermissionFlags` from
  Trellis permission-context definitions. Trellis now exports `PermissionFlags`
  from `@lupinum/trellis/auth`, which makes exported permission-context handler
  results nameable without internal declaration paths.
- Running the broader Ginko typecheck exposed two stale bridge-module call sites
  in `packages/cms/src/bridge/mcp.ts` and `packages/cms/src/bridge/members.ts`.
  They now pass the explicit `functionRefModule` option instead of weakening
  `createBridgeModule` back to the old 3-argument shape.
- `@lupinum/ginko-cms-convex` typecheck and full Ginko `pnpm run typecheck`
  pass. Full `pnpm run check`, packed Trellis install, and docs/setup wording
  remain open for later gates.

## Done Means

- `@lupinum/ginko-cms-convex` declaration emit is portable.
- Ginko Convex package typecheck passes without disabling declarations.
- Signed `_trellisForwarding` remains the only live generated bridge forwarding
  shape.
- The fix has one clear source of truth for exported Convex function typing.
- The Trellis tracker honestly distinguishes this package typing gate from the
  remaining packed-package and docs gates.
