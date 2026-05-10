# Sprint 30: Generated Starter Build Harness

## Goal

Close the final Slice 7 proof gap: generated starters must build as real
consumer apps, not only render, pass doctor, and typecheck.

By the end of this sprint, the repo should have a repeatable validation path
that:

- generates `public`, `personal`, `workspace`, and `workspace-mcp`;
- installs each generated app against the current packed Trellis package;
- runs offline Convex codegen and Nuxt prepare;
- runs Nuxt build for each starter that can build without live external
  services;
- records any build limitation as an explicit, actionable blocker instead of
  silently weakening the proof.

## Why This Sprint Comes Next

Sprint 29 added the generated-starter typecheck harness and proved level 3:

```text
level 1: generated files and layer boundaries
level 2: doctor
level 3: install, Convex codegen, Nuxt prepare/typecheck
level 4: build
```

Slice 7 has one unchecked item left:

- `Each fixture builds.`

Build validation should now reuse the Sprint 29 package/install/codegen setup.
Adding a parallel harness would create a second source of truth for starter
readiness.

## Current Risk

`nuxi build` may reveal runtime-only assumptions that typecheck does not:

- server code importing code that only works in Convex or Node;
- missing package files in the packed Trellis tarball;
- generated starter env defaults that pass doctor but break build;
- MCP/toolkit build behavior in `workspace-mcp`;
- Better Auth component codegen gaps from offline Convex validation.

The sprint should fix real generated-app defects. It should not hide build
problems by adding broad ignores, fixture-only casts, or fake runtime adapters.

## Non-Goals

- Do not add generated starter apps to the repo workspace.
- Do not commit `.output`, `.nuxt`, `node_modules`, Convex `_generated`, or
  generated starter artifacts.
- Do not require a live Convex deployment or new Convex project.
- Do not add a second starter validation script if the existing harness can be
  extended cleanly.
- Do not weaken starter source files only to satisfy the build harness.
- Do not broaden the public API or add compatibility paths.
- Do not complete Slice 8 inventory/doctor work in this sprint.

## Design Target

### Extend The Existing Harness

Prefer extending `scripts/check-starter-fixtures.mjs` again:

```bash
pnpm run check:starter-fixtures
pnpm run check:starter-fixtures:typecheck
pnpm run check:starter-fixtures:build
```

The build mode should reuse the same generated temp apps, packed Trellis
tarball, dependency rewrite, offline codegen, and Nuxt prepare path from
typecheck mode.

The build mode can either:

1. run typecheck first and then build, or
2. share setup with typecheck but run only the build command after codegen and
   prepare.

Pick the smaller implementation that keeps failure output clear.

### Build All Retained Starters Unless A Real Blocker Exists

The default target is all four retained starters:

- `public`;
- `personal`;
- `workspace`;
- `workspace-mcp`.

If one starter cannot build without a live service, the harness must not mark
Slice 7 complete. Instead, this sprint should document:

- the failing command;
- the exact dependency on live external state;
- the smallest follow-up needed to make the build hermetic.

### Keep Temporary Offline Patches Narrow

Sprint 29 added a validation-only patch for Better Auth component metadata
because `convex codegen --system-udfs` does not emit component metadata offline.

Sprint 30 may reuse that patch if it is still the narrowest way to build
generated apps without live Convex credentials. It must not copy that patch into
starter source fixtures.

## Work Items

### 1. Add Build Validation Mode

- [x] Add a build validation mode to `scripts/check-starter-fixtures.mjs`.
- [x] Add `check:starter-fixtures:build` to `package.json`.
- [x] Reuse the existing temp app generation and packed Trellis package setup.
- [x] Print a concise per-starter summary that names install, codegen, prepare,
      typecheck if run, and build status.

### 2. Run Nuxt Build Against Generated Apps

- [x] Run each generated starter's `build` script or equivalent `nuxi build`
      command.
- [x] Keep `.env.local` setup aligned with doctor/typecheck validation.
- [x] Ensure generated `_generated`, `.nuxt`, `.output`, and install artifacts
      remain temp-only.
- [x] Capture and print failing command output with the starter name.

### 3. Fix Real Starter Build Defects

- [x] Fix any generated starter source that fails normal Nuxt build.
- [x] Fix any packed Trellis package surface that is missing files needed by
      generated consumers.
- [x] Keep fixes in canonical fixture/package source, not in generated temp
      output, unless the issue is explicitly validation-only.
- [x] Avoid broad build suppressions that would hide runtime import problems.

### 4. Update Slice 7

- [x] Mark `Each fixture builds` in
      `meta/trellis-1.0-refactor-plan.md` only if all retained starters build.
- [x] Add sprint exit notes with the final per-starter build result.
- [x] If a starter cannot build hermetically, leave Slice 7 unchecked and record
      the exact blocker.

## Verification

Baseline starter checks:

```bash
pnpm run check:starter-fixtures
pnpm run check:starter-fixtures:typecheck
```

Build harness:

```bash
pnpm run check:starter-fixtures:build
```

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/cli-add-resource.test.ts \
  tests/unit/trusted-forwarding-envelope.test.ts \
  tests/unit/trusted-forwarding.test.ts
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

- [x] A repo-owned generated-starter build command exists.
- [x] The command validates all retained starters, or records a specific
      hermetic-build blocker without marking Slice 7 complete.
- [x] Generated apps install against the current packed local Trellis package.
- [x] Convex codegen runs without a live deployment.
- [x] Nuxt build passes for every retained starter before Slice 7 is marked
      complete.
- [x] No generated `.nuxt`, `.output`, `_generated`, or `node_modules`
      artifacts are committed.
- [x] No source fixture package files are rewritten for validation-only needs.
- [x] Slice 7 tracker is updated.
- [x] Sprint changes are committed after verification.

## Exit Notes

- Added `pnpm run check:starter-fixtures:build`.
- Extended `scripts/check-starter-fixtures.mjs` with `--build` instead of adding
  a parallel starter build harness.
- Build mode reuses the Sprint 29 generated-app setup: packed local Trellis
  tarball, temp dependency rewrite, install, offline Convex codegen, Better Auth
  component metadata patch for temp generated output only, Nuxt prepare, and
  Nuxt typecheck.
- Build mode then runs each generated starter's normal `build` script.
- Current validation result:
  - `public`: 17 files, doctor 24 pass / 0 warn / 0 fail, install pass,
    codegen pass, prepare pass, typecheck pass, build pass;
  - `personal`: 26 files, doctor 24 pass / 0 warn / 0 fail, install pass,
    codegen pass, prepare pass, typecheck pass, build pass;
  - `workspace`: 37 files, doctor 24 pass / 0 warn / 0 fail, install pass,
    codegen pass, prepare pass, typecheck pass, build pass;
  - `workspace-mcp`: 42 files, doctor 24 pass / 0 warn / 0 fail, install pass,
    codegen pass, prepare pass, typecheck pass, build pass.
- No source fixture changes were needed for build validation.
- Slice 7 fixture-backed starter proof is now complete.

## Next Sprint Candidate

If build validation lands cleanly, Slice 7 should be complete. The next sprint
should move to Slice 8: inventory, doctor, and explain foundation. Start by
turning the existing doctor/starter/public-surface scanners into one explicit
inventory JSON producer instead of adding another scanner.
