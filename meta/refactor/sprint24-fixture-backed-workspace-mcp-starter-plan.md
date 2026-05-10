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

- [ ] Generate or copy the current `workspace-mcp` starter output into
      `src/cli/starter-fixtures/workspace-mcp`.
- [ ] Add `starter.manifest.json`.
- [ ] Keep only files that should ship in a generated workspace-MCP app.
- [ ] Exclude all local/runtime artifacts.
- [ ] Ensure the fixture includes workspace + MCP concepts.
- [ ] Ensure the fixture does not include CMS, Ginko, bridge-author, or
      unrelated operation-projection proof fixture concepts.
- [ ] Ensure the fixture keeps the current generated starter behavior before
      deleting the legacy path.

### 2. Wire CLI Init To Workspace MCP Fixture

- [ ] Extend `FixtureBackedTemplate` to include `workspace-mcp`.
- [ ] Add `workspace-mcp` to the fixture-backed template name set.
- [ ] Add app-name replacement for `trellis-starter-workspace-mcp`.
- [ ] Convert `buildAppTemplateSet('workspace-mcp', appName)` to return
      `renderAppStarterFixture({ appName, template: 'workspace-mcp' })`.
- [ ] Preserve existing write semantics and package/README app-name transforms.
- [ ] Keep `cms` on the existing legacy path.

### 3. Delete Replaced Starter Template Sources

- [ ] Remove unused workspace/MCP imports from `src/cli/lib/init.ts`.
- [ ] Delete `buildWorkspacePermissionsTemplateSet(...)` if no longer used.
- [ ] Delete `buildMcpTemplateSet()` if no longer used.
- [ ] Delete workspace starter template functions from
      `src/cli/lib/init-templates.ts` that no retained path uses.
- [ ] Delete MCP starter template functions from `src/cli/lib/init-templates.ts`
      that no retained path uses.
- [ ] Delete corresponding `.tpl` files under `src/cli/templates/init`.
- [ ] Keep only templates still used by `cms` and `trellis add` features.
- [ ] Search proves `workspace` and `workspace-mcp` no longer have inline
      starter assembly branches.

### 4. Tests And Checks

- [ ] Add manifest tests for `src/cli/starter-fixtures/workspace-mcp`.
- [ ] Assert the workspace-MCP fixture includes MCP runtime/tools and forwarding
      env keys.
- [ ] Assert the workspace-MCP fixture includes workspace/tenant files.
- [ ] Assert the workspace-MCP fixture does not include CMS/Ginko/bridge-author
      concepts.
- [ ] Smoke-generate `trellis init --template workspace-mcp` from the built CLI.
- [ ] Verify generated output has app-name transforms and no
      `trellis-starter-workspace-mcp` placeholder.
- [ ] Smoke-generate `public`, `personal`, and `workspace` after the template
      deletion to prove retained starters still work.
- [ ] Update refactor surface inventory after deleted template sources.

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
rg -n "buildWorkspacePermissionsTemplateSet|buildMcpTemplateSet" src/cli/lib/init.ts
rg -n "workspacePageTemplate\\(|workspaceFunctionsAppTemplate|workspaceTodosTemplate|mcpRuntimeTemplate|mcpListTodosToolTemplate|mcpCreateTodoToolTemplate" src/cli/lib/init.ts src/cli/lib/init-templates.ts
```

## Acceptance Criteria

- [ ] `trellis init --template workspace-mcp` renders from
      `src/cli/starter-fixtures/workspace-mcp/starter.manifest.json`.
- [ ] Workspace-MCP fixture exposes workspace + MCP concepts but no CMS/Ginko or
      bridge-author concepts.
- [ ] Replaced workspace/MCP starter template code is deleted.
- [ ] `public`, `personal`, and `workspace` still render from fixtures.
- [ ] `cms` remains the only app starter on the legacy path.
- [ ] Existing starter manifest, doctor, schema-boundary, public-surface, and
      CLI checks pass.
- [ ] Slice 7 `workspace-mcp` item is checked in
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Sprint changes are committed after verification.

## Next Sprint Candidate

If this lands cleanly, Sprint 25 should resolve the remaining `cms` starter
surface: either delete `cms` from Trellis 1.0 init entirely and document
Ginko-owned setup, or convert it into the explicitly decided advanced
bridge-consumer/bridge-author path. That sprint should also delete any remaining
starter `.tpl` sources that are only kept for `cms`.
