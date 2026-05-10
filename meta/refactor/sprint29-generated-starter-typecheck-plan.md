# Sprint 29: Generated Starter Typecheck Harness

## Goal

Close the next Slice 7 proof gap: generated starters must typecheck as real
consumer apps, not only render correctly and pass doctor.

By the end of this sprint, the repo should have a repeatable validation path
that:

- generates `public`, `personal`, `workspace`, and `workspace-mcp`;
- installs each generated app against the current local Trellis package;
- generates Convex `_generated` files for each app;
- runs Nuxt prepare/typecheck for each app;
- reports clear per-starter failures without committing generated artifacts.

## Why This Sprint Comes Next

Sprint 28 proved the starter source of truth:

- starters render from fixtures;
- generated file sets match fixture manifests;
- disabled-layer concepts do not leak;
- doctor passes for every retained starter.

The remaining Slice 7 proof boxes are:

- each fixture typechecks;
- each fixture builds.

Typecheck comes before build because it proves the dependency, Convex codegen,
Nuxt prepare, and generated type contracts. Build should not become the first
place we discover those foundational problems.

## Current Blocker

Sprint 28 found that ad hoc typecheck fails before it reaches useful compiler
feedback:

- generated apps depend on `@lupinum/trellis: workspace:*`;
- a generated temp app is not inside a workspace containing Trellis;
- `pnpm --dir <generated-app> exec nuxi typecheck` cannot run until
  dependencies are installed;
- installing the generated app as-is fails outside the repo workspace.

The sprint should solve the validation setup, not weaken starter package files
or commit generated Convex output.

## Non-Goals

- Do not add generated starter apps to the repo workspace.
- Do not commit Convex `_generated` files into starter fixtures.
- Do not change starter fixture `package.json` files only to satisfy local
  validation.
- Do not make full `nuxi build` a hard gate in this sprint.
- Do not add compatibility paths or duplicate dependency declarations.
- Do not introduce a second starter renderer.
- Do not require a live Convex deployment for typecheck validation.

## Design Target

### Validation Uses A Packed Local Trellis Package

Generated apps should typecheck against a package-shaped Trellis install, not a
source alias.

Preferred path:

1. build the module/package artifacts needed by consumers;
2. run `pnpm pack` into a temp validation directory;
3. generate starters with `dist/cli.mjs`;
4. rewrite only the generated temp app dependency from
   `@lupinum/trellis: workspace:*` to the packed tarball path;
5. install dependencies inside the generated app;
6. run Convex codegen and Nuxt typecheck.

This keeps fixture source honest while giving the validation harness a real
consumer install.

If `pnpm pack` proves unstable or too slow, the acceptable fallback is a
validation-only temp workspace that includes:

- the generated app;
- a local package reference to the repo root;
- no committed generated files.

The sprint should pick one path and document why.

### Extend Or Pair With The Starter Harness

Prefer extending `scripts/check-starter-fixtures.mjs` with an explicit
typecheck mode over adding a parallel harness.

Acceptable shapes:

```bash
pnpm run check:starter-fixtures
pnpm run check:starter-fixtures:typecheck
```

or:

```bash
pnpm run check:starter-fixtures -- --typecheck
```

Use the clearer package script if the command-line parsing would make the
existing harness harder to read.

### Proof Levels

Keep proof levels visible:

```text
level 1: generated files and layer boundaries
level 2: doctor
level 3: install, Convex codegen, Nuxt prepare/typecheck
level 4: build
```

Sprint 29 must make level 3 reliable. Level 4 remains a follow-up unless it is
already free after level 3 lands.

## Work Items

### 1. Add Typecheck Validation Mode

- [ ] Add a typecheck validation path for all retained starters.
- [ ] Reuse the existing generated temp app flow from
      `scripts/check-starter-fixtures.mjs`.
- [ ] Keep temp directories cleaned up on success and failure.
- [ ] Print a concise per-starter summary that names install, codegen, prepare,
      and typecheck status.

### 2. Install Generated Apps Against Local Trellis

- [ ] Build the package artifacts required by generated consumer apps.
- [ ] Create a local Trellis package artifact or validation workspace.
- [ ] Rewrite only temp generated app package dependencies as validation setup.
- [ ] Do not mutate source fixture `package.json` files.
- [ ] Fail with an actionable error if package artifacts are missing.

### 3. Generate Convex Types Without A Deployment

- [ ] Run Convex codegen for each generated app.
- [ ] Use `--typecheck=disable` for codegen if needed so Nuxt typecheck remains
      the type gate.
- [ ] Prove `_generated` files are created in temp output only.
- [ ] Avoid requiring live Convex credentials or a new Convex project.

### 4. Run Nuxt Typecheck

- [ ] Run Nuxt prepare/typecheck for each retained generated starter.
- [ ] Capture and print failing command output with the starter name.
- [ ] Keep doctor validation from Sprint 28 intact.
- [ ] Do not hide type errors with broad `skipLibCheck` or fixture-only casts.

### 5. Update Trackers

- [ ] Add the new package script to `package.json`.
- [ ] Update this sprint plan with exit notes.
- [ ] Mark `Each fixture typechecks` in
      `meta/trellis-1.0-refactor-plan.md` only if all retained starters pass.
- [ ] Leave `Each fixture builds` unchecked unless full build is explicitly
      proven.

## Verification

Baseline starter checks:

```bash
pnpm run build:cli
pnpm run check:starter-fixtures
```

Typecheck harness:

```bash
pnpm run check:starter-fixtures:typecheck
```

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-add-resource.test.ts
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
pnpm exec oxfmt --check scripts/check-starter-fixtures.mjs
```

## Acceptance Criteria

- [ ] A repo-owned generated-starter typecheck command exists.
- [ ] The command validates all retained starters.
- [ ] Generated apps install against the current local Trellis package.
- [ ] Convex codegen runs for each generated app without a live deployment.
- [ ] Nuxt typecheck passes for each generated app.
- [ ] No source fixture package files are rewritten for validation-only needs.
- [ ] No generated `_generated`, `.nuxt`, or `node_modules` artifacts are
      committed.
- [ ] Slice 7 tracker is updated.
- [ ] Sprint changes are committed after verification.

## Next Sprint Candidate

If generated starter typecheck lands cleanly, Sprint 30 should close the final
Slice 7 proof box: generated starter build validation. It should reuse the same
install/package/codegen setup and decide whether all four starters run full
`nuxi build`, or whether build is limited to a smaller representative set with
an explicit reason.
