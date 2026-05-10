# Sprint 35: App Inventory Doctor Finding

## Goal

Make the static app-inventory metadata from Sprint 34 visible and actionable in
doctor output.

This sprint should add one lightweight doctor finding for app inventory quality:

- generated starter apps without `shared/app-inventory.ts` remain valid;
- apps with canonical static `defineAppInventory(...)` pass;
- apps with malformed or dynamic app inventory warn;
- JSON and human doctor output both point to the same inventory-backed source.

This is the first doctor use of `inventory.appInventory`. It should not become a
full `explain` or operation-metadata sprint.

## Why This Sprint Comes Next

Sprint 34 added static app-inventory discovery, but the only way to see malformed
or dynamic inventory is to inspect `doctor --json`. That is too hidden for a
source-of-truth feature.

The next step is a narrow doctor finding that says:

- no app inventory yet: pass, because starters do not require it;
- canonical static inventory: pass, with feature count;
- malformed/dynamic inventory: warn, with safe source location.

This makes the app-owned inventory source visible without forcing generated
starters to add inventory or pretending the CLI can evaluate arbitrary app code.

## Current State

- `inventory.appInventory` exposes `file`, `detected`, `featureBindings`, and
  `warnings`.
- Static discovery does not execute app source.
- `doctor --json` contains app-inventory details.
- Human doctor output has no app-inventory finding yet.
- Slice 8 still has `Inventory reads app inventory first` unchecked.

## Non-Goals

- Do not require generated starters to include `shared/app-inventory.ts`.
- Do not execute or import consumer app source.
- Do not implement `trellis explain`.
- Do not implement `trellis upgrade --check`.
- Do not infer operation metadata from feature imports.
- Do not add new scanners beyond the existing app-inventory discovery.
- Do not move public-surface checks in this sprint.
- Do not fail doctor for missing app inventory.

## Design Target

### Doctor Finding

Add one finding, likely:

```text
id: app-inventory-source
category: core
title: App inventory source
```

Behavior:

- no app inventory file: `pass`
  - message: no app inventory was found; generated apps may add it when they
    need feature-owned inventory.
- static inventory with no warnings: `pass`
  - message includes `shared/app-inventory.ts` and number of feature bindings.
- inventory with warnings: `warn`
  - message includes warning code and safe source location.

The finding should read only from `inventory.appInventory`.

### JSON Stability

Do not change the `inventory.appInventory` JSON shape unless implementation
finds a clear bug. The goal is to consume it, not redesign it.

### No Failure For Missing Inventory

Missing app inventory is not a setup failure yet. The current generated starters
do not include it, and that remains intentional for now.

## Work Items

### 1. Add Doctor Finding

- [x] Add a core doctor finding backed by `inventory.appInventory`.
- [x] Keep missing app inventory as `pass`.
- [x] Mark malformed/dynamic app inventory warnings as `warn`.
- [x] Format source locations with the existing inventory location formatter.

### 2. Add Tests

- [x] Test generated starters still pass doctor with no app inventory.
- [x] Test canonical static app inventory produces a pass finding.
- [x] Test dynamic app inventory produces a warning finding.
- [x] Test malformed app inventory produces a warning finding.
- [x] Test human output includes the app-inventory finding without printing JSON
      inventory internals.

### 3. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 notes that doctor now consumes `inventory.appInventory`.
- [x] Mark `Inventory reads app inventory first` only if the finding is enough
      to count as the first app-owned inventory consumer.
- [x] Leave public-surface, upgrade, and explain replacement unchecked.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
```

Inventory/runtime-adjacent checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-doctor.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/feature-compose.test.ts
```

Starter and surface checks:

```bash
pnpm run check:starter-fixtures
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  src/cli/commands/doctor.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint35-app-inventory-doctor-finding-plan.md
```

## Acceptance Criteria

- [x] Doctor has an app-inventory finding backed by `inventory.appInventory`.
- [x] Missing app inventory remains valid and passing for generated starters.
- [x] Canonical static app inventory passes with feature-binding count.
- [x] Dynamic or malformed app inventory warns with safe source location.
- [x] Human doctor output remains finding-focused and does not print raw JSON.
- [x] No app source is executed or imported.
- [x] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- Added `app-inventory-source` as a core doctor finding backed only by
  `inventory.appInventory`.
- Missing `shared/app-inventory.ts` remains a passing state so generated starters
  stay valid.
- Canonical static app inventory passes and reports the number of static feature
  bindings.
- Dynamic or malformed app inventory warns with a safe path + line source
  location.
- Human doctor output now includes the app-inventory finding but still does not
  print raw inventory JSON.

## Next Sprint Candidate

After doctor consumes `inventory.appInventory`, the next Slice 8 sprint should
start operation/tool agreement checks from inventory-backed metadata:

- compare destructive operation source facts to MCP operation bindings; or
- add public-surface inventory inputs needed for operation/tool agreement.
