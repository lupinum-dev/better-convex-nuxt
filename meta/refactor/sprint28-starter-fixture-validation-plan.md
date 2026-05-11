# Sprint 28: Starter Fixture Validation Harness

## Goal

Move Slice 7 from source cleanup to proof cleanup.

By the end of this sprint, retained fixture-backed starters should have a
repeatable validation harness that proves the generated apps are structurally
usable and doctor-checkable. The harness should become the foundation for later
build/typecheck gates without pretending those deeper gates are already cheap or
stable.

Retained starters:

- `public`;
- `personal`;
- `workspace`;
- `workspace-mcp`.

## Why This Sprint Comes Next

Sprints 22-27 finished the source-of-truth cleanup:

- retained starters render from fixtures;
- `cms` starter is deleted;
- `trellis add mcp` renders from the `workspace-mcp` fixture;
- `trellis add uploads` renders from an add fixture;
- old `.tpl` template source is gone.

The remaining Slice 7 work is proof:

- each fixture builds;
- each fixture typechecks;
- each fixture passes doctor;
- each `trellis init --template ...` output matches fixture-rendered
  expectation;
- no starter exposes concepts from disabled layers.

The right next step is not to manually run ad hoc commands. The right next step
is a repo-owned validation harness that makes this proof repeatable.

## Current State

- Unit tests validate fixture manifests and layer leakage.
- CLI smoke checks in prior sprints prove the four retained starters generate.
- `trellis doctor` can inspect generated app directories.
- Starter fixtures are copied into `dist` for the CLI.
- Starter fixture packages are not listed in `pnpm-workspace.yaml`.
- Starter fixture apps import Convex generated files such as
  `convex/_generated/server`, but those generated files are not committed to
  the fixture source.
- There is no single script that generates all retained starters and validates
  them as generated apps.

## Non-Goals

- Do not add committed Convex `_generated` files to starter fixtures.
- Do not add fixture apps to the pnpm workspace unless the validation harness
  proves that is the simplest stable path.
- Do not make full `nuxi build` or `nuxi typecheck` a hard gate before the
  generated Convex story is understood.
- Do not create a second starter renderer.
- Do not weaken existing manifest/layer tests.
- Do not change starter output unless validation reveals a real defect.

## Design Target

### One Validation Script

Add one script:

```text
scripts/check-starter-fixtures.mjs
```

It should:

1. run from the repo root;
2. require `dist/cli.mjs` to exist or call out that `pnpm run build:cli` must run
   first;
3. generate each retained starter into a fresh temp directory;
4. run `trellis doctor --json` for each generated app;
5. compare generated file paths against `getCanonicalAppTemplateSet(...)` or
   the fixture-rendered file list;
6. run layer-leakage checks on generated apps, not only source fixtures;
7. emit a compact JSON or table summary.

Keep this script boring. It should be a validation harness, not a new framework.

### Split Proof Levels

The harness should distinguish proof levels:

```text
level 1: generated files and layer boundaries
level 2: doctor
level 3: typecheck/codegen
level 4: build
```

Sprint 28 must make level 1 and level 2 reliable.

Level 3 and level 4 should be probed and documented in the sprint exit notes. If
they fail because Convex generated files or dependency installation are missing,
that should become explicit follow-up work, not a hidden red failure.

### Generated App Checks

For each generated app:

- expected files exist;
- no unexpected starter-only source paths leak into output;
- `public` output contains no auth/workspace/MCP concepts;
- `personal` output contains auth but no workspace/MCP concepts;
- `workspace` output contains workspace concepts but no MCP concepts;
- `workspace-mcp` output contains workspace and MCP concepts;
- no generated app contains CMS/Ginko starter language;
- no generated app contains old `.tpl` or old template-helper references.

### Doctor Checks

Doctor validation should be as strict as current generated starter readiness
allows.

If doctor reports warnings that are expected for unconfigured local env, the
script should classify them explicitly instead of hiding them. The useful output
is:

```text
starter  doctor-status  expected-warnings  unexpected-findings
public   pass           env-not-configured  none
```

Do not turn doctor warnings into stringly ignored noise. Name the expected
finding ids or exact stable messages.

## Work Items

### 1. Add Starter Validation Harness

- [x] Add `scripts/check-starter-fixtures.mjs`.
- [x] Generate `public`, `personal`, `workspace`, and `workspace-mcp` into a
      temp directory with `dist/cli.mjs`.
- [x] Make the script fail if `dist/cli.mjs` is missing and tell the developer
      to run `pnpm run build:cli`.
- [x] Keep temp output under a predictable ignored path or OS temp path.
- [x] Print a concise per-starter summary.

### 2. Prove Generated Output Matches Fixture Intent

- [x] Compare generated output paths with the fixture-rendered paths.
- [x] Fail on missing expected files.
- [x] Fail on unexpected old template artifacts.
- [x] Fail on CMS/Ginko starter wording in retained starter output.
- [x] Reuse existing layer-boundary text checks where practical.

### 3. Add Doctor Validation

- [x] Run `node dist/cli.mjs doctor --cwd <generated-app> --json` for each
      generated starter.
- [x] Parse JSON output instead of grepping human output.
- [x] Classify expected local-env findings explicitly.
- [x] Fail on unexpected blocking findings.

### 4. Add Package Script And Docs

- [x] Add `check:starter-fixtures` to `package.json`.
- [x] Include `pnpm run build:cli && pnpm run check:starter-fixtures` in the
      sprint verification.
- [x] Update Slice 7 in `meta/trellis-1.0-refactor-plan.md` with the new proof
      status.
- [x] Add exit notes to this sprint plan.

### 5. Probe Typecheck/Build Feasibility

- [x] Try the smallest stable typecheck path for one generated starter.
- [x] Record whether Convex codegen, Nuxt prepare, package installation, or
      workspace inclusion is the blocker.
- [x] Do not commit broad workspace changes only to make the probe pass.
- [x] Create the next sprint candidate from the probe result.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-add-resource.test.ts
```

Starter harness:

```bash
pnpm run build:cli
pnpm run check:starter-fixtures
```

Public surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Formatting/diff checks:

```bash
git diff --check
pnpm exec oxfmt --check \
  scripts/check-starter-fixtures.mjs \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-add-resource.test.ts
```

Search checks:

```bash
rg -n "src/cli/templates|\\.tpl|template source" src scripts tests package.json meta/refactor/sprint1-public-surface-inventory.md
rg -n "cms|ginko" /tmp/trellis-starter-fixtures-* 2>/dev/null || true
```

Expected result:

- no old template source references in runtime/CLI code;
- retained generated starters do not teach CMS/Ginko;
- `check:starter-fixtures` is repeatable from a clean built CLI.

## Acceptance Criteria

- [x] A repo-owned `check:starter-fixtures` script exists.
- [x] The script generates all retained starters with `dist/cli.mjs`.
- [x] The script verifies generated file sets against fixture intent.
- [x] The script runs doctor on every generated starter.
- [x] Expected doctor findings are named; unexpected findings fail the check.
- [x] Layer-boundary checks run against generated starter output.
- [x] Typecheck/build feasibility is probed and documented.
- [x] Slice 7 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `scripts/check-starter-fixtures.mjs` and `pnpm run
check:starter-fixtures`.
- The harness builds generated apps from `dist/cli.mjs` for `public`,
  `personal`, `workspace`, and `workspace-mcp`.
- It compares generated file sets against the source fixture manifests.
- It runs layer-boundary checks against generated output, not only fixture
  source.
- It writes local validation env and requires doctor JSON to return zero
  warnings and zero failures for every retained starter.
- Current validation result:
  - `public`: 16 files, doctor 24 pass / 0 warn / 0 fail;
  - `personal`: 25 files, doctor 24 pass / 0 warn / 0 fail;
  - `workspace`: 36 files, doctor 24 pass / 0 warn / 0 fail;
  - `workspace-mcp`: 41 files, doctor 24 pass / 0 warn / 0 fail.
- Typecheck/build probe result: `pnpm --dir <generated-app> exec nuxi
typecheck` cannot start because `nuxi` is not installed in the generated temp
  app. `pnpm install --lockfile-only` then fails because generated apps depend
  on `@lupinum/trellis: workspace:*` outside a workspace containing Trellis.
- Next proof work should decide whether generated starter validation happens
  inside a temporary workspace containing packed/linked Trellis, or by rewriting
  the generated dependency to a packed tarball for the validation run.

## Next Sprint Candidate

If level 1 and level 2 validation land cleanly, Sprint 29 should close the next
proof gap: generated starter typecheck/codegen. The likely work is either a
minimal Convex codegen harness for generated temp apps or a workspace-package
strategy for fixture validation, depending on what the Sprint 28 probe shows.
