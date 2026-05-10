# Sprint 10: Bridge Package Boundary Hard Cut

## Goal

Move component bridge runtime and package-author APIs out of the Trellis core
package surface and into the `@lupinum/trellis-bridge` package boundary.

Sprint 9 left exactly one maintained example blocker:
`examples/08-component-mini-cms/convex/features/pages/bridge.ts` still imports
`createComponentBridge` from `@lupinum/trellis/functions`. That is not a backend
API. It belongs to the bridge layer. This sprint removes that blocker by making
the bridge layer real enough for source, type, example, and publish-surface
checks.

## Non-Goals

- Do not redesign `createComponentBridge(...)` behavior.
- Do not redesign bridge manifests, managed edits, or generated file format.
- Do not migrate Ginko CMS in this sprint.
- Do not create compatibility exports from `@lupinum/trellis/functions`,
  `@lupinum/trellis/backend`, or `@lupinum/trellis/bridge`.
- Do not keep root `trellis bridge` as an equal supported CLI surface unless
  this sprint explicitly records it as a temporary internal command before the
  CLI extraction sprint.
- Do not change trusted-forwarding semantics beyond preserving current bridge
  tests.

## Work Items

### 1. Package Boundary

- [x] Add a workspace package at `packages/trellis-bridge` named
      `@lupinum/trellis-bridge`.
- [x] Add `packages/*` to `pnpm-workspace.yaml`.
- [x] Give the bridge package its own `package.json`, `src/index.ts`, and
      minimal type/build entry.
- [x] Keep the bridge package dependency graph narrow:
  - [x] may depend on `@lupinum/trellis` only for auth/backend/trusted-forwarding
        types/helpers that are truly core-owned;
  - [x] may depend on Convex and convex-helpers as peers;
  - [x] must not depend on Nuxt runtime, MCP runtime, docs app, devtools, or
        Ginko.
- [x] Do not add a second bridge source of truth.

### 2. Move Bridge Runtime APIs

- [x] Move `createComponentBridge(...)` and related bridge registrar/types from
      `src/runtime/functions/create-component-bridge.ts` to the bridge package.
- [x] Move component bridge manifest authoring/rendering APIs from
      `src/runtime/functions/component-bridge-manifest.ts` to the bridge
      package.
- [x] Move Node bridge package loading/drift/check helpers from
      `src/runtime/bridge/index.ts` to the bridge package.
- [x] Preserve behavior by moving code directly first; simplify only after tests
      are green.
- [x] Keep imports explicit and boring; no re-export chain through Trellis core.

### 3. Delete Old Core Bridge Surface

- [x] Remove bridge exports from `src/runtime/functions/index.ts`.
- [x] Remove `createComponentBridge` from `defineTrellis(...)` return values.
- [x] Remove `./bridge` from root `package.json` exports and `typesVersions`.
- [x] Remove bridge build entries from root `build.config.ts`.
- [x] Remove bridge APIs from root public API docs/surface output.
- [x] Update public-surface inventory generator expectations so
      `@lupinum/trellis/bridge` is no longer a supported 1.0 root package
      subpath.

### 4. Update Consumers

- [x] Update `examples/08-component-mini-cms` to import bridge helpers from
      `@lupinum/trellis-bridge`.
- [x] Remove the example 08 Vitest alias for `@lupinum/trellis/functions`.
- [x] Add an example 08 Vitest alias for `@lupinum/trellis-bridge` to package
      source during local tests.
- [x] Update bridge unit tests to import from `@lupinum/trellis-bridge` package
      source.
- [x] Update bridge type tests to import from `@lupinum/trellis-bridge`.
- [x] Update docs that still teach bridge imports from
      `@lupinum/trellis/functions` or `@lupinum/trellis/bridge`.
- [x] Update historical/meta references only when they are release-facing; leave
      historical sprint notes alone.

### 5. CLI Ownership Decision

- [x] Inspect `src/cli/commands/bridge.ts` and decide whether this sprint:
  - [ ] moves bridge CLI implementation into `packages/trellis-bridge`; or
  - [x] leaves root `trellis bridge` as an internal temporary command with an
        exit note and no public docs.
- [ ] If moving now:
  - [ ] create a bridge-owned CLI entry or command module;
  - [ ] remove root CLI bridge command registration;
  - [ ] update CLI tests.
- [x] If deferring:
  - [x] update root CLI tests/docs so `trellis bridge` is not presented as the
        1.0 public destination;
  - [x] record the remaining CLI extraction as the Sprint 11 blocker.

### 6. Checks And Tests

- [x] Add or update a package-boundary check proving core/root source no longer
      imports bridge implementation code.
- [x] Add or update publish-surface checks proving root package no longer
      exports `@lupinum/trellis/bridge`.
- [x] Add or update public type checks for `@lupinum/trellis-bridge`.
- [x] Ensure `@lupinum/trellis/backend` does not export bridge helpers.
- [x] Ensure maintained examples no longer import bridge helpers from
      `@lupinum/trellis/functions`.

## Verification

Suggested commands:

```bash
pnpm run test:types:public
pnpm run check:publish-surface
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run test:types:contracts
vitest run --project=unit tests/unit/create-component-bridge.test.ts tests/unit/component-bridge-manifest.test.ts tests/unit/bridge-cli.test.ts
pnpm --dir examples/08-component-mini-cms test
pnpm run check:examples:doctor
rg -n "@lupinum/trellis/functions|@lupinum/trellis/bridge|createComponentBridge|defineComponentBridgeManifest|renderComponentBridge" examples/08-component-mini-cms src apps/docs/content meta/skill/references package.json -g '!**/.nuxt/**' -g '!**/.convex/**' -g '!**/node_modules/**'
git diff --check
```

## Acceptance Criteria

- [x] `@lupinum/trellis-bridge` exists as the sole package surface for component
      bridge runtime, manifest, render, drift, and package-author APIs.
- [x] Root `@lupinum/trellis` no longer exports `./bridge`.
- [x] `@lupinum/trellis/functions` no longer exports bridge helpers.
- [x] `defineTrellis(...)` no longer returns `createComponentBridge`.
- [x] Example `08` imports bridge helpers from `@lupinum/trellis-bridge`.
- [x] Bridge unit/type tests import from `@lupinum/trellis-bridge`.
- [x] Public surface docs/checks no longer list `@lupinum/trellis/bridge` as a
      supported package subpath.
- [x] No compatibility shim or dual bridge public path is added.

## Exit Notes To Capture

- [x] Whether root `trellis bridge` was moved, deleted, or left as a temporary
      internal blocker.
- [x] Any remaining bridge references in release-facing docs or package
      surfaces.
- [x] Whether Ginko CMS can consume `@lupinum/trellis-bridge` by package name
      without importing Trellis internals.
- [x] Whether Sprint 11 should tackle bridge CLI extraction, Ginko validation,
      or direct MCP mutation safety metadata.

## Exit Notes

- Root `trellis bridge` was deleted from the root CLI surface for 1.0. Bridge
  package command ownership is deferred to the bridge CLI extraction sprint.
- No release-facing docs or package surfaces still teach
  `@lupinum/trellis/bridge` or bridge helpers from `@lupinum/trellis/functions`.
- Ginko-shaped consumers can import bridge runtime and manifest helpers from
  `@lupinum/trellis-bridge`; full Ginko CMS validation remains out of this
  sprint.
- Sprint 11 should focus on bridge CLI ownership and Ginko package validation
  before broader direct MCP mutation safety metadata.
