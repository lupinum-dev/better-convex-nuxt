# Sprint 65: Cross-Repo Gate Baseline

## Summary

Start the examples/harness/Ginko gate with a baseline, not a blind migration.
Slice 11 is locally closed; the next risk is that real consumers still rely on
old Trellis paths. This sprint should decide which local Trellis examples remain
for 1.0, add a repeatable validation command/report for retained targets, and
record the exact Ginko migration surface before changing Ginko code.

Owner: Codex.

## Why This Sprint Comes Next

The cross-repo gate is now the next open blocker in the 1.0 refactor plan. A
quick scan shows:

- Trellis examples and harness no longer have obvious old package imports, but
  they still need a retained-target decision and an executable validation gate.
- Ginko CMS has real release-facing work remaining:
  - `packages/cms/src/server/mcp/runtime.ts` still uses
    `rawMcpRuntime.tool.fromOperation(...)`;
  - Ginko package-boundary tests still mention old bridge/function paths as
    forbidden inputs;
  - Ginko docs/refactor notes still discuss old Trellis APIs historically.

The simplest safe next step is to make the gate explicit and repeatable before
performing cross-repo edits. That prevents half-migrated examples or a Ginko
migration that cannot be checked consistently.

## Constraints

- Do not migrate Ginko code in this sprint unless the validation baseline needs
  a one-line non-behavioral fixture adjustment.
- Do not delete Trellis examples before recording the retained/deleted decision.
- Do not treat docs/refactor historical mentions as current product docs.
- Do not loosen Ginko package-boundary tests to make the baseline pass.
- Do not add compatibility aliases or old Trellis paths back to support examples.
- Prefer one repo-local validation command/script over several ad hoc `rg`
  commands in docs.

## Work Items

### 1. Decide Retained Trellis Targets

- [ ] Inventory `examples/**`, `apps/harness`, `apps/docs`, and
      `apps/devtools-ui`.
- [ ] Classify each target as: - retained 1.0 example; - retained internal harness; - retained docs/devtools app; - obsolete compatibility sample to delete in a later sprint.
- [ ] Record the decision in `meta/trellis-1.0-refactor-plan.md`.
- [ ] Do not delete examples in this sprint unless the target is clearly
      duplicate and no test/package scripts reference it.

### 2. Add Trellis Example/Harness Validation Baseline

- [ ] Add or update a script/check that scans retained examples/harness/docs for
      deleted current-surface Trellis paths: - `@lupinum/trellis/functions`; - `@lupinum/trellis/bridge`; - `tool.fromOperation`; - raw trusted-forwarding args in production/default paths; - deleted starter spellings such as `workspace --mcp` and `--template cms`.
- [ ] Allow historical/meta/refactor text only through explicit allowlist
      comments or path classification.
- [ ] Wire the check into an existing lightweight validation path if appropriate
      (`check:repo-policies` or `check:examples:doctor`), but do not make broad
      e2e part of the default gate.
- [ ] Add tests for the scanner/check if it contains non-trivial filtering.

### 3. Establish Ginko Baseline Report

- [ ] Add a Trellis-side baseline note listing current Ginko old-path hits and
      their classification: - active code migration; - active package-boundary assertion; - historical/refactor docs; - test fixture input.
- [ ] Confirm whether Ginko already depends on `@lupinum/trellis-bridge`.
- [ ] Identify the first Ginko migration sprint target, likely MCP operation
      binding from `rawMcpRuntime.tool.fromOperation(...)` to
      `mcp.tool.operation(...)`.
- [ ] Do not mark any Ginko prove item complete until a packed Trellis package
      install/check has run.

### 4. Run Existing Gates

- [ ] Run Trellis retained example/harness validation available today:
      `pnpm run check:examples:doctor`.
- [ ] Run current Trellis example tests only if the new baseline check touches
      example behavior; otherwise keep this sprint to static validation.
- [ ] Run Ginko read-only checks that do not require package packing if cheap:
      package-boundary/no-zombie-path tests or `pnpm run check` only if the
      dependency state is already installed and stable.
- [ ] Record failures as baseline blockers instead of silently weakening tests.

### 5. Update Trackers

- [ ] Mark "Decide which examples/harness/docs/devtools targets remain" complete
      only after the decision table is recorded.
- [ ] Mark "Trellis examples/harness validation passes for retained targets"
      complete only after the new/existing gate passes.
- [ ] Add a Sprint 65 note to the cross-repo gate section.
- [ ] Do not mark Ginko package cutover or Ginko prove items complete in this
      baseline sprint.

## Verification

- [ ] `pnpm run check:examples:doctor`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] Focused tests for any new validation script/check.
- [ ] `pnpm exec oxfmt --check meta/refactor/sprint65-cross-repo-gate-baseline-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- Retained Trellis examples/harness/docs/devtools targets are explicitly listed.
- There is a repeatable gate for old Trellis paths in retained local targets.
- Ginko's active old-path migration surface is recorded before editing it.
- The next sprint can migrate one Ginko surface with a known before/after and a
  known validation command.
