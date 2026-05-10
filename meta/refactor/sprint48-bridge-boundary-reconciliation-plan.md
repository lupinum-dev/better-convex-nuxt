# Sprint 48: Bridge Boundary Reconciliation

## Goal

Reconcile Slice 9 with the current repository state and make the bridge package
boundary enforceable. The bridge runtime and manifest helpers already moved into
`@lupinum/trellis-bridge`; this sprint should prove that normal Trellis app/core
surfaces do not import or expose bridge code.

## Why This Comes Next

Slice 8 now has an inventory-backed `trellis explain operation <id>` path. Slice
9 is still marked pending, but earlier sprints already created
`packages/trellis-bridge`, removed the root bridge export, and moved the bridge
tests to the package boundary. The remaining risk is stale tracker state and
unproven import direction, not missing bridge implementation.

This sprint follows the refactor rule: do not add another bridge path when the
right work is to verify the single package boundary and delete stale claims.

## Non-Goals

- Do not move bridge runtime code again.
- Do not add compatibility aliases for old bridge imports.
- Do not restore a root `trellis bridge` command.
- Do not redesign bridge package APIs.
- Do not rewrite broad public docs; leave docs cleanup to the docs/migration
  slices unless a stale reference blocks the boundary check.
- Do not run full Ginko cross-repo E2E unless the local boundary evidence is
  insufficient.

## Work Items

### 1. Audit Current Boundary Evidence

- [x] Confirm root `package.json` exports and `typesVersions` do not expose
      `./bridge` or `./functions`.
- [x] Confirm backend/root runtime entrypoints do not export bridge helpers.
- [x] Confirm bridge package tests import from `@lupinum/trellis-bridge`.
- [x] Confirm bridge type tests compile against the package boundary.
- [x] Identify any remaining source imports from core/app/runtime code into
      `@lupinum/trellis-bridge` or `packages/trellis-bridge`.

### 2. Add Or Strengthen One Directional Boundary Check

- [x] Prefer extending an existing repo policy or unit test if it can express
      the boundary cleanly.
- [x] If no existing check fits, add one focused check that fails when Trellis
      core/runtime/CLI code imports `@lupinum/trellis-bridge` or reaches into
      `packages/trellis-bridge`.
- [x] Allow bridge package code and bridge tests to import bridge package
      internals where they own that surface.
- [x] Keep the check narrow: this is an import-direction invariant, not a broad
      documentation scanner.

### 3. Reconcile Slice 9 Tracker

- [x] Mark Slice 9 items complete only when current tests/checks prove them.
- [x] Leave package-author docs and full Ginko E2E open unless they are proven
      in this repo.
- [x] Add a sprint note explaining which bridge extraction items were already
      completed by earlier sprints and which remain intentionally open.

### 4. Verification

- [x] `pnpm exec vitest run --project=unit tests/unit/bridge-package-exports.test.ts tests/unit/package-subpath-exports.test.ts tests/unit/backend-index-exports.test.ts`
- [x] `pnpm run test:types:bridge`
- [x] Boundary check added or strengthened in this sprint.
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:refactor:surface:inventory`
- [x] `pnpm exec oxfmt --check meta/refactor/sprint48-bridge-boundary-reconciliation-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Notes

- Added the directional bridge boundary to `check:repo-policies` instead of
  creating a second policy scanner.
- Updated the stale package-subpath test expectations for backend and
  trusted-forwarding ESM entries to match the current publish surface.

## Done Means

- Slice 9 no longer implies bridge code is missing when it already exists.
- A local automated check proves core/root/runtime/CLI code does not depend on
  `@lupinum/trellis-bridge`.
- Root/backend public surfaces still do not expose bridge exports.
- Remaining Slice 9 work is explicit and real, not stale bookkeeping.
