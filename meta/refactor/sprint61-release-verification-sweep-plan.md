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

- [x] Confirm working tree is clean before running release verification.
- [x] Run the full local unit repository suite.
- [x] Run the forwarding envelope benchmark.
- [x] Run bridge-focused fixture and package tests.
- [x] Record exact failures here if any gate is red.

### 2. Fix Unit Suite Failures

- [x] Classify failures as stale test, real regression, missing fixture update,
      or environment-only issue.
- [x] Fix real regressions directly.
- [x] Delete or update stale compatibility expectations that conflict with the
      accepted 1.0 hard cuts.
- [x] Keep unit fixes narrow; do not use broad test skips.

### 3. Fix Forwarding Benchmark Drift

- [x] Run `node scripts/bench-forwarding-envelope.mjs`.
- [x] Confirm benchmark still reports p99 baseline.
- [x] If the benchmark fails, fix script/runtime drift rather than weakening the
      forwarding model.
- [x] Do not turn the benchmark into a hard flaky CI threshold in this sprint.

### 4. Fix Bridge Fixture/Test Drift

- [x] Run bridge package/component tests.
- [x] Confirm bridge package exports remain outside core/backend.
- [x] Confirm bridge signed-forwarding tests still use `transport: "bridge"` and
      exact function refs.
- [x] Confirm the Ginko-shaped fixture stays minimal and does not reintroduce
      beginner-facing bridge concepts.

### 5. Update Trackers

- [x] Mark Slice 13 `Full unit suite` complete only after the full local unit
      gate passes.
- [x] Mark Slice 13 `Forwarding benchmark` complete only after the benchmark
      reports a valid baseline.
- [x] Mark Slice 13 `Bridge fixture tests` complete only after bridge-focused
      tests pass.
- [x] Add a Sprint 61 completion note to the 1.0 refactor tracker.

## Verification

- [x] `pnpm run test:repo`
- [x] `node scripts/bench-forwarding-envelope.mjs`
- [x] `pnpm exec vitest run --project=unit tests/unit/create-component-bridge.test.ts tests/unit/component-bridge-manifest.test.ts tests/unit/bridge-package.test.ts tests/unit/bridge-package-exports.test.ts tests/unit/backend-index-exports.test.ts tests/unit/functions-index-exports.test.ts`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec oxfmt --check meta/refactor/sprint61-release-verification-sweep-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Result

- Full `test:repo` passes: 162 files, 1324 tests.
- Forwarding benchmark reports p99 `0.1345ms` for
  `trusted-forwarding-envelope.verify`.
- Bridge-focused unit tests pass: 6 files, 24 tests.
- Fixed a real concurrent `build:cli` race in fixture copying by staging copied
  fixture directories in process-local temp directories before publishing them.
- Updated stale tests to match current 1.0 behavior: server auth errors include
  the helper/function context, Better Auth 401/403 errors remain auth errors
  even with `INVALID_*` codes, and Convex cross-process tests no longer assert
  in-process observation capture.

## Done Means

- Slice 13 local verification has no hidden red gates for unit, forwarding
  benchmark, or bridge fixture coverage.
- Any failures found are fixed at the source, not suppressed.
- The tracker reflects only verified state.
- The repo is ready for the next non-local gate: migration tooling, docs, or
  Ginko cross-repo validation.
