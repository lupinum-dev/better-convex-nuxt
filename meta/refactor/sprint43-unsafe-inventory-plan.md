# Sprint 43: Unsafe Surface Inventory

## Goal

Replace location-only unsafe backend inventory with structured unsafe surface
metadata.

By the end of this sprint, doctor and upgrade should know not only where unsafe
backend entrypoints are, but also whether each site uses the old string
`bypass` shape or a typed `unsafe.permit(...)`-style shape when present. This
sets up the later hard cut from string bypasses to typed permits without adding
a parallel migration scanner.

## Why This Sprint Comes Next

Sprint 42 added feature and permission facts to `TrellisCliInventory`. Slice 8
still has an inventory coverage gap for unsafe permits. Today inventory only
stores unsafe entrypoint locations:

```ts
backend.unsafeEntrypoints: TrellisCliInventorySourceLocation[]
```

That is enough for current doctor messages, but not enough to drive the 1.0
typed unsafe-permit migration. We should upgrade the existing inventory source
instead of adding a separate unsafe-permit scanner later.

## Current State

- `findUnsafeSurfaceInventory(...)` returns only file/line locations.
- Doctor reports unsafe surfaces as a pass finding with location text.
- Upgrade warns that unsafe backend entrypoints need typed permit review.
- Backend unsafe handlers currently use `bypass: string` in examples,
  harnesses, and fixtures.
- MCP custom tools already have `unsafe.permit(...)`, but backend unsafe lanes
  do not yet have the final typed permit API.

## Non-Goals

- Do not migrate backend unsafe handlers from `bypass` to typed permits in this
  sprint.
- Do not change runtime backend unsafe API semantics.
- Do not change doctor/upgrade statuses or exit behavior.
- Do not serialize bypass reasons, permit reasons, source snippets, raw args,
  or user-authored text into inventory JSON.
- Do not add a separate unsafe migration scanner.
- Do not touch MCP custom tool permit runtime behavior.
- Do not mark the broad Slice 8 inventory coverage checkbox complete unless
  bridge package inventory is also complete.

## Design Target

### Structured Unsafe Entries

Replace the location-only inventory with structured entries:

```ts
export type TrellisCliInventoryUnsafeSurfaceKind = 'query' | 'mutation' | 'action'
export type TrellisCliInventoryUnsafePermitStyle =
  | 'string-bypass'
  | 'typed-permit'
  | 'missing'
  | 'unknown'

export interface TrellisCliInventoryUnsafeEntrypoint {
  exportName: string | null
  surface: TrellisCliInventoryUnsafeSurfaceKind
  style: TrellisCliInventoryUnsafePermitStyle
  file: string
  source: TrellisCliInventorySourceLocation
  permit?: {
    kind?: string
    scopeCount?: number
    hasReviewBy: boolean
  }
}
```

Then use:

```ts
backend.unsafeEntrypoints: TrellisCliInventoryUnsafeEntrypoint[]
```

Findings and summaries should derive locations from `entry.source`.

### Safe Extraction Rules

The extractor may statically inspect object literals passed to:

- `query.unsafe({ ... })`;
- `mutation.unsafe({ ... })`;
- `action.unsafe({ ... })` if supported by current builders;
- legacy `unsafe.query({ ... })` and `unsafe.mutation({ ... })` only while the
  current code still recognizes them.

Permit classification:

- `bypass: '...'` -> `style: 'string-bypass'`;
- `permit: unsafe.permit({ kind, scope, reviewBy })` -> `style: 'typed-permit'`;
- no `bypass` or `permit` -> `style: 'missing'`;
- dynamic or unrecognized permit expression -> `style: 'unknown'`.

Do not store `bypass`, `reason`, or scope names. For typed permits, storing
`kind`, `scopeCount`, and `hasReviewBy` is enough for migration and doctor.

## Work Items

### 1. Extend Inventory Types

- [ ] Add unsafe surface kind/style types.
- [ ] Add `TrellisCliInventoryUnsafeEntrypoint`.
- [ ] Change `backend.unsafeEntrypoints` to structured entries.
- [ ] Update `surfaces.unsafeEntrypoints` to count structured entries.

### 2. Replace Location-Only Unsafe Collection

- [ ] Replace or rename `findUnsafeSurfaceInventory(...)` so inventory owns the
      structured unsafe facts.
- [ ] Extract exported variable name when the unsafe call is assigned to an
      exported const.
- [ ] Extract unsafe surface kind from the builder call.
- [ ] Classify string bypass, typed permit, missing permit, and dynamic/unknown
      permit shape.
- [ ] Keep extraction static and snippet-free.

### 3. Update Doctor And Upgrade Consumers

- [ ] Update doctor unsafe finding to derive locations from
      `entry.source`.
- [ ] Update doctor finding source metadata to cite
      `backend.unsafeEntrypoints`.
- [ ] Update upgrade unsafe finding to derive locations from structured entries.
- [ ] Keep messages, statuses, and exit behavior unchanged.

### 4. Add Tests

- [ ] Doctor JSON includes structured unsafe entries for string-bypass backend
      unsafe handlers.
- [ ] Doctor JSON does not include bypass reason text.
- [ ] Doctor/upgrade findings still cite unsafe locations.
- [ ] Upgrade JSON still includes source metadata for unsafe findings.
- [ ] If a typed permit fixture is easy to add without runtime API changes, add
      a parser-only fixture; otherwise leave typed permit classification covered
      by a direct inventory unit test.

### 5. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 sprint notes.
- [ ] Leave typed permit migration and runtime API hard cut for a later Sprint 3
      slice item.

## Verification

Focused tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
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
  src/cli/lib/inventory.ts \
  src/cli/lib/project.ts \
  src/cli/commands/doctor.ts \
  src/cli/commands/upgrade.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-upgrade.test.ts \
  meta/refactor/sprint43-unsafe-inventory-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] `backend.unsafeEntrypoints` is structured metadata, not only locations.
- [ ] Unsafe inventory records export name, surface kind, permit style, and
      safe source location.
- [ ] Inventory JSON does not contain bypass reason text, permit reason text,
      snippets, args, or user data.
- [ ] Doctor and upgrade consume the structured unsafe entries.
- [ ] Existing doctor/upgrade status behavior remains unchanged.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.
