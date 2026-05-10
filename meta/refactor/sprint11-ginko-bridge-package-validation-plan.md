# Sprint 11: Ginko Bridge Package Validation

## Goal

Prove the new `@lupinum/trellis-bridge` package boundary against the real
Ginko CMS integration, and remove the remaining release-facing old bridge
imports from Ginko.

Sprint 10 made the Trellis side clean: bridge runtime, manifest, render, drift,
and package-author APIs now live in `@lupinum/trellis-bridge`, while Trellis core
no longer exports `@lupinum/trellis/bridge` or bridge helpers from
`@lupinum/trellis/functions`. This sprint validates that decision in the real
reference bridge consumer without reintroducing shims.

## Non-Goals

- Do not redesign Ginko's bridge manifest shape.
- Do not redesign `createComponentBridge(...)`.
- Do not add compatibility exports back to Trellis core.
- Do not keep `@lupinum/trellis/bridge` or bridge helpers from
  `@lupinum/trellis/functions` as supported paths.
- Do not migrate unrelated Ginko `@lupinum/trellis/functions` imports for
  backend operations unless they are bridge APIs. Backend import cleanup belongs
  to a separate Ginko backend-lane sprint.
- Do not extract a full standalone bridge CLI package unless validation proves
  the Ginko-owned CLI cannot own bridge generation cleanly.

## Current Findings

The Ginko repo at `/Users/matthias/Git/0_libs/WORK/ginko-cms` still has
release-facing old bridge imports:

- `packages/cms/src/cli/ginko-cms.ts`
  - imports `checkBridgeDrift` from `@lupinum/trellis/bridge`;
  - imports manifest/render helpers from `@lupinum/trellis/functions`.
- `packages/cms/src/module/convex.ts`
  - imports `checkBridgeDrift` from `@lupinum/trellis/bridge`.
- `packages/cms/src/module/bridge-manifest.ts`
  - imports bridge manifest helpers/types from `@lupinum/trellis/functions`.
- `packages/cms/convex/manifest.js` and `manifest.d.ts`
  - import bridge manifest APIs/types from `@lupinum/trellis/functions`.
- `packages/convex/src/componentBridge.ts`
  - imports `createComponentBridge` from `@lupinum/trellis/functions`.
- Bridge-focused tests/helpers also import old bridge APIs from
  `@lupinum/trellis/functions`.

That means Sprint 10 is architecturally clean inside Trellis, but the reference
consumer has not yet proven the package boundary.

## Work Items

### 1. Wire Ginko To The Bridge Package

- [ ] Add `@lupinum/trellis-bridge` as an explicit workspace/file dependency in
      the Ginko packages that import bridge APIs.
- [ ] Keep `@lupinum/trellis` as the dependency for core/auth/backend/MCP APIs.
- [ ] Do not make `@lupinum/trellis` depend on `@lupinum/trellis-bridge`.
- [ ] Update Ginko lockfile/workspace state with normal package-manager output.

### 2. Replace Old Bridge Imports In Ginko

- [ ] Replace `@lupinum/trellis/bridge` imports with
      `@lupinum/trellis-bridge`.
- [ ] Replace bridge manifest/render imports from `@lupinum/trellis/functions`
      with `@lupinum/trellis-bridge`.
- [ ] Replace `createComponentBridge` imports from
      `@lupinum/trellis/functions` with `@lupinum/trellis-bridge`.
- [ ] Replace bridge-related type imports such as
      `ComponentBridgeManifest` and `ComponentBridgeComponent` with
      `@lupinum/trellis-bridge`.
- [ ] Leave non-bridge backend APIs from `@lupinum/trellis/functions` untouched
      unless a local file can trivially split imports without changing behavior.

### 3. Ginko CLI Ownership

- [ ] Confirm `ginko-cms bridge generate` remains the user-facing bridge command
      for Ginko consumers.
- [ ] Ensure the Ginko CLI uses `@lupinum/trellis-bridge` helpers directly.
- [ ] Ensure CLI help/remediation text does not point users to root
      `trellis bridge`.
- [ ] Add or update a test proving Ginko owns its bridge command and Trellis root
      does not need to expose a bridge command.

### 4. Package Boundary Checks

- [ ] Update Ginko package-boundary tests to allow `@lupinum/trellis-bridge` and
      reject old bridge imports.
- [ ] Update Ginko publish-specifier checks so package output cannot reference
      `@lupinum/trellis/bridge`.
- [ ] Add a focused check that no release-facing Ginko source imports bridge
      APIs from `@lupinum/trellis/functions`.
- [ ] Keep historical docs/refactor notes out of blocking checks unless they
      are copied into public package docs.

### 5. Validation Against Packed/Local Trellis

- [ ] Run Ginko module/unit tests that cover bridge manifest rendering and CLI
      bridge generation.
- [ ] Run Ginko package-boundary and publish-specifier checks.
- [ ] Run Ginko type checks for `@lupinum/ginko-cms-convex` and
      `@lupinum/ginko-cms`.
- [ ] Run the Ginko package e2e or the narrowest maintained package-consumer
      test that proves a consumer can install Ginko with the bridge package
      dependency.
- [ ] If package e2e needs a packed Trellis dependency, pack both Trellis and
      `@lupinum/trellis-bridge` and wire the fixture explicitly.

### 6. Trellis Regression Checks

- [ ] Re-run Trellis bridge package unit tests.
- [ ] Re-run `pnpm run test:types:bridge`.
- [ ] Re-run `pnpm run check:publish-surface`.
- [ ] Re-run `pnpm run check:docs:api-surface`.
- [ ] Re-run `pnpm run check:refactor:surface:inventory`.
- [ ] Re-run `pnpm run check:cli` to prove root `trellis bridge` stays absent.

## Verification

Suggested Trellis commands:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/create-component-bridge.test.ts \
  tests/unit/component-bridge-manifest.test.ts \
  tests/unit/bridge-package.test.ts \
  tests/unit/bridge-package-exports.test.ts
pnpm run test:types:bridge
pnpm run check:publish-surface
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Suggested Ginko commands:

```bash
pnpm install
pnpm run check:publish-specifiers
pnpm run check:installer-bridge-boundary
pnpm run check:convex-surface
pnpm run typecheck
pnpm run test -- test/module/bridge-api-parity.test.ts test/module/e2e-boot.test.ts test/module/ginko-cli.test.ts
pnpm run package:e2e
```

Targeted source checks:

```bash
rg -n "@lupinum/trellis/bridge" /Users/matthias/Git/0_libs/WORK/ginko-cms \
  -g '!**/node_modules/**' -g '!**/.nuxt/**' -g '!**/.convex/**'
rg -n "createComponentBridge|defineComponentBridgeManifest|renderComponentBridge|ComponentBridge" \
  /Users/matthias/Git/0_libs/WORK/ginko-cms/packages \
  -g '!**/node_modules/**' -g '!**/.nuxt/**' -g '!**/.convex/**'
```

## Acceptance Criteria

- [ ] Ginko release-facing source imports bridge APIs from
      `@lupinum/trellis-bridge`, not from `@lupinum/trellis/functions` or
      `@lupinum/trellis/bridge`.
- [ ] Ginko package dependencies explicitly include `@lupinum/trellis-bridge`
      wherever bridge APIs are imported.
- [ ] `ginko-cms bridge generate` remains the Ginko-owned consumer command.
- [ ] Trellis root CLI remains free of bridge commands.
- [ ] Ginko bridge manifest/render/parity tests pass.
- [ ] Ginko package-boundary and publish-specifier checks reject old bridge
      import paths.
- [ ] Ginko package e2e, or an accepted narrow substitute, proves a consumer can
      use Ginko with `@lupinum/trellis-bridge`.
- [ ] No compatibility shim or old bridge public path is added to Trellis.

## Exit Notes To Capture

- [ ] Whether Ginko needs any bridge package API that is missing from
      `@lupinum/trellis-bridge`.
- [ ] Whether Ginko package e2e can consume the bridge package from workspace,
      file, or packed tarball without Trellis internals.
- [ ] Whether bridge CLI ownership is fully settled in Ginko, or whether a later
      `@lupinum/trellis-bridge` binary is justified.
- [ ] Any remaining old `@lupinum/trellis/functions` imports in Ginko and whether
      they are backend APIs for a future backend-lane cleanup.
- [ ] Whether the next sprint should focus on direct MCP mutation safety
      metadata, forwarding RFC production hardening, or Ginko backend import
      cleanup.
