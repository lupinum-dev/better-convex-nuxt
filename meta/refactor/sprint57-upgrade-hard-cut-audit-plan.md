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

### 1. Inventory Current Upgrade Coverage

- [ ] Read `src/cli/commands/upgrade.ts` and existing upgrade tests.
- [ ] Map every row in the Slice 11 migration table to one of:
      checked, codemod-ready, manual/audit-only, intentionally no check.
- [ ] Add the map to this sprint doc or the Slice 11 migration section.
- [ ] Do not implement a check until its false-positive boundary is clear.

### 2. Add Precise Old Backend Builder Findings

- [ ] Detect Trellis backend imports from `@lupinum/trellis/backend`,
      `@lupinum/trellis/functions`, local `../../functions`, and generated
      fixture function barrels where possible.
- [ ] Flag only imported Trellis builder identifiers called directly as
      `query(...)`, `mutation(...)`, or `action(...)`.
- [ ] Flag operation/projection root registration shapes such as
      `mutation(removeTodoOp)` and `query(previewOf(removeTodoOp))` when the
      called identifier is a Trellis builder import.
- [ ] Recommend explicit lanes: `.public`, `.protected`, or `.unsafe`.
- [ ] Keep raw Convex builder fixtures out of scope unless they import Trellis
      builders.

### 3. Strengthen Deleted Starter/CLI Findings

- [ ] Ensure `workspace --mcp` references are reported as deleted 1.0 starter
      spelling, not only docs text drift.
- [ ] Ensure `--template cms` and `template: "cms"` are reported as deleted
      Trellis starter usage.
- [ ] Keep `examples/08-component-mini-cms`, historical sprint docs, and
      package-author bridge docs from creating noisy beginner-starter findings.

### 4. Tighten Import/Path Findings

- [ ] Keep `@lupinum/trellis/functions` import findings, but make the output
      distinguish general backend rename from bridge-helper migration.
- [ ] Keep `@lupinum/trellis/bridge` findings pointing at
      `@lupinum/trellis-bridge`.
- [ ] Verify the upgrade report covers old public paths without requiring those
      paths to remain exported.

### 5. Update Tests And Fixtures

- [ ] Add focused upgrade fixtures with old root backend builder calls.
- [ ] Add tests proving raw Convex builder files are not falsely flagged.
- [ ] Add tests for deleted starter spellings.
- [ ] Update human and JSON output assertions for new findings.

### 6. Update Refactor Tracker

- [ ] Add a Sprint 57 progress note under Slice 11.
- [ ] Mark `trellis upgrade --check` complete only if the command covers the
      migration table rows above with tested findings.
- [ ] Mark codemods still pending unless an actual codemod is implemented and
      tested.
- [ ] Do not mark Slice 11 done unless all Done Means are satisfied.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts`
- [ ] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts`
- [ ] `pnpm exec vitest run --project=unit tests/unit/public-surface-inventory-script.test.ts`
- [ ] `pnpm exec vue-tsc -p tsconfig.types.json --noEmit`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check src/cli tests/unit/cli-upgrade.test.ts meta/refactor/sprint57-upgrade-hard-cut-audit-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- `trellis upgrade --check` reports old Trellis root backend builder callsites
  with safe file/line evidence.
- The check does not flag raw Convex builder files that do not import Trellis
  builders.
- Deleted starter spellings have tested upgrade findings.
- Import/path findings remain hard-cut guidance, not compatibility.
- Slice 11 has an accurate migration coverage map and no overstated completed
  items.
