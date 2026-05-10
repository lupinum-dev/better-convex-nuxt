# Sprint 61: Release Verification Sweep

## Summary

Close the remaining local Slice 13 verification gaps after restoring type and
lint gates. This sprint proves the current 1.0 refactor baseline with the full
unit repository suite, forwarding benchmark, and bridge-focused fixture/tests
before broader docs, migration tooling, or Ginko cross-repo work resumes.

Owner: Codex.

## Why This Sprint

Sprint 59 restored `test:types`; Sprint 60 restored `pnpm run lint` and
formatting. The tracker still has unchecked local verification items:

1. Full unit suite.
2. Forwarding benchmark.
3. Bridge fixture tests.

Those are release-gate checks, not feature work. Running them now keeps the
1.0 baseline honest and prevents later sprints from building on unverified
assumptions.

## Constraints

- Do not broaden this into docs rewrite, Ginko migration, or migration tooling.
- Do not add compatibility shims to make tests pass.
- Do not skip slow or flaky-looking failures; classify them and fix the
  smallest real cause.
- Do not update snapshots blindly. Public/bridge surface diffs need a reason.
- Prefer deleting stale tests or stale fixture assumptions over preserving old
  behavior.
- If a failure belongs to an external/cross-repo gate, document it separately
  and keep this sprint focused on Trellis-local verification.

## Work Items

### 1. Establish Baseline

- [ ] Confirm working tree is clean before running release verification.
- [ ] Run the full local unit repository suite.
- [ ] Run the forwarding envelope benchmark.
- [ ] Run bridge-focused fixture and package tests.
- [ ] Record exact failures here if any gate is red.

### 2. Fix Unit Suite Failures

- [ ] Classify failures as stale test, real regression, missing fixture update,
      or environment-only issue.
- [ ] Fix real regressions directly.
- [ ] Delete or update stale compatibility expectations that conflict with the
      accepted 1.0 hard cuts.
- [ ] Keep unit fixes narrow; do not use broad test skips.

### 3. Fix Forwarding Benchmark Drift

- [ ] Run `node scripts/bench-forwarding-envelope.mjs`.
- [ ] Confirm benchmark still reports p99 baseline.
- [ ] If the benchmark fails, fix script/runtime drift rather than weakening the
      forwarding model.
- [ ] Do not turn the benchmark into a hard flaky CI threshold in this sprint.

### 4. Fix Bridge Fixture/Test Drift

- [ ] Run bridge package/component tests.
- [ ] Confirm bridge package exports remain outside core/backend.
- [ ] Confirm bridge signed-forwarding tests still use `transport: "bridge"` and
      exact function refs.
- [ ] Confirm the Ginko-shaped fixture stays minimal and does not reintroduce
      beginner-facing bridge concepts.

### 5. Update Trackers

- [ ] Mark Slice 13 `Full unit suite` complete only after the full local unit
      gate passes.
- [ ] Mark Slice 13 `Forwarding benchmark` complete only after the benchmark
      reports a valid baseline.
- [ ] Mark Slice 13 `Bridge fixture tests` complete only after bridge-focused
      tests pass.
- [ ] Add a Sprint 61 completion note to the 1.0 refactor tracker.

## Verification

- [ ] `pnpm run test:repo`
- [ ] `node scripts/bench-forwarding-envelope.mjs`
- [ ] `pnpm exec vitest run --project=unit tests/unit/create-component-bridge.test.ts tests/unit/component-bridge-manifest.test.ts tests/unit/bridge-package.test.ts tests/unit/bridge-package-exports.test.ts tests/unit/backend-index-exports.test.ts tests/unit/functions-index-exports.test.ts`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check meta/refactor/sprint61-release-verification-sweep-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- Slice 13 local verification has no hidden red gates for unit, forwarding
  benchmark, or bridge fixture coverage.
- Any failures found are fixed at the source, not suppressed.
- The tracker reflects only verified state.
- The repo is ready for the next non-local gate: migration tooling, docs, or
  Ginko cross-repo validation.
