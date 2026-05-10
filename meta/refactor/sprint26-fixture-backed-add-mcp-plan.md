# Sprint 26: Fixture-Backed `trellis add mcp`

## Goal

Delete the remaining template-backed MCP add path.

By the end of this sprint, `trellis add mcp` should no longer read MCP `.tpl`
files from `src/cli/templates/init`. It should derive authored MCP files from
the existing `workspace-mcp` fixture, so the MCP starter and add command have one
source of truth.

Retained add behavior:

- add `server/middleware/mcp-auth.ts`;
- add `server/mcp/index.ts`;
- add `server/mcp/runtime.ts`;
- add `server/mcp/tools/list-todos.ts`;
- add `server/mcp/tools/create-todo.ts`;
- add `convex/features/mcpKeys/domain.ts`;
- update `nuxt.config.ts`;
- update `package.json`;
- update `convex/schema.ts`.

## Why This Sprint Comes Next

Sprint 25 deleted the final non-retained app starter and left only two old
template-backed add surfaces:

- `trellis add mcp`;
- `trellis add uploads`.

`trellis add mcp` is the better first cut because the canonical MCP output
already exists in the `workspace-mcp` starter fixture. We can delete the old MCP
`.tpl` files without inventing a new fixture format.

This follows the refactor rule:

> delete > simplify > replace > add

The simpler replacement is: derive add-MCP files from the existing
`workspace-mcp` fixture, not from a second template set.

## Current State

- `src/cli/lib/init.ts` still imports MCP template helpers:
  - `mcpMiddlewareTemplate`;
  - `mcpRuntimeTemplate`;
  - `mcpKeysTemplate`;
  - `mcpListTodosToolTemplate`;
  - `mcpCreateTodoToolTemplate`.
- `buildMcpTemplateSet()` exists only for `trellis add mcp`.
- `getAddTemplateSet({ feature: 'mcp' })` combines template helper output with
  patching helpers.
- MCP `.tpl` files remain under `src/cli/templates/init`.
- `workspace-mcp` fixture already contains the canonical MCP files.

## Non-Goals

- Do not redesign MCP runtime APIs.
- Do not change generated MCP tool behavior.
- Do not migrate `trellis add uploads`; that is the next likely sprint.
- Do not create a second add-fixture source tree if the `workspace-mcp` fixture
  can provide the files directly.
- Do not remove `--mcp` alias behavior in this sprint unless the implementation
  naturally touches it and tests prove the hard cut is safe.
- Do not touch bridge internals.

## Design Target

### One Source Of Truth

Use the existing `workspace-mcp` starter fixture as the canonical source for MCP
authored files.

The add command should select this subset:

```text
server/middleware/mcp-auth.ts
server/mcp/index.ts
server/mcp/runtime.ts
server/mcp/tools/list-todos.ts
server/mcp/tools/create-todo.ts
convex/features/mcpKeys/domain.ts
```

The selected files should pass through the same fixture content transform used
by `trellis init`, so package/app names stay consistent.

### Keep Narrow Patches

The existing patch helpers remain the right shape for files that must merge into
an existing workspace app:

- `enableNuxtMcpConfig(cwd)`;
- `addMcpDependency(cwd)`;
- `enableWorkspaceMcpSchema(cwd)`.

These are not duplicate source of truth for MCP runtime files. They patch host
configuration that cannot be copied wholesale from the fixture.

### Delete Old MCP Templates

Delete:

```text
src/cli/templates/init/mcpMiddlewareTemplate.tpl
src/cli/templates/init/mcpRuntimeTemplate.tpl
src/cli/templates/init/mcpKeysTemplate.tpl
src/cli/templates/init/mcpListTodosToolTemplate.tpl
src/cli/templates/init/mcpCreateTodoToolTemplate.tpl
```

Delete the corresponding helper exports from `src/cli/lib/init-templates.ts`.

## Work Items

### 1. Add A Fixture Subset Renderer

- [ ] Add a small helper that renders files from the `workspace-mcp` fixture and
      filters by explicit paths.
- [ ] Reuse the existing fixture root/manifest rendering and app-name transform.
- [ ] Keep ownership metadata consistent with fixture-generated starter files.
- [ ] Fail loudly if a requested MCP add path is not present in the
      `workspace-mcp` fixture.

### 2. Replace `trellis add mcp`

- [ ] Replace `buildMcpTemplateSet()` with fixture-subset rendering.
- [ ] Replace direct MCP `.tpl` calls in `getAddTemplateSet({ feature: 'mcp' })`.
- [ ] Keep `afterWrite` host patches for Nuxt config, package dependency, and
      schema.
- [ ] Preserve current CLI output paths for `trellis add mcp`.

### 3. Delete Old MCP Templates

- [ ] Delete MCP template helper exports from `src/cli/lib/init-templates.ts`.
- [ ] Delete MCP `.tpl` files from `src/cli/templates/init`.
- [ ] Update schema-boundary tests that still list MCP `.tpl` targets.
- [ ] Regenerate `meta/refactor/sprint1-public-surface-inventory.md`.

### 4. Update Tests

- [ ] Add or update a unit test proving `trellis add mcp` output matches the
      `workspace-mcp` fixture for the selected MCP files.
- [ ] Keep existing `trellis add mcp` behavior tests passing.
- [ ] Ensure retained app starter tests still pass.
- [ ] Add a search/regression assertion or documented search check proving MCP
      `.tpl` helpers are gone.

### 5. Update Trackers

- [ ] Update Slice 7 in `meta/trellis-1.0-refactor-plan.md` if this completes
      the MCP `.tpl` deletion item.
- [ ] Add exit notes to this sprint plan.
- [ ] Commit sprint changes after verification.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-add-resource.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/schema-boundary-policy.test.ts \
  tests/unit/cli-doctor.test.ts
```

CLI checks:

```bash
pnpm run build:cli
rm -rf /tmp/trellis-add-mcp-smoke
mkdir -p /tmp/trellis-add-mcp-smoke
node dist/cli.mjs init demo-workspace --template workspace --cwd /tmp/trellis-add-mcp-smoke --json
node dist/cli.mjs add mcp --cwd /tmp/trellis-add-mcp-smoke/demo-workspace --json
```

The resulting app should contain:

```text
server/middleware/mcp-auth.ts
server/mcp/index.ts
server/mcp/runtime.ts
server/mcp/tools/list-todos.ts
server/mcp/tools/create-todo.ts
convex/features/mcpKeys/domain.ts
```

Retained starter smoke:

```bash
rm -rf /tmp/trellis-retained-starter-smoke
mkdir -p /tmp/trellis-retained-starter-smoke
node dist/cli.mjs init demo-public --template public --cwd /tmp/trellis-retained-starter-smoke --json
node dist/cli.mjs init demo-personal --template personal --cwd /tmp/trellis-retained-starter-smoke --json
node dist/cli.mjs init demo-workspace --template workspace --cwd /tmp/trellis-retained-starter-smoke --json
node dist/cli.mjs init demo-workspace-mcp --template workspace-mcp --cwd /tmp/trellis-retained-starter-smoke --json
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
  tests/unit/cli-add-resource.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/schema-boundary-policy.test.ts \
  tests/unit/cli-doctor.test.ts
```

Search checks:

```bash
rg -n "mcpMiddlewareTemplate|mcpRuntimeTemplate|mcpKeysTemplate|mcpListTodosToolTemplate|mcpCreateTodoToolTemplate" src tests
find src/cli/templates/init -type f | sort
```

Expected remaining template files after this sprint:

```text
src/cli/templates/init/uploadsContractTemplate.tpl
src/cli/templates/init/uploadsDomainTemplate.tpl
src/cli/templates/init/uploadsPageTemplate.tpl
```

## Acceptance Criteria

- [ ] `trellis add mcp` derives MCP authored files from the `workspace-mcp`
      fixture.
- [ ] MCP `.tpl` files and helper exports are deleted.
- [ ] `trellis add mcp` CLI output paths are unchanged.
- [ ] Host config patching for Nuxt, package dependency, and Convex schema still
      works.
- [ ] Retained starters still generate successfully.
- [ ] No MCP add path has a second source of truth.
- [ ] Surface inventory is regenerated.
- [ ] Sprint changes are committed after verification.

## Next Sprint Candidate

If this lands cleanly, Sprint 27 should delete the final template-backed add
surface: `trellis add uploads`. After that, `src/cli/templates/init` should be
empty or removed entirely.
