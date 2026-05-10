# Sprint 24: Fixture-Backed Workspace MCP Starter

## Goal

Finish the retained starter fixture cutover by making `workspace-mcp` render
from a maintained starter fixture and deleting the remaining legacy starter
assembly path for retained Trellis starters.

By the end of this sprint, `trellis init --template workspace-mcp` should render
from `src/cli/starter-fixtures/workspace-mcp/starter.manifest.json`, not from
inline/static template fragments. Once that works, delete the old
workspace/MCP template functions and `.tpl` files that are no longer required by
any retained starter or `trellis add` feature.

## Why This Sprint Comes Next

Slice 7 now has fixture-backed starters for:

- `public`;
- `personal`;
- `workspace`.

`workspace-mcp` is the last retained beginner starter still assembled from
legacy fragments. Keeping it on the old path means the repo still has two
starter systems:

- fixture manifests for public/personal/workspace;
- inline/template assembly for workspace-MCP.

This sprint removes that split. It also closes the loop opened in Sprint 23:
workspace helper templates were kept only because `workspace-mcp` still used
them.

## Current State

- `src/cli/starter-fixtures/workspace` is the source of truth for the workspace
  starter.
- `tests/fixtures/phase0-workspace-mcp` proves generated operation/tool refs and
  manifest codegen, but it is a Phase 0 proof fixture, not the shipped CLI
  starter fixture.
- `workspace-mcp` still uses:
  - `buildAuthTemplateSet()`;
  - `buildWorkspacePermissionsTemplateSet('workspace-mcp')`;
  - `buildMcpTemplateSet()`;
  - workspace feature/schema/domain template functions;
  - MCP runtime/tool/key template functions;
  - inline `workspacePageTemplate({ mcp: true })` output.
- `cms` is still a separate open cleanup item and must not drive this sprint.

## Non-Goals

- Do not redesign MCP tool APIs or the MCP starter UI.
- Do not add operation-backed destructive MCP examples to the starter unless
  they already exist in current generated output.
- Do not migrate CMS/Ginko setup.
- Do not convert `tests/fixtures/phase0-workspace-mcp` into the shipped starter
  fixture; keep it as a focused proof fixture unless implementation shows it is
  redundant.
- Do not preserve the old workspace-MCP template path once the fixture path is
  verified.
- Do not create compatibility aliases for deleted starter helpers.

## Design Target

### Fixture Layout

Add:

```text
src/cli/starter-fixtures/workspace-mcp/
```

The fixture should contain the real generated CLI starter source:

- `starter.manifest.json`
- `.env.example`
- `.gitignore`
- `README.md`
- `package.json`
- `nuxt.config.ts`
- `app/**`
- `convex/**`
- `server/**`
- `shared/**`

The manifest should include only files that belong in the generated starter and
exclude local/runtime artifacts:

```text
.convex/**
.env.local
.nuxt/**
.output/**
node_modules/**
coverage/**
```

### Rendering Rule

Extend `renderAppStarterFixture(...)` to support `workspace-mcp`:

1. add `workspace-mcp` to the fixture-backed template type;
2. add `trellis-starter-workspace-mcp` as the source app name;
3. render `workspace-mcp` through `renderAppStarterFixture(...)`;
4. keep only `cms` on any legacy starter path.

### Deletion Rule

After `workspace-mcp` renders from a fixture and tests pass:

- delete workspace/MCP template functions that no retained app starter or
  `trellis add` feature still references;
- delete corresponding `.tpl` files;
- delete unused imports from `src/cli/lib/init.ts`;
- keep only templates still used by `cms` or explicit add-feature commands.

The acceptance bar is not "delete every file with workspace in the name." The
bar is "no retained non-CMS starter has a second source of truth."

## Work Items

### 1. Create Workspace MCP Starter Fixture

- [x] Generate or copy the current `workspace-mcp` starter output into
      `src/cli/starter-fixtures/workspace-mcp`.
- [x] Add `starter.manifest.json`.
- [x] Keep only files that should ship in a generated workspace-MCP app.
- [x] Exclude all local/runtime artifacts.
- [x] Ensure the fixture includes workspace + MCP concepts.
- [x] Ensure the fixture does not include CMS, Ginko, bridge-author, or
      unrelated operation-projection proof fixture concepts.
- [x] Ensure the fixture keeps the current generated starter behavior before
      deleting the legacy path.

### 2. Wire CLI Init To Workspace MCP Fixture

- [x] Extend `FixtureBackedTemplate` to include `workspace-mcp`.
- [x] Add `workspace-mcp` to the fixture-backed template name set.
- [x] Add app-name replacement for `trellis-starter-workspace-mcp`.
- [x] Convert `buildAppTemplateSet('workspace-mcp', appName)` to return
      `renderAppStarterFixture({ appName, template: 'workspace-mcp' })`.
- [x] Preserve existing write semantics and package/README app-name transforms.
- [x] Keep `cms` on the existing legacy path.

### 3. Delete Replaced Starter Template Sources

- [x] Remove unused workspace/MCP imports from `src/cli/lib/init.ts`.
- [x] Delete `buildWorkspacePermissionsTemplateSet(...)` if no longer used.
- [x] Audit `buildMcpTemplateSet()`; keep it because `trellis add mcp` still
      uses it.
- [x] Delete workspace starter template functions from
      `src/cli/lib/init-templates.ts` that no retained path uses.
- [x] Audit MCP starter template functions in `src/cli/lib/init-templates.ts`;
      keep the helpers still used by `trellis add mcp`.
- [x] Delete corresponding `.tpl` files under `src/cli/templates/init`.
- [x] Keep only templates still used by `cms` and `trellis add` features.
- [x] Search proves `workspace` and `workspace-mcp` no longer have inline
      starter assembly branches.

### 4. Tests And Checks

- [x] Add manifest tests for `src/cli/starter-fixtures/workspace-mcp`.
- [x] Assert the workspace-MCP fixture includes MCP runtime/tools and forwarding
      env keys.
- [x] Assert the workspace-MCP fixture includes workspace/tenant files.
- [x] Assert the workspace-MCP fixture does not include CMS/Ginko/bridge-author
      concepts.
- [x] Smoke-generate `trellis init --template workspace-mcp` from the built CLI.
- [x] Verify generated output has app-name transforms and no
      `trellis-starter-workspace-mcp` placeholder.
- [x] Smoke-generate `public`, `personal`, and `workspace` after the template
      deletion to prove retained starters still work.
- [x] Update refactor surface inventory after deleted template sources.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/cli-doctor.test.ts \
  tests/unit/schema-boundary-policy.test.ts
```

CLI smoke:

```bash
pnpm run build:cli
rm -rf /tmp/trellis-workspace-mcp-fixture-test
mkdir -p /tmp/trellis-workspace-mcp-fixture-test
node dist/cli.mjs init demo-workspace-mcp \
  --template workspace-mcp \
  --cwd /tmp/trellis-workspace-mcp-fixture-test \
  --json
rg -n "trellis-starter-workspace-mcp|ginko|cms|bridge-author" \
  /tmp/trellis-workspace-mcp-fixture-test \
  -g '!node_modules/**'
test -f /tmp/trellis-workspace-mcp-fixture-test/demo-workspace-mcp/server/mcp/runtime.ts
test -f /tmp/trellis-workspace-mcp-fixture-test/demo-workspace-mcp/server/mcp/tools/list-todos.ts
test -f /tmp/trellis-workspace-mcp-fixture-test/demo-workspace-mcp/server/mcp/tools/create-todo.ts
```

Retained starter smoke:

```bash
rm -rf /tmp/trellis-retained-starter-smoke
mkdir -p /tmp/trellis-retained-starter-smoke
node dist/cli.mjs init demo-public --template public --cwd /tmp/trellis-retained-starter-smoke --json
node dist/cli.mjs init demo-personal --template personal --cwd /tmp/trellis-retained-starter-smoke --json
node dist/cli.mjs init demo-workspace --template workspace --cwd /tmp/trellis-retained-starter-smoke --json
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
  src/cli/lib/init.ts \
  src/cli/lib/init-templates.ts \
  src/cli/lib/starter-fixtures.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/schema-boundary-policy.test.ts \
  scripts/check-publish-specifiers.mjs \
  scripts/copy-cli-templates.mjs
```

Search checks:

```bash
rg -n "buildWorkspacePermissionsTemplateSet" src/cli/lib/init.ts
rg -n "workspacePageTemplate\\(|workspaceFunctionsAppTemplate|workspaceTodosTemplate" src/cli/lib/init.ts src/cli/lib/init-templates.ts
```

## Acceptance Criteria

- [x] `trellis init --template workspace-mcp` renders from
      `src/cli/starter-fixtures/workspace-mcp/starter.manifest.json`.
- [x] Workspace-MCP fixture exposes workspace + MCP concepts but no CMS/Ginko or
      bridge-author concepts.
- [x] Replaced workspace/MCP starter template code is deleted.
- [x] `public`, `personal`, and `workspace` still render from fixtures.
- [x] `cms` remains the only app starter on the legacy path.
- [x] Existing starter manifest, doctor, schema-boundary, public-surface, and
      CLI checks pass.
- [x] Slice 7 `workspace-mcp` item is checked in
      `meta/trellis-1.0-refactor-plan.md`.
- [x] Sprint changes are committed after verification.

## Next Sprint Candidate

If this lands cleanly, Sprint 25 should resolve the remaining `cms` starter
surface: either delete `cms` from Trellis 1.0 init entirely and document
Ginko-owned setup, or convert it into the explicitly decided advanced
bridge-consumer/bridge-author path. That sprint should also delete any remaining
starter `.tpl` sources that are only kept for `cms`.

## Exit Notes

- `workspace-mcp` now renders from
  `src/cli/starter-fixtures/workspace-mcp`.
- The old workspace/workspace-MCP starter assembly branch was deleted from
  `src/cli/lib/init.ts`.
- Workspace-only starter template functions and `.tpl` files were deleted.
- MCP runtime/tool template helpers remain because `trellis add mcp` still uses
  them.
- `cms` remains the only app starter on the legacy template assembly path.
