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

- [x] Add `@lupinum/trellis-bridge` as an explicit workspace/file dependency in
      the Ginko packages that import bridge APIs.
- [x] Keep `@lupinum/trellis` as the dependency for core/auth/backend/MCP APIs.
- [x] Do not make `@lupinum/trellis` depend on `@lupinum/trellis-bridge`.
- [x] Update Ginko lockfile/workspace state with normal package-manager output.

### 2. Replace Old Bridge Imports In Ginko

- [x] Replace `@lupinum/trellis/bridge` imports with
      `@lupinum/trellis-bridge`.
- [x] Replace bridge manifest/render imports from `@lupinum/trellis/functions`
      with `@lupinum/trellis-bridge`.
- [x] Replace `createComponentBridge` imports from
      `@lupinum/trellis/functions` with `@lupinum/trellis-bridge/component`.
- [x] Replace bridge-related type imports such as
      `ComponentBridgeManifest` and `ComponentBridgeComponent` with
      `@lupinum/trellis-bridge` or `@lupinum/trellis-bridge/component`.
- [x] Replace remaining Ginko backend API imports from
      `@lupinum/trellis/functions` with `@lupinum/trellis/backend` because the
      Ginko compile exposed the same package-boundary drift and the change was a
      direct hard cut.

### 3. Ginko CLI Ownership

- [x] Confirm `ginko-cms bridge generate` remains the user-facing bridge command
      for Ginko consumers.
- [x] Ensure the Ginko CLI uses `@lupinum/trellis-bridge` helpers directly.
- [x] Ensure CLI help/remediation text does not point users to root
      `trellis bridge`.
- [x] Add or update a test proving Ginko owns its bridge command and Trellis root
      does not need to expose a bridge command.

### 4. Package Boundary Checks

- [x] Update Ginko package-boundary tests to allow `@lupinum/trellis-bridge` and
      reject old bridge imports.
- [x] Update Ginko publish-specifier checks so package output cannot reference
      `@lupinum/trellis/bridge`.
- [x] Add a focused check that no release-facing Ginko source imports bridge
      APIs from `@lupinum/trellis/functions`.
- [x] Keep historical docs/refactor notes out of blocking checks unless they
      are copied into public package docs.

### 5. Validation Against Packed/Local Trellis

- [x] Run Ginko module/unit tests that cover bridge manifest rendering and CLI
      bridge generation.
- [x] Run Ginko package-boundary and publish-specifier checks.
- [x] Run Ginko type checks for `@lupinum/ginko-cms-convex` and
      `@lupinum/ginko-cms`.
- [x] Run the Ginko package e2e or the narrowest maintained package-consumer
      test that proves a consumer can install Ginko with the bridge package
      dependency.
- [x] If package e2e needs a packed Trellis dependency, pack both Trellis and
      `@lupinum/trellis-bridge` and wire the fixture explicitly.

### 6. Trellis Regression Checks

- [x] Re-run Trellis bridge package unit tests.
- [x] Re-run `pnpm run test:types:bridge`.
- [x] Re-run `pnpm run check:publish-surface`.
- [x] Re-run `pnpm run check:docs:api-surface`.
- [x] Re-run `pnpm run check:refactor:surface:inventory`.
- [x] Re-run `pnpm run check:cli` to prove root `trellis bridge` stays absent.

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

- [x] Ginko release-facing source imports bridge APIs from
      `@lupinum/trellis-bridge`, not from `@lupinum/trellis/functions` or
      `@lupinum/trellis/bridge`.
- [x] Ginko package dependencies explicitly include `@lupinum/trellis-bridge`
      wherever bridge APIs are imported.
- [x] `ginko-cms bridge generate` remains the Ginko-owned consumer command.
- [x] Trellis root CLI remains free of bridge commands.
- [x] Ginko bridge manifest/render/parity tests pass.
- [x] Ginko package-boundary and publish-specifier checks reject old bridge
      import paths.
- [x] Ginko package e2e, or an accepted narrow substitute, proves a consumer can
      use Ginko with `@lupinum/trellis-bridge`.
- [x] No compatibility shim or old bridge public path is added to Trellis.

## Exit Notes To Capture

- [x] Ginko did not need additional root bridge APIs, but it did need a narrower
      component-runtime subpath. Trellis now exposes manifest/package-author APIs
      from `@lupinum/trellis-bridge` and Convex component bridge helpers from
      `@lupinum/trellis-bridge/component`.
- [x] Ginko package e2e consumes packed Trellis, packed Trellis bridge, and
      packed Ginko packages successfully. The first package e2e run caught raw
      `src/*.ts` bridge exports; the bridge package now builds and packs compiled
      `dist/*.js` plus `dist/*.d.ts`.
- [x] Bridge CLI ownership is settled for this slice: `ginko-cms bridge generate`
      remains the consumer command. No Trellis root bridge command was added.
- [x] No old `@lupinum/trellis/functions` imports remain in Ginko source after
      the direct backend import hard cut to `@lupinum/trellis/backend`.
- [x] Next sprint should focus on one of the remaining 1.0 foundation lanes:
      direct MCP mutation/action safety metadata, forwarding RFC production
      hardening, or first-party production stores.
