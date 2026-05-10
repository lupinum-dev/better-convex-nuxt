# Sprint 16: Operation Descriptor Invariants

## Goal

Make operation descriptors trustworthy enough to become the canonical
cross-surface operation source before converting more MCP, doctor, explain, or
bridge behavior.

By the end of this sprint, descriptor/implementation drift should fail clearly,
feature manifests should point at descriptors, and inventory JSON should expose
operation metadata without importing Convex implementation modules or relying on
source scanning.

## Why This Sprint Comes Next

Sprint 15 closed the signed-forwarding handler metadata gap. The next
load-bearing 1.0 piece is Slice 5: operation descriptors.

The 1.0 spec depends on operation metadata for MCP projection, destructive
confirmation, doctor, explain, upgrade checks, and bridge integration. If the
descriptor model can drift from backend implementation behavior, every later
surface becomes harder to trust.

This sprint intentionally tightens the descriptor source of truth before
starting broader MCP blessed-lane conversion.

## Current State

- `defineOperationDescriptor(...)` exists.
- `implementOperation(descriptor, implementation)` exists.
- Existing invariant checks cover descriptor/implementation id, kind, args,
  return schema, preview return schema, and permission-key drift.
- `projectOperationRef(...)`, `previewOperationRef(...)`,
  `executeOperationRef(...)`, and `transportExecuteOperationRef(...)` already
  stamp projection metadata.
- Feature/app inventory can include operations and emits versioned JSON.
- Current inventory operation JSON is still minimal: id, kind, and feature.
- Feature manifests currently accept loose operation values instead of making
  descriptors the obvious canonical input.
- Some server/MCP examples still import Convex operation implementations. That
  is a known later migration, not the target of this sprint.

## Non-Goals

- Do not convert every operation or MCP tool to descriptors in this sprint.
- Do not implement the full doctor or explain CLI.
- Do not delete `defineOperation(...)` unless the sprint proves it is unused and
  deletion is smaller than keeping it.
- Do not start bridge extraction.
- Do not add source scanners for operation truth.
- Do not add a second operation registry.
- Do not create compatibility aliases for old operation metadata shapes.

## Work Items

### 1. Harden Descriptor/Implementation Drift Checks

- [x] Add an explicit invariant for `safety` drift between descriptor and
      implementation.
- [x] Ensure destructive descriptors fail clearly when the implementation or
      registration path cannot provide the required preview/execute projection
      contract.
- [x] Keep the failure at the backend/operation boundary, not in MCP
      orchestration.
- [x] Improve drift error messages so they name the operation id and field.
- [x] Add focused tests in `tests/unit/operation-descriptor.test.ts`.

### 2. Make Feature Manifests Descriptor-First

- [x] Add or expose a small `isOperationDescriptor(...)` predicate if needed.
- [x] Prefer `OperationDescriptor` values in `defineFeature({ operations })`.
- [x] Reject Convex implementation objects in feature manifests if this can be
      done without creating a second compatibility path.
- [x] Update fixtures/tests so feature manifests list descriptors, not
      implementation objects.
- [x] Preserve duplicate operation-id checks.

### 3. Expand Versioned Inventory Operation JSON

- [x] Include stable operation fields: `id`, `name`, `kind`, `feature`,
      `permissionKey`, and `safety`.
- [x] Do not include handlers, functions, raw schemas, source paths, raw
      principals, envelopes, tokens, or user data.
- [x] Add tests proving inventory JSON is descriptor-derived and secret-safe.
- [x] Keep `schemaVersion: 1` stable unless the existing contract truly needs a
      breaking schema bump.

### 4. Strengthen Projection Binding Tests

- [x] Add or tighten tests proving execute and preview refs carry matching
      operation ids and projection kinds.
- [x] Prove destructive operation bindings reject missing preview projections.
- [x] Prove descriptor-projected refs can bind without importing Convex
      implementation objects in the MCP/server-side test path.
- [x] Keep projection metadata generated or descriptor-derived, never inferred
      by regex/source scanning.

### 5. Update The 1.0 Tracker

- [x] Update Slice 5 in `meta/trellis-1.0-refactor-plan.md` only for the items
      actually completed.
- [x] Leave later Slice 6 MCP blessed-lane work unchecked.
- [x] Record any deliberate follow-up if a broader conversion is not safe in
      this sprint.

## Verification

Focused unit suite:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/operation-descriptor.test.ts \
  tests/unit/feature-compose.test.ts \
  tests/unit/mcp-operation-binding.test.ts \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/phase0-workspace-mcp-fixture.test.ts
```

Surface and inventory checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
```

Reference example:

```bash
pnpm --dir examples/07-mcp-reference test
```

Ginko cross-repo check:

```bash
pnpm --dir ../ginko-cms run test:types
```

Known non-gates unless fixed separately:

```bash
pnpm run test:types
pnpm --dir examples/07-mcp-reference typecheck
```

Current unrelated failures include repo-wide type drift and the MCP reference
example's existing Nuxt alias/generated API plus Convex dependency-version type
drift.

## Acceptance Criteria

- [x] Descriptor/implementation `safety` drift fails with a clear error.
- [x] Destructive descriptor preview/execute requirements fail at an invariant
      boundary with a focused test.
- [x] Feature manifests use operation descriptors as the canonical operation
      input.
- [x] App inventory operation JSON includes id, name, kind, feature,
      permissionKey, and safety without implementation functions or secrets.
- [x] Projection binding tests prove descriptor-derived refs work without
      importing Convex implementation modules in MCP/server paths.
- [x] No new operation source scanner, duplicate registry, compatibility alias,
      or parallel metadata list is added.
- [x] The 1.0 refactor tracker reflects the completed Slice 5 subset.
- [x] Verification commands above pass except explicitly listed non-gates.
- [x] Sprint changes are committed after verification.

## Exit Notes

- [x] `defineFeature({ operations })` now rejects Convex implementation objects
      and accepts shared operation descriptors only.
- [x] `implementOperation(...)` now rejects name, safety, and destructive
      preview drift at the descriptor/implementation boundary.
- [x] `toAppInventoryJson(...)` now emits operation name, permission key, and
      safety while keeping handlers/schemas/secrets out of JSON.
- [x] Descriptor return schemas now preserve the app-provided validator object
      without forcing Trellis' installed Convex validator type identity.
- [x] Focused unit, surface, reference example, and Ginko type checks passed.
- [x] `pnpm run test:types:contracts` and
      `pnpm --dir examples/03-team-workspace typecheck` remain non-gates due
      existing Vue Router / generated API / Convex dependency-version type
      drift.
