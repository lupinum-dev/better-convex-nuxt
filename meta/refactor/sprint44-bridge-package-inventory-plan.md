# Sprint 44: Bridge Package Inventory

## Goal

Add structured bridge package metadata to `TrellisCliInventory`.

By the end of this sprint, doctor JSON should explain why the bridge layer is
enabled and which bridge-related packages or references were detected, without
loading bridge packages or executing app code.

## Why This Sprint Comes Next

Sprint 43 replaced location-only unsafe inventory with structured unsafe
metadata. Slice 8 still has one broad inventory coverage checkbox open:

```text
Inventory includes layers, features, permissions, operations, tools, unsafe
permits, forwarding config, public surface, bridge packages.
```

The remaining missing piece in that list is bridge package inventory. The
current inventory only exposes `layers.bridge: boolean`, derived from package
dependencies and source text. That is enough for a layer flag, but not enough
for doctor, upgrade, or future explain output to say what actually enabled the
bridge layer.

## Current State

- `inventory.layers.bridge` is `true` when the app depends on
  `@lupinum/trellis-bridge`, depends on `@lupinum/ginko-cms`, or references
  those packages in source text.
- `packages/trellis-bridge` already owns bridge runtime/manifest helpers.
- Bridge package tests exist separately from CLI inventory.
- Doctor JSON has no structured bridge package/source section.
- Slice 9 bridge extraction still needs proof that normal apps do not see
  bridge unless they ask for packaged integrations.

## Non-Goals

- Do not load bridge manifests from installed packages.
- Do not execute app source or bridge package code.
- Do not move bridge runtime, CLI, or docs in this sprint.
- Do not change package exports.
- Do not change doctor finding statuses or human output.
- Do not add Ginko-specific product behavior to Trellis.
- Do not add source snippets or raw manifest content to inventory JSON.

## Design Target

Add a bridge inventory section:

```ts
export interface TrellisCliInventoryBridgePackage {
  packageName: string
  source:
    | 'dependency'
    | 'devDependency'
    | 'optionalDependency'
    | 'peerDependency'
    | 'source-reference'
  location: TrellisCliInventorySourceLocation | null
}

export interface TrellisCliInventoryBridge {
  enabled: boolean
  packages: TrellisCliInventoryBridgePackage[]
}
```

Then add:

```ts
bridge: TrellisCliInventoryBridge
```

`layers.bridge` should be derived from `inventory.bridge.enabled`, not recomputed
through a separate predicate.

## Extraction Rules

Package metadata should be static and safe:

- dependency entries from `package.json` should list package name and dependency
  bucket;
- source references should list package name and safe file/line location;
- include `@lupinum/trellis-bridge`;
- include `@lupinum/ginko-cms` as a bridge consumer reference;
- include package names that expose a `trellisBridge` package export only if
  that can be read from local `package.json` dependency metadata without loading
  code.

If a package cannot be proven as a bridge package statically, omit it. Avoid
guessing from arbitrary package names.

## Work Items

### 1. Extend Inventory Types

- [x] Add bridge package/source inventory types.
- [x] Add `bridge` to `TrellisCliInventory`.
- [x] Derive `layers.bridge` from `bridge.enabled`.
- [x] Keep `schemaVersion: 1` unless the output contract needs a breaking bump.

### 2. Collect Bridge Package Facts

- [x] Read bridge-related dependencies from package metadata.
- [x] Find source references to `@lupinum/trellis-bridge` and
      `@lupinum/ginko-cms`.
- [x] Return safe file/line locations for source references.
- [x] Deduplicate repeated package/source pairs.
- [x] Do not load manifests or execute package code.

### 3. Update Tests

- [x] Generated starter doctor JSON keeps `bridge.enabled: false`.
- [x] A fixture app with `@lupinum/trellis-bridge` dependency reports a bridge
      dependency package entry.
- [x] A fixture app with a source import of `@lupinum/ginko-cms` reports a safe
      source-reference package entry.
- [x] `layers.bridge` agrees with `bridge.enabled`.
- [x] Inventory JSON remains snippet-free.

### 4. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 sprint notes.
- [x] Mark the broad inventory coverage checkbox complete only if bridge
      package inventory makes the listed inventory categories complete.

## Verification

Focused inventory/doctor tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
```

Regression checks:

```bash
pnpm run check:cli
pnpm run check:starter-fixtures
pnpm run check:docs:api-surface
pnpm run check:refactor:surface:inventory
pnpm run check:publish-surface
```

Formatting and diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/lib/inventory.ts \
  src/cli/lib/project.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint44-bridge-package-inventory-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [x] `TrellisCliInventory` exposes structured `bridge` metadata.
- [x] `layers.bridge` is derived from `bridge.enabled`.
- [x] Bridge package inventory includes dependency and safe source-reference
      evidence.
- [x] Inventory collection does not load bridge manifests or execute app code.
- [x] Generated starters still report bridge disabled.
- [x] Slice 8 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `inventory.bridge` with static package dependency and source-reference
  evidence for `@lupinum/trellis-bridge` and `@lupinum/ginko-cms`.
- `layers.bridge` now derives from `inventory.bridge.enabled`, so doctor JSON has
  one bridge layer source of truth.
- Source-reference evidence includes only package name plus safe file/line
  location. It does not include source snippets or manifest content.
