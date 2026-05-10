# Sprint 33: Inventory-Backed Unsafe And Destructive Doctor

## Goal

Move the next security-sensitive doctor family onto explicit inventory sections:
unsafe backend entrypoints, cross-tenant escapes, and destructive operation
inventory.

By the end of this sprint, doctor should not own separate source-code facts for
these backend risk surfaces. It should read them from inventory, the same way
Sprint 32 moved forwarding/MCP facts.

This sprint continues Slice 8 incrementally. It should not try to finish
`explain`, upgrade checks, or public-surface inventory.

## Why This Sprint Comes Next

Sprint 32 proved the pattern:

- inventory owns forwarding/MCP source-code locations;
- doctor consumes that inventory;
- env secrets stay local to doctor;
- machine output remains safe to share.

The next highest-value surfaces are backend escape hatches and destructive
operations. They are already scanned by doctor and already summarized in
`inventory.surfaces`, but they do not yet have explicit inventory sections with
source locations.

Moving them now keeps the inventory engine honest: it becomes useful for more
than MCP, while still avoiding a broad doctor rewrite.

## Current State

- `inventory.forwarding` and `inventory.mcp` carry source-backed locations.
- `inventory.surfaces` carries counts for unsafe entrypoints, cross-tenant
  escapes, and destructive operations.
- Doctor still reads unsafe/destructive source locations from
  `TrellisCliInventoryFacts`.
- Existing scanners return `ProjectSourceLocation` with `path` and `line` only.

## Non-Goals

- Do not implement `trellis explain`.
- Do not implement `trellis upgrade --check`.
- Do not load or execute app `shared/app-inventory.ts`.
- Do not infer operation semantics beyond the existing scanner facts.
- Do not redesign unsafe permits or destructive operation descriptors.
- Do not add broad new regex scanners.
- Do not add snippets or raw source text to inventory JSON.
- Do not move public-surface checks in this sprint.

## Design Target

### Backend Risk Inventory Section

Extend inventory with one explicit backend risk section, for example:

```ts
type TrellisCliInventory = {
  backend: {
    unsafeEntrypoints: TrellisCliInventorySourceLocation[]
    crossTenantEscapes: TrellisCliInventorySourceLocation[]
    destructiveOperations: TrellisCliInventorySourceLocation[]
  }
}
```

The exact name can change during implementation. The important rule is that
doctor reads the source locations from inventory, not from a parallel local
variable.

Keep source locations path + line only and project-relative.

### Doctor Reads Inventory

Move these findings onto inventory-backed source locations:

- `unsafe-surface-inventory`
- `cross-tenant-escape-inventory`
- `destructive-operation-inventory`

Do not turn these informational inventory findings into failures. The current
doctor behavior should remain stable: these findings report what exists so
reviewers can inspect intentional escape hatches.

### No New Authority Claims

This sprint does not claim inventory can fully understand operation descriptors.
It only centralizes the source locations doctor already reports.

Future sprints can add structured operation descriptor metadata. This sprint
should not fake that structure.

## Work Items

### 1. Extend Inventory Shape

- [x] Add an explicit backend risk section to `TrellisCliInventory`.
- [x] Include unsafe entrypoints, cross-tenant escapes, and destructive
      operations as safe source locations.
- [x] Preserve existing `surfaces` summary counts.
- [x] Reuse the existing safe source-location mapper.

### 2. Move Doctor Findings Onto Inventory

- [x] Change unsafe/destructive findings to read locations from inventory.
- [x] Remove now-unused local variables or direct facts reads from doctor.
- [x] Keep finding status and message behavior stable.
- [x] Keep human doctor output unchanged except for relative path formatting if
      inventory now supplies relative paths.

### 3. Add Tests

- [x] Test `doctor --json` includes the backend risk inventory section.
- [x] Test unsafe entrypoints appear in inventory and in the corresponding
      doctor finding.
- [x] Test cross-tenant escapes appear in inventory and in the corresponding
      doctor finding.
- [x] Test destructive operations appear in inventory and in the corresponding
      doctor finding.
- [x] Test inventory does not include source snippets or known secret/identity
      fixture strings.

### 4. Update Trackers

- [x] Update this sprint plan with exit notes.
- [x] Update Slice 8 notes for the backend-risk inventory cutover.
- [x] Leave app inventory, public-surface, upgrade, and explain replacement
      unchecked.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
```

Inventory-adjacent checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-doctor.test.ts \
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
  src/cli/lib/inventory.ts \
  src/cli/commands/doctor.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint33-inventory-backed-unsafe-destructive-doctor-plan.md
```

## Acceptance Criteria

- [x] Inventory JSON has an explicit backend risk section.
- [x] Unsafe/destructive source-code facts have one inventory source.
- [x] Doctor unsafe/destructive findings read source-code facts from inventory.
- [x] Existing human doctor behavior remains stable.
- [x] Tests prove backend risk inventory shape and source-location reporting.
- [x] Inventory JSON remains snippet-free and secret-safe.
- [x] No broad new scanner duplicates existing doctor scanners.
- [x] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- Added `inventory.backend` with unsafe entrypoints, cross-tenant escapes, and
  destructive operations.
- Backend risk source locations reuse the existing project-relative path + line
  inventory location shape.
- Doctor findings `unsafe-surface-inventory`,
  `cross-tenant-escape-inventory`, and `destructive-operation-inventory` now
  read source locations from `inventory.backend`.
- Existing summary counts remain in `inventory.surfaces`.
- Unit coverage now proves backend risk inventory shape and corresponding doctor
  messages for unsafe entrypoints, cross-tenant escapes, and destructive
  operations.

## Next Sprint Candidate

After backend risk findings move onto inventory, the next Slice 8 sprint should
make inventory read runtime/app inventory metadata where available without
executing arbitrary app code. Candidate scope:

- detect `shared/app-inventory.ts`;
- expose feature manifest file presence and names where safely discoverable;
- keep app-owned structured inventory separate from source-code fallback facts.
