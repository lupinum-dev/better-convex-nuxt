# Sprint 47: Explain Operation Inventory

## Goal

Add the first `trellis explain` command: `trellis explain operation <id>`.

By the end of this sprint, a reviewer should be able to ask the CLI for one
operation and get the inventory-backed facts Trellis already knows: operation
identity, kind, source file/line, generated preview/execute projections, MCP
tool bindings, and feature manifest references.

## Why This Sprint Comes Next

Slice 8 now has stable inventory, doctor consumes inventory-backed findings, and
permission drift uses `inventory.permissions`. The remaining product item in
Slice 8 is:

```text
explain operation <id> uses inventory if included in 1.0.
```

The team chose the full 1.0 spec, so this should move from optional to real.
Start with the smallest valuable explain surface: operations. Do not implement
feature/file/general explain yet.

## Current State

- `inventory.publicSurface.operations` lists operation id, export name, kind,
  and source.
- `inventory.publicSurface.projections` lists preview/execute projections by
  operation id.
- `inventory.publicSurface.tools` lists MCP tools and whether they come from
  operation bindings, but does not currently carry operation id for tools.
- `inventory.features[*].operationRefs` lists operation descriptor references in
  feature manifests.
- Doctor already uses public-surface operation/tool inventory for
  operation/tool agreement.
- There is no `trellis explain` CLI command yet.

## Non-Goals

- Do not implement `explain feature`, `explain file`, or broad app explain.
- Do not add a second operation scanner.
- Do not parse Convex implementation bodies for guard/load/authorize details.
- Do not change operation descriptor or public-surface metadata formats unless
  absolutely required for the operation lookup.
- Do not add bridge/Ginko explain behavior.
- Do not make `explain` depend on generated Convex implementation imports.

## Design Target

CLI shape:

```bash
trellis explain operation projects.delete --cwd ./app
trellis explain operation projects.delete --json --cwd ./app
```

Human output should be concise and reviewer-oriented:

```text
Operation projects.delete
Kind: destructive
Export: deleteProjectDescriptor
Source: convex/features/projects/operations.ts:12
Projections:
  preview: previewDeleteProject at convex/features/projects/operations.ts:44
  execute: executeDeleteProject at convex/features/projects/operations.ts:88
MCP tools:
  delete-project at server/mcp/tools/delete-project.ts:3
Feature refs:
  projectsFeature at convex/features/projects/feature.ts:9
```

JSON output should be versioned and safe to share:

```ts
{
  schemaVersion: 1,
  cwd: string,
  operation: {
    id: string,
    exportName: string,
    kind: 'safe' | 'destructive',
    source: { path: string, line: number },
    projections: [...],
    tools: [...],
    featureRefs: [...]
  }
}
```

If the operation id is not found, the command should fail with a clear message
and, in JSON mode, include available operation ids. Do not dump source snippets.

## Work Items

### 1. Add Explain Command Shell

- [ ] Add `src/cli/commands/explain.ts`.
- [ ] Register `explain` in `src/cli/main.ts`.
- [ ] Support `trellis explain operation <id>`.
- [ ] Support `--cwd`, `--json`, and `--color` consistently with doctor/upgrade.

### 2. Build Inventory-Backed Operation Explanation

- [ ] Inspect the project once and collect `TrellisCliInventory`.
- [ ] Find the operation by exact `inventory.publicSurface.operations[*].id`.
- [ ] Include preview/execute projections from `inventory.publicSurface.projections`.
- [ ] Include feature references whose `operationRefs` mention the operation
      export name.
- [ ] Include operation-backed MCP tools if inventory can prove the binding
      safely; otherwise state that operation-specific MCP binding cannot yet be
      derived from current tool metadata.
- [ ] Do not parse implementation bodies or import Convex modules.

### 3. Output And Errors

- [ ] Human output is readable and stable.
- [ ] JSON output is versioned and secret-safe.
- [ ] Missing operation exits non-zero with available operation ids.
- [ ] Empty operation inventory reports that no operations were found.

### 4. Tests

- [ ] Add CLI tests for human and JSON explain output.
- [ ] Add missing-operation test.
- [ ] Add generated/no-operation app test.
- [ ] Ensure explain output uses inventory paths and does not include snippets.

### 5. Update Trackers

- [ ] Update this sprint plan with exit notes.
- [ ] Update Slice 8 notes.
- [ ] Mark `explain operation <id>` complete only if the command exists and is
      backed by `TrellisCliInventory`.

## Verification

Focused tests:

```bash
pnpm exec vitest run --project=unit tests/unit/cli-explain.test.ts
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
  src/cli/main.ts \
  src/cli/commands/explain.ts \
  tests/unit/cli-explain.test.ts \
  meta/refactor/sprint47-explain-operation-inventory-plan.md \
  meta/trellis-1.0-refactor-plan.md
```

## Acceptance Criteria

- [ ] `trellis explain operation <id>` exists.
- [ ] Operation explanation is built from `TrellisCliInventory`.
- [ ] JSON output is versioned and safe to share.
- [ ] Missing operation diagnostics are clear and list available operation ids.
- [ ] No new operation scanner is added.
- [ ] Slice 8 tracker is updated.
- [ ] Sprint changes are committed after verification.
