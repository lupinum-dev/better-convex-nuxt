# Sprint 42: Feature And Permission Inventory Coverage

## Goal

Add structured feature and permission metadata to `TrellisCliInventory` without
executing app code.

By the end of this sprint, doctor JSON should show app-owned features and
permission definitions as first-class inventory facts, with safe file/line
sources. This closes the feature/permission part of the Slice 8 inventory
coverage gap.

## Why This Sprint Comes Next

Sprint 41 made doctor and upgrade findings cite structured source metadata.
The next bottleneck is the inventory itself: Slice 8 still says the inventory
must include features, permissions, operations, tools, unsafe permits,
forwarding config, public surface, and bridge packages.

Operations and tools already exist through `inventory.publicSurface`. Forwarding
and unsafe source locations already exist through `inventory.forwarding` and
`inventory.backend`. Features and permissions are the most useful missing
canonical app facts, and they can be collected from existing static metadata
without adding runtime coupling.

## Current State

- `inventory.appInventory.featureBindings` records the identifiers listed in
  `shared/app-inventory.ts`.
- `inventory.publicSurface.operations` and `inventory.publicSurface.tools`
  already expose operation/tool metadata.
- `src/module-internals/permissions-codegen.ts` already extracts exported
  `definePermission(...)` definitions and exported `*Permissions` arrays.
- `defineFeature(...)` is the canonical runtime shape for feature metadata, but
  CLI inventory does not yet expose parsed feature definitions.
- Doctor JSON currently has no `inventory.features` or `inventory.permissions`
  sections.

## Non-Goals

- Do not execute app source or import feature modules.
- Do not implement `trellis explain`.
- Do not add a second operation/tool source of truth.
- Do not change doctor finding statuses or human output.
- Do not resolve arbitrary TypeScript expressions.
- Do not add bridge package inventory in this sprint.
- Do not add typed unsafe permit inventory in this sprint.
- Do not scan source snippets into JSON output.

## Design Target

### Inventory Shape

Add safe, source-backed metadata:

```ts
export interface TrellisCliInventoryFeature {
  exportName: string
  name: string
  file: string
  source: TrellisCliInventorySourceLocation
  tenantTables: string[]
  globalTables: string[]
  permissionRefs: string[]
  operationRefs: string[]
}

export interface TrellisCliInventoryPermission {
  exportName: string
  key: string
  file: string
  source: TrellisCliInventorySourceLocation
  label?: string
  roles: string[]
  projected: boolean
}

export interface TrellisCliInventoryPermissionInventory {
  exportName: string
  file: string
  source: TrellisCliInventorySourceLocation
  permissions: string[]
  unknown: string[]
}
```

Then add to `TrellisCliInventory`:

```ts
features: TrellisCliInventoryFeature[]
permissions: {
  definitions: TrellisCliInventoryPermission[]
  inventories: TrellisCliInventoryPermissionInventory[]
}
```

Keep `publicSurface.operations` and `publicSurface.tools` as the operation/tool
source. Do not duplicate them into new top-level arrays.

### Feature Extraction

Parse exported `defineFeature({ ... })` calls from app source. The extractor
should accept only static fields:

- `name: '...'`;
- `tenantTables: ['...']`;
- `globalTables: ['...']`;
- `permissions: [permissionIdentifier, ...spreadIdentifier]`;
- `operations: [operationDescriptorIdentifier]`.

For references, record identifier names only. Do not import or evaluate the
referenced values.

If a feature uses dynamic values, skip the dynamic part rather than inventing a
partial truth. The extractor should still collect static fields it can prove.

### Permission Extraction

Reuse the existing permission metadata extractor instead of writing a second
permission scanner. Convert its file/line output into inventory
`source` objects.

Expected include scope for this sprint:

```text
convex/**/*.ts
shared/**/*.ts
```

If that scope is too broad in practice, narrow it with a documented reason and
tests.

## Work Items

### 1. Extend Inventory Types

- [x] Add feature inventory interfaces.
- [x] Add permission inventory interfaces.
- [x] Add `features` and `permissions` fields to `TrellisCliInventory`.
- [x] Keep `schemaVersion: 1` unless the output contract needs a breaking bump.

### 2. Add Static Feature Extraction

- [x] Parse exported `defineFeature(...)` calls without executing source.
- [x] Extract static feature name, table lists, permission refs, operation refs,
      export name, file, and source location.
- [x] Ignore or omit dynamic fields instead of serializing unknown values.
- [x] Keep extractor results secret-safe and snippet-free.

### 3. Reuse Permission Metadata Extraction

- [x] Call `extractPermissionCodegenMetadata(...)` from inventory collection.
- [x] Map permission definitions into inventory definitions.
- [x] Map exported permission inventories into inventory permission inventories.
- [x] Do not duplicate permission validation logic from
      `permission-metadata.ts`.

### 4. Add Tests

- [x] Doctor JSON for a generated workspace app includes feature definitions for
      todos, users, and workspaces.
- [x] Doctor JSON includes permission definitions such as `workspace.read` and
      `todo.create`.
- [x] Doctor JSON includes exported permission inventory metadata when present.
- [x] Inventory source locations are path/line only.
- [x] Human doctor output remains stable.

### 5. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 sprint notes.
- [x] Leave the broad "Inventory includes ..." checkbox open unless bridge
      packages and typed unsafe permit inventory are also complete.

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
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint42-feature-permission-inventory-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [x] `TrellisCliInventory` exposes `features`.
- [x] `TrellisCliInventory` exposes `permissions.definitions` and
      `permissions.inventories`.
- [x] Feature inventory is static, source-backed, and snippet-free.
- [x] Permission inventory reuses existing permission metadata extraction.
- [x] Doctor JSON includes feature and permission facts for generated workspace
      apps.
- [x] Human doctor output and finding semantics remain unchanged.
- [x] Slice 8 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `inventory.features` with static `defineFeature(...)` export metadata,
  table names, permission refs, operation refs, and path/line sources.
- Added `inventory.permissions.definitions` and
  `inventory.permissions.inventories` by reusing
  `extractPermissionCodegenMetadata(...)`.
- Kept operations/tools owned by `inventory.publicSurface`.
- Added doctor JSON assertions for generated workspace feature and permission
  facts.
- Kept human doctor output and finding semantics unchanged.
