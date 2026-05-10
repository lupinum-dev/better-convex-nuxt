# Sprint 45: Inventory Finding Engine

## Goal

Move doctor's inventory-backed findings into a focused inventory finding engine.

By the end of this sprint, the findings that already have canonical
`TrellisCliInventory` sources should be produced from one helper instead of
being assembled directly inside the doctor command. Doctor can still own
environment and project-setup checks that are not inventory facts yet.

## Why This Sprint Comes Next

Sprint 44 completed the broad inventory coverage checklist by adding bridge
package inventory. Slice 8 now has the facts needed for one inventory path to
explain the app, but doctor still mixes inventory-backed security findings with
project/env setup checks in one large command file.

The next step is not more metadata. It is deleting duplication pressure:
inventory-backed findings should be created from inventory, while doctor remains
the command that renders the full report.

## Current State

- `TrellisCliInventory` now includes layers, app inventory, features,
  permissions, public surface, forwarding, MCP, backend unsafe/destructive
  facts, and bridge packages.
- Doctor already uses inventory for several findings:
  - app inventory source;
  - forwarding public exposure;
  - forwarded principal misuse;
  - unsafe surface inventory;
  - cross-tenant escape inventory;
  - destructive operation inventory;
  - MCP destructive operation binding;
  - operation/tool agreement;
  - custom MCP app-write bypass.
- Doctor still assembles those inventory findings inline in
  `src/cli/commands/doctor.ts`.
- Upgrade already consumes inventory separately.
- Permission metadata findings still use the permission metadata extractor
  directly, even though `inventory.permissions` now has the structured facts.

## Non-Goals

- Do not rewrite all doctor findings.
- Do not move env detection into inventory in this sprint.
- Do not change finding IDs, statuses, or human messages unless required by the
  extraction.
- Do not add a new generic plugin/registry system for findings.
- Do not remove source scanning from `project.ts` when it is still the canonical
  collector behind inventory facts.
- Do not implement `trellis explain` in this sprint.

## Design Target

Add a small inventory finding module, for example:

```ts
collectInventoryDoctorFindings(inventory)
```

It should return only findings that can be explained from
`TrellisCliInventory` without receiving the full `ProjectInspection`.

Expected first set:

- `app-inventory-source`
- `trusted-forwarding-key-public-exposure`
- `forwarded-principal-trusted-path`
- `unsafe-surface-inventory`
- `cross-tenant-escape-inventory`
- `destructive-operation-inventory`
- `mcp-destructive-operation-binding`
- `operation-tool-agreement`
- `mcp-custom-app-write-bypass`

Permission metadata findings should move only if the implementation can reuse
`inventory.permissions` directly without losing current diagnostics. If that
becomes broad, leave permission migration for the following sprint and state it
in exit notes.

## Work Items

### 1. Extract Inventory Finding Helpers

- [x] Create a focused helper module for inventory-backed doctor findings.
- [x] Move shared location formatting and unsafe-entrypoint location helpers if
      they become inventory-finding concerns.
- [x] Keep helper input narrow: `TrellisCliInventory`, not `ProjectInspection`.
- [x] Keep messages, statuses, and finding IDs stable.

### 2. Replace Doctor Inline Inventory Findings

- [x] Remove inventory-backed finding construction from `doctor.ts`.
- [x] Call the inventory finding helper from doctor.
- [x] Keep env/auth/module-validation findings in doctor for now.
- [x] Keep permission metadata findings as-is unless they can cleanly consume
      `inventory.permissions`.

### 3. Prove Output Stability

- [x] Existing doctor JSON snapshots/assertions still pass.
- [x] Existing source metadata assertions still point to inventory paths.
- [x] Human doctor output remains stable enough for current tests.
- [x] No new scanner is introduced.

### 4. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 notes.
- [x] Mark "Doctor reads inventory/finding engine" complete only if doctor's
      inventory-backed findings are no longer assembled inline.

## Verification

Focused doctor tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
```

Upgrade regression, because finding source helpers are shared:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts
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
  src/cli/lib/inventory-findings.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-upgrade.test.ts \
  meta/refactor/sprint45-inventory-finding-engine-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [x] Inventory-backed doctor findings live in one inventory finding helper.
- [x] Doctor still owns non-inventory setup/env findings.
- [x] No finding ID/status regression for existing doctor tests.
- [x] Inventory-backed finding sources remain machine-readable and safe.
- [x] No new source scanner is added.
- [x] Slice 8 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `src/cli/lib/inventory-findings.ts` as the focused helper for
  inventory-backed doctor findings.
- `doctor.ts` now delegates app inventory, forwarding exposure/misuse, unsafe
  surfaces, tenant escapes, destructive operations, MCP rate-limit store,
  destructive MCP binding, operation/tool agreement, and custom MCP app-write
  findings to `collectInventoryDoctorFindings(inventory)`.
- Env/auth/module-validation checks remain in `doctor.ts` because they still
  depend on project/env inspection outside `TrellisCliInventory`.
- Permission metadata findings stay on the existing metadata helper for now; a
  later sprint can move them only if it can use `inventory.permissions` without
  losing usage diagnostics.
