# Sprint 57: Upgrade Hard-Cut Audit Coverage

## Summary

Make the 1.0 hard cuts easier to verify by strengthening
`trellis upgrade --check` coverage for deleted API shapes, without adding
compatibility shims or rewrite magic.

This sprint should turn the migration table from documentation into executable
audit coverage for the remaining high-risk old paths:

- callable root backend builders: `query(...)`, `mutation(...)`, `action(...)`;
- old root operation registration: `mutation(operation)` and
  `query(previewOf(operation))`;
- deleted CLI starter spellings: `workspace --mcp` and `--template cms`;
- old package/import paths that still need migration evidence;
- raw forwarding args and old MCP operation APIs already covered by existing
  checks.

Owner: Codex.

## Why This Sprint

Sprint 56 deleted callable root backend builders. That is the right runtime
shape, but the migration/audit path is now behind the implementation: old
callsites should be easy to find before a user hits TypeScript or runtime
errors.

The goal is not to preserve old behavior. The goal is to make old behavior
visible, precise, and removable.

## Constraints

- Do not re-add callable root builders.
- Do not add hidden aliases for old import paths.
- Do not auto-rewrite authorization, tenant classification, forwarding identity,
  destructive operation binding, or MCP safety classification.
- Do not add broad regex findings that confuse raw Convex builders with Trellis
  backend builders.
- Prefer import-aware or file-shape-aware checks over global text searches.
- Upgrade findings must include safe file/line evidence and no secrets.
- If a finding cannot be precise enough in this sprint, document it as
  intentionally manual instead of adding noisy detection.

## Work Items

### Migration Coverage Map

| Old Pattern                            | Current Coverage                          |
| -------------------------------------- | ----------------------------------------- |
| `tool.fromOperation(...)`              | checked by `upgrade-tool-from-operation`  |
| raw forwarding args                    | checked by `upgrade-raw-forwarding`       |
| bridge core exports/imports            | checked by `upgrade-bridge-import`        |
| arity authorize inference              | audit-only `upgrade-authorize-arity`      |
| string unsafe bypass                   | audit-only `upgrade-unsafe-permits`       |
| `.tpl` starters                        | fixture generator coverage, no upgrade    |
| `@lupinum/trellis/functions` imports   | checked by `upgrade-functions-import`     |
| Trellis root backend builder calls     | checked by `upgrade-backend-root-builder` |
| root operation/projection registration | checked by `upgrade-backend-root-builder` |
| `@lupinum/trellis/bridge` imports      | checked by `upgrade-bridge-import`        |
| `trellis bridge` root CLI              | manual/docs pending                       |
| `workspace --mcp`                      | checked by `upgrade-starter-surface`      |
| `cms` starter                          | checked by `upgrade-starter-surface`      |

### 1. Inventory Current Upgrade Coverage

- [x] Read `src/cli/commands/upgrade.ts` and existing upgrade tests.
- [x] Map every row in the Slice 11 migration table to one of:
      checked, codemod-ready, manual/audit-only, intentionally no check.
- [x] Add the map to this sprint doc or the Slice 11 migration section.
- [x] Do not implement a check until its false-positive boundary is clear.

### 2. Add Precise Old Backend Builder Findings

- [x] Detect Trellis backend imports from `@lupinum/trellis/backend`,
      `@lupinum/trellis/functions`, local `../../functions`, and generated
      fixture function barrels where possible.
- [x] Flag only imported Trellis builder identifiers called directly as
      `query(...)`, `mutation(...)`, or `action(...)`.
- [x] Flag operation/projection root registration shapes such as
      `mutation(removeTodoOp)` and `query(previewOf(removeTodoOp))` when the
      called identifier is a Trellis builder import.
- [x] Recommend explicit lanes: `.public`, `.protected`, or `.unsafe`.
- [x] Keep raw Convex builder fixtures out of scope unless they import Trellis
      builders.

### 3. Strengthen Deleted Starter/CLI Findings

- [x] Ensure `workspace --mcp` references are reported as deleted 1.0 starter
      spelling, not only docs text drift.
- [x] Ensure `--template cms` and `template: "cms"` are reported as deleted
      Trellis starter usage.
- [x] Keep `examples/08-component-mini-cms`, historical sprint docs, and
      package-author bridge docs from creating noisy beginner-starter findings.

### 4. Tighten Import/Path Findings

- [x] Keep `@lupinum/trellis/functions` import findings as a general hard-cut
      backend rename finding; bridge-helper migration remains separately listed
      in the migration coverage map for the codemod/manual follow-up.
- [x] Keep `@lupinum/trellis/bridge` findings pointing at
      `@lupinum/trellis-bridge`.
- [x] Verify the upgrade report covers old public paths without requiring those
      paths to remain exported.

### 5. Update Tests And Fixtures

- [x] Add focused upgrade fixtures with old root backend builder calls.
- [x] Add tests proving raw Convex builder files are not falsely flagged.
- [x] Add tests for deleted starter spellings.
- [x] Update human and JSON output assertions for new findings.

### 6. Update Refactor Tracker

- [x] Add a Sprint 57 progress note under Slice 11.
- [x] Mark `trellis upgrade --check` complete only if the command covers the
      migration table rows above with tested findings.
- [x] Mark codemods still pending unless an actual codemod is implemented and
      tested.
- [x] Do not mark Slice 11 done unless all Done Means are satisfied.

## Verification

- [x] `pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts`
- [x] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts`
- [x] `pnpm exec vitest run --project=unit tests/unit/public-surface-inventory-script.test.ts`
- [x] `pnpm exec vue-tsc -p tsconfig.types.json --noEmit`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec oxfmt --check src/cli/commands/upgrade.ts tests/unit/cli-upgrade.test.ts meta/refactor/sprint57-upgrade-hard-cut-audit-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Done Means

- `trellis upgrade --check` reports old Trellis root backend builder callsites
  with safe file/line evidence.
- The check does not flag raw Convex builder files that do not import Trellis
  builders.
- Deleted starter spellings have tested upgrade findings.
- Import/path findings remain hard-cut guidance, not compatibility.
- Slice 11 has an accurate migration coverage map and no overstated completed
  items.
