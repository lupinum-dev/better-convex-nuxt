# Sprint 67: Ginko Bridge Package Boundary Closure

## Summary

Close the already-migrated Ginko bridge package-boundary items with evidence:
package dependencies, authored bridge imports, CLI bridge ownership, and
package-boundary tests should prove Ginko uses `@lupinum/trellis-bridge` for
release-facing bridge APIs and does not rely on deleted Trellis core bridge
paths.

This sprint should be verification-first. If the evidence is already true, mark
the tracker complete. If a live old path is found, fix that exact path. Do not
add compatibility aliases.

## Why This Sprint

Sprint 65 recorded that Ginko already declares `@lupinum/trellis-bridge`.
Sprint 66 removed the active MCP `tool.fromOperation(...)` use. The next open
cross-repo items are:

- add `@lupinum/trellis-bridge` dependency where Ginko package-author code needs
  bridge APIs;
- migrate authored bridge manifest code, generated manifest contract, CLI bridge
  checks, module startup validation, and dependencies away from
  `@lupinum/trellis/functions` and `@lupinum/trellis/bridge`.

The local scan suggests these may already be complete in source. This sprint
turns that assumption into a committed proof.

## Non-Goals

- Do not migrate raw `_trustedForwardingKey` / `_trustedForwarding` generated
  artifacts in this sprint.
- Do not regenerate Ginko Convex generated files unless a package-boundary test
  proves generated source is stale.
- Do not run the full packed-package Ginko E2E unless the focused package
  boundary evidence requires it.
- Do not change Trellis bridge APIs.
- Do not mark the full Ginko cross-repo gate complete.

## Action Plan

### 1. Verify Ginko Package Dependencies

- [ ] Confirm root `package.json`, `packages/cms/package.json`, and
      `packages/convex/package.json` declare `@lupinum/trellis-bridge`.
- [ ] Confirm no Ginko package still imports bridge APIs from
      `@lupinum/trellis/functions`.
- [ ] Confirm no Ginko package still imports from `@lupinum/trellis/bridge`.

### 2. Verify Authored Bridge Ownership

- [ ] Inspect `packages/cms/src/module/bridge-manifest.ts`,
      `packages/cms/src/module/convex.ts`, and `packages/cms/src/cli/ginko-cms.ts`.
- [ ] Confirm authored Ginko bridge manifest/check/CLI code imports bridge
      helpers from `@lupinum/trellis-bridge`.
- [ ] Confirm Ginko CLI remains the owner of user-facing bridge commands
      (`ginko-cms bridge ...`), not Trellis root CLI.

### 3. Run Focused Ginko Boundary Tests

- [ ] Run `pnpm exec vitest run test/module/package-boundaries.test.ts`.
- [ ] Run `pnpm exec vitest run test/module/manifest.test.ts test/module/module-bridge.test.ts`.
- [ ] Run any existing publish-specifier/package-surface check if cheap and
      stable.
- [ ] Record any failures as blockers instead of weakening tests.

### 4. Update Trellis Tracker

- [ ] Mark the Ginko `@lupinum/trellis-bridge` dependency item complete only
      after package dependency evidence passes.
- [ ] Mark the authored bridge/import migration item complete only after focused
      package-boundary tests pass.
- [ ] Add a Sprint 67 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Leave raw forwarding, docs wording, packed package install, full
      `pnpm run check`, and full bridge package/e2e gates open.

### 5. Verify Trellis Plan State

- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check meta/refactor/sprint67-ginko-bridge-package-boundary-closure-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check` in Trellis and Ginko.

## Done Means

- Ginko package dependencies explicitly include `@lupinum/trellis-bridge` where
  bridge package-author code needs it.
- Ginko release-facing authored bridge code does not import deleted Trellis
  bridge APIs from root/core paths.
- Focused Ginko package-boundary tests prove the package split.
- Trellis tracker marks only the verified bridge package-boundary items
  complete.
- Raw forwarding and full packed-package validation remain honestly open.
