# Sprint 46: Permission Finding Inventory Cutover

## Goal

Make doctor permission findings consume `TrellisCliInventory.permissions` instead
of re-reading permission metadata.

By the end of this sprint, permission definition/inventory drift findings should
use the same inventory facts already exposed in doctor JSON. The only remaining
project scan in this path should be the projected-permission usage check, because
actual runtime usage is not currently a structured inventory fact.

## Why This Sprint Comes Next

Sprint 45 extracted inventory-backed doctor findings into
`collectInventoryDoctorFindings(inventory)`, but permission metadata findings
still bypass that path:

```text
doctor.ts -> collectPermissionMetadataFindings(project)
           -> read .nuxt/trellis/permissions.json again
```

That is now a second source of truth for permission definitions and inventories,
because `inventory.permissions.definitions` and
`inventory.permissions.inventories` already exist.

This sprint should delete that duplicate metadata read from doctor and keep the
remaining usage scan explicit.

## Current State

- `inventory.permissions.definitions` contains permission export name, key, file,
  source location, label, roles, and projected flag.
- `inventory.permissions.inventories` contains exported permission inventory
  arrays, included permission refs, unknown refs, file, and source location.
- `collectPermissionMetadataFindings(project)` reads
  `.nuxt/trellis/permissions.json` directly.
- That helper emits:
  - orphan permission definitions;
  - unused projected permissions;
  - unknown permission inventory refs.
- The unused projected permission check still needs project source text until a
  future inventory slice records permission usage.

## Non-Goals

- Do not add permission usage inventory in this sprint.
- Do not change permission codegen metadata shape.
- Do not change finding IDs, statuses, or human messages unless the source
  change requires file/line evidence.
- Do not make `TrellisCliInventory` depend on frontend usage scanning.
- Do not implement `explain`.
- Do not delete `readPermissionMetadata(...)` if tests or non-doctor callers
  still need it.

## Design Target

Replace the broad helper with a narrower one, for example:

```ts
collectPermissionInventoryFindings(inventory, project)
```

Rules:

- orphan definition checks use `inventory.permissions.definitions` and
  `inventory.permissions.inventories`;
- unknown inventory refs use `inventory.permissions.inventories`;
- projected usage checks use `inventory.permissions.definitions` plus
  `project.sourceFiles`;
- finding sources should point at inventory paths and safe file/line evidence
  where useful;
- no code path used by doctor should re-read permission metadata from disk.

If the usage scan keeps the helper in `permission-metadata.ts`, rename or split
the module so the source of truth is clear. The important outcome is that
metadata facts come from inventory, not a second metadata reader.

## Work Items

### 1. Refactor Permission Findings

- [ ] Add a helper that accepts `TrellisCliInventory` for permission metadata
      facts.
- [ ] Keep `ProjectInspection` only for projected permission usage scanning.
- [ ] Preserve orphan, unused projection, and unknown-ref finding IDs/statuses.
- [ ] Add inventory finding sources for orphan and unknown-ref diagnostics.

### 2. Remove Duplicate Doctor Metadata Read

- [ ] Update doctor to call the inventory-backed permission finding helper.
- [ ] Ensure doctor no longer calls `readPermissionMetadata(...)`.
- [ ] Delete or narrow old permission metadata helper code if no longer used.
- [ ] Keep tests for `readPermissionMetadata(...)` only if it remains a real
      public/internal utility.

### 3. Test The Cutover

- [ ] Existing permission metadata unit tests are updated for inventory input.
- [ ] Doctor tests still pass with generated starter permission inventory.
- [ ] A permission drift test proves sources cite inventory paths.
- [ ] No output includes permission source snippets or raw app code.

### 4. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes.
- [ ] Mark duplicate scanner deletion only if doctor no longer has a duplicate
      permission metadata reader.

## Verification

Focused tests:

```bash
pnpm exec vitest run --project=unit tests/unit/permission-metadata.test.ts
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
  src/cli/commands/doctor.ts \
  src/cli/lib/permission-metadata.ts \
  src/cli/lib/inventory-findings.ts \
  tests/unit/permission-metadata.test.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint46-permission-finding-inventory-cutover-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] Doctor permission definition/inventory findings use
      `inventory.permissions`.
- [ ] Doctor no longer re-reads permission metadata for facts that inventory
      already owns.
- [ ] Project source scanning remains only for projected permission usage.
- [ ] Permission finding IDs/statuses remain stable.
- [ ] Permission drift findings expose safe inventory source metadata.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.
