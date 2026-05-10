# Sprint 22: Fixture-Backed Public And Personal Starters

## Goal

Start Slice 7 by making real fixture apps the source of truth for the `public`
and `personal` starters.

By the end of this sprint, `trellis init --template public` and
`trellis init --template personal` should render from maintained fixture
manifests, not hand-assembled inline/string templates. Once each fixture path is
live and tested, delete the old public/personal starter template functions and
`.tpl` files they replaced.

## Why This Sprint Comes Next

Slice 6 is complete. The next biggest source of parallel implementation is the
starter system:

- `tests/fixtures/phase0-workspace-mcp` already proves fixture manifests and
  generated files can work.
- `src/cli/lib/init.ts` still assembles starters from many inline/static
  template fragments.
- `src/cli/lib/init-templates.ts` and `src/cli/templates/init/*.tpl` remain a
  second source of truth.

The smallest useful cut is `public` plus `personal`:

- `public` proves the no-auth beginner path.
- `personal` proves auth + actor without workspace/MCP complexity.
- `workspace` and `workspace-mcp` can follow once this cutover shape is boring.

## Current State

- `phase0-workspace-mcp` fixture has a manifest and generated-file support.
- CLI init output for public/personal already uses the 1.0 backend lanes.
- Public/personal starter files are still assembled from:
  - `src/cli/lib/init.ts`
  - `src/cli/lib/init-templates.ts`
  - selected `src/cli/templates/init/*.tpl`
- CLI tests assert generated public/personal files directly, but they do not
  prove fixture source ownership.

## Non-Goals

- Do not convert `workspace` or `workspace-mcp` in this sprint.
- Do not finish the full inventory engine.
- Do not redesign starter UX or app UI.
- Do not preserve public/personal template functions as compatibility paths once
  fixture rendering passes.
- Do not keep fixture output and inline templates as two maintained sources.
- Do not migrate CMS; the current 1.0 plan says CMS ownership is separate.

## Design Target

### Fixture Layout

Add maintained starter fixtures:

```text
tests/fixtures/starter-public/
tests/fixtures/starter-personal/
```

Each fixture owns:

- `starter.manifest.json`
- `package.json`
- `nuxt.config.ts`
- `app/**`
- `convex/**`
- `shared/**`
- only the generated files that the real starter must produce

Each manifest excludes local/runtime artifacts:

```text
.convex/**
.env.local
.nuxt/**
.output/**
node_modules/**
coverage/**
```

### CLI Rendering

Add a focused fixture loader/render path for app starters. The public API should
stay `getCanonicalAppTemplateSet(...)`; callers should not care whether a
starter comes from fixture files or a legacy template set while the cutover is in
progress.

For `public` and `personal`, `getCanonicalAppTemplateSet(...)` should:

1. load the fixture manifest;
2. render selected files through `renderStarterFixtureFiles(...)`;
3. apply app-name transforms where required;
4. return the existing `InitTemplateSet` shape for `applyInitTemplateSet(...)`.

The old template functions for public/personal are deleted after the fixture
path passes tests.

## Work Items

### 1. Create Public Starter Fixture

- [ ] Add `tests/fixtures/starter-public/starter.manifest.json`.
- [ ] Move/copy the current public starter output into the fixture as authored
      files.
- [ ] Keep only source files required for a generated starter.
- [ ] Exclude all generated/local runtime artifacts.
- [ ] Ensure the fixture does not include auth, workspace, MCP, bridge, or
      operation concepts.

### 2. Create Personal Starter Fixture

- [ ] Add `tests/fixtures/starter-personal/starter.manifest.json`.
- [ ] Move/copy the current personal starter output into the fixture as authored
      files.
- [ ] Keep auth + actor files, but no workspace, MCP, bridge, or operation
      concepts.
- [ ] Exclude all generated/local runtime artifacts.
- [ ] Keep fixture source readable enough that starter users can learn from it.

### 3. Wire CLI Init To Fixture Rendering

- [ ] Add a small app-starter fixture resolver.
- [ ] Convert `public` to render from `starter-public`.
- [ ] Convert `personal` to render from `starter-personal`.
- [ ] Preserve existing `applyInitTemplateSet(...)` write semantics.
- [ ] Preserve README/env/package app-name transforms.
- [ ] Keep `workspace`, `workspace-mcp`, and `cms` on the existing path for now.

### 4. Delete Replaced Template Sources

- [ ] Delete public-only template functions from `src/cli/lib/init-templates.ts`.
- [ ] Delete personal-only template functions from `src/cli/lib/init-templates.ts`.
- [ ] Delete public/personal `.tpl` files no longer referenced.
- [ ] Remove unused imports from `src/cli/lib/init.ts`.
- [ ] Do not delete shared templates still used by workspace/CMS/auth helpers.

### 5. Tests And Checks

- [ ] Add manifest tests for `starter-public` and `starter-personal`.
- [ ] Add or update init tests proving public/personal output comes from fixture
      rendering.
- [ ] Existing public/personal init tests still pass.
- [ ] Personal doctor smoke still passes.
- [ ] Search proves deleted public/personal template functions are gone.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/cli-doctor.test.ts
```

Public surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
```

Search checks:

```bash
rg -n "publicFunctionsTemplate|publicTodosTemplate|publicPageTemplate|personalFunctionsTemplate|personalTodosTemplate|personalPageTemplate" src/cli
rg -n "src/cli/templates/init/(public|personal)" src tests meta
```

Known non-gates unless this sprint touches them directly:

```bash
pnpm run test:types:harness-server
pnpm run format:check
```

## Acceptance Criteria

- [ ] `trellis init --template public` renders from
      `tests/fixtures/starter-public/starter.manifest.json`.
- [ ] `trellis init --template personal` renders from
      `tests/fixtures/starter-personal/starter.manifest.json`.
- [ ] Public fixture exposes only public-layer concepts.
- [ ] Personal fixture exposes auth/personal concepts but no workspace/MCP/bridge
      concepts.
- [ ] Replaced public/personal template code is deleted.
- [ ] Existing init and doctor tests pass for public/personal.
- [ ] Slice 7 public/personal items are checked in
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Sprint changes are committed after verification.

## Next Sprint Candidate

If this sprint lands cleanly, Sprint 23 should convert `workspace` and
`workspace-mcp` to fixture-backed starters using the same path, then delete the
remaining old beginner `.tpl` starter source.
