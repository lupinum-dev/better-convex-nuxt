# Sprint 70: Ginko Full Check Gate

## Summary

Run Ginko CMS through its full local quality gate after the Trellis 1.0 bridge,
MCP, forwarding, and declaration-portability cutovers.

Sprint 69 unblocked `pnpm run typecheck`. The next useful gate is not another
API refactor; it is the real Ginko package check. This sprint should make
`pnpm run check` pass in Ginko without weakening the checks, skipping package
validation, or restoring old Trellis paths.

## Why This Sprint

The cross-repo gate still has two kinds of work open:

- prove the real Ginko consumer is healthy after the Trellis 1.0 cutovers;
- clean up Ginko-facing docs/setup wording so users see Ginko-owned setup, not
  Trellis bridge internals.

The full Ginko check is the better next blocker because it exercises formatting,
lint guardrails, typecheck, publish-specifier checks, and the full test suite in
one repeatable command. Docs cleanup should happen only where the check or a
targeted scan proves current docs still teach old public APIs.

## Non-Goals

- Do not run packed-package install validation in this sprint unless full local
  `pnpm run check` is green first.
- Do not change Trellis public APIs to satisfy a Ginko check.
- Do not disable or narrow Ginko lint/type/test/publish checks.
- Do not reintroduce raw forwarding, `tool.fromOperation`, or old bridge import
  paths.
- Do not perform a broad docs rewrite; only fix current setup wording or old API
  references found by targeted checks.

## Action Plan

### 1. Establish The Full Check Baseline

- [ ] Run `pnpm run check` in Ginko CMS.
- [ ] Classify each failure as formatting, lint guardrail, typecheck,
      publish-specifier, unit/integration test, or docs/setup wording.
- [ ] Record the first failing command and representative error in this plan.

### 2. Fix Only Real Gate Failures

- [ ] Fix formatting failures with the formatter, not manual churn.
- [ ] Fix lint/guardrail failures at the source of truth, not by weakening the
      guardrail.
- [ ] Fix tests by preserving the new Trellis 1.0 shape:
      `@lupinum/trellis-bridge`, signed `_trellisForwarding`, explicit
      `functionRefModule`, and `mcp.tool.operation(...)`.
- [ ] If docs/setup wording fails a targeted check, update docs so users see
      `ginko-cms init`, Ginko-owned bridge health commands, and Ginko
      terminology.

### 3. Add A Narrow Guardrail Only If A Zombie Path Is Found

- [ ] If the check exposes old public paths that are not currently guarded,
      add one focused scan/test for that exact path.
- [ ] Do not add broad regex checks over historical `docs/refactor/**` notes.
- [ ] Keep historical notes historical; current docs and setup output must not
      teach deleted Trellis APIs.

### 4. Verify Ginko

- [ ] `pnpm run check`
- [ ] `rg -n "tool\\.fromOperation|_trustedForwardingKey|_trustedForwarding\\b|@lupinum/trellis/(functions|bridge)" README.md docs packages test -g '!docs/refactor/**'`
      returns no current-user-facing deleted-path hits, or every remaining hit
      is deliberately documented in this plan.
- [ ] `git diff --check`
- [ ] `git status --short` shows only intentional sprint changes before commit.

### 5. Verify Trellis If Touched

- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check meta/refactor/sprint70-ginko-full-check-gate-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

### 6. Update The Refactor Tracker

- [ ] Add a Sprint 70 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Mark Ginko full local check proof complete only if `pnpm run check`
      passes.
- [ ] Mark Ginko docs/setup wording complete only if current docs/setup scans
      prove old Trellis API wording is gone.
- [ ] Leave packed Trellis package install validation open unless packed
      packages are actually installed into Ginko and checked.

## Done Means

- Ginko CMS `pnpm run check` passes locally.
- Current Ginko docs/setup output no longer teach deleted Trellis paths.
- No old raw forwarding, `tool.fromOperation`, or old bridge import path returns
  to live code.
- The Trellis tracker honestly separates local Ginko health from packed-package
  install validation.
