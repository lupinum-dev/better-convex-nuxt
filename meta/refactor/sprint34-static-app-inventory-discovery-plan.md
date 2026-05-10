# Sprint 34: Static App Inventory Discovery

## Goal

Make CLI inventory recognize app-owned inventory files and feature manifest
names without executing consumer app code.

This sprint should advance the Slice 8 item:

```text
Inventory reads app inventory first.
```

But it should do that carefully. The goal is static discovery metadata, not a
full runtime `defineAppInventory(...)` evaluator.

## Why This Sprint Comes Next

Sprints 31-33 established a versioned, secret-safe CLI inventory and moved
multiple doctor security surfaces onto it:

- `inventory.forwarding`;
- `inventory.mcp`;
- `inventory.backend`.

The next missing source of truth is app-owned inventory. Runtime inventory
already exists through `defineAppInventory(...)`, but CLI inventory currently
only records whether `shared/app-inventory.ts` exists. That is too thin for
future `doctor`, `upgrade --check`, docs generation, and `explain`.

The next step is to statically detect the app inventory file and the feature
identifiers it references, without importing the file or running user code.

## Current State

- Runtime app inventory exists through `defineAppInventory(...)` and
  `toAppInventoryJson(...)`.
- The Phase 0 fixture has `shared/app-inventory.ts`.
- Generated starter apps currently do not include `shared/app-inventory.ts`.
- CLI inventory exposes `files.appInventory`, but not a structured
  app-inventory section.
- CLI inventory already uses source scanning for doctor facts, but it must not
  execute arbitrary app modules.

## Non-Goals

- Do not execute `shared/app-inventory.ts`.
- Do not import consumer app source through ts-node, dynamic import, or bundler
  evaluation.
- Do not implement `trellis explain`.
- Do not implement `trellis upgrade --check`.
- Do not redesign runtime `defineAppInventory(...)`.
- Do not require generated starters to add app inventory in this sprint unless a
  minimal fixture adjustment is truly needed for tests.
- Do not infer full operation metadata from arbitrary code in this sprint.
- Do not add snippets or raw source text to inventory JSON.

## Design Target

### Inventory-Owned App Inventory Section

Add a focused section to `TrellisCliInventory`, for example:

```ts
type TrellisCliInventory = {
  appInventory: {
    file: string | null
    detected: boolean
    featureBindings: Array<{
      name: string
      importPath: string | null
      source: TrellisCliInventorySourceLocation
    }>
    warnings: Array<{
      code: 'missing-define-app-inventory' | 'dynamic-features'
      source: TrellisCliInventorySourceLocation
    }>
  }
}
```

The exact field names can change during implementation. Keep it small and
machine-safe.

### Static Parsing Only

Use a structured TypeScript parser if practical; otherwise keep the scanner
narrow and documented. The scanner should support the canonical pattern:

```ts
import { projectsFeature } from './features/projects/feature'

export const appInventory = defineAppInventory({
  features: [projectsFeature] as const,
})
```

It should not try to evaluate arbitrary expressions. If `features` is dynamic
or too complex, emit a warning entry instead of guessing.

### One Source For Future Tools

Doctor does not need a new human finding in this sprint unless it falls out
naturally. The important thing is that `doctor --json` exposes a stable,
versioned inventory section future tools can consume.

## Work Items

### 1. Add Static Discovery

- [ ] Add a small app-inventory discovery helper in the CLI inventory module or
      a focused sibling module.
- [ ] Detect the canonical `shared/app-inventory.ts` file.
- [ ] Detect `defineAppInventory({ features: [...] })` when the feature list is
      a static array of identifiers.
- [ ] Resolve feature identifier import paths from local import declarations
      without following or executing imports.
- [ ] Report dynamic or unsupported feature lists as warnings, not guessed
      metadata.

### 2. Extend Inventory JSON

- [ ] Add an `appInventory` section to `TrellisCliInventory`.
- [ ] Preserve existing `files.appInventory` for compatibility with the
      current JSON shape.
- [ ] Keep all source references path + line only.
- [ ] Keep inventory JSON safe to share.

### 3. Add Tests

- [ ] Test the Phase 0 fixture reports `shared/app-inventory.ts`.
- [ ] Test canonical static feature references are reported with feature name,
      import path, and source location.
- [ ] Test missing app inventory reports `detected: false` without failing
      generated starters.
- [ ] Test dynamic feature lists produce a warning instead of guessed feature
      metadata.
- [ ] Test inventory JSON does not include raw source snippets or fixture secret
      strings.

### 4. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes for static app-inventory discovery.
- [ ] Mark `Inventory reads app inventory first` only if the implemented
      section is strong enough to serve as the first checked inventory source.
- [ ] Leave public-surface, upgrade, and explain replacement unchecked.

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
  src/cli/lib/inventory.ts \
  tests/unit/cli-doctor.test.ts \
  meta/refactor/sprint34-static-app-inventory-discovery-plan.md
```

## Acceptance Criteria

- [ ] Inventory JSON has an explicit `appInventory` section.
- [ ] Canonical static `defineAppInventory({ features: [...] })` is detected.
- [ ] Static feature bindings include safe path + line source locations.
- [ ] Dynamic feature lists are reported as warnings, not guessed facts.
- [ ] Missing app inventory remains valid for generated starters.
- [ ] Inventory JSON remains snippet-free and secret-safe.
- [ ] No app source is executed or imported.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Exit Notes

Pending.

## Next Sprint Candidate

After static app-inventory discovery exists, the next Slice 8 sprint should
decide how doctor uses it:

- add a lightweight doctor finding for malformed app inventory; or
- start moving operation/tool agreement checks toward inventory-backed metadata.
