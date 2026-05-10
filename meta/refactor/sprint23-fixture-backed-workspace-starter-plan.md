# Sprint 23: Fixture-Backed Workspace Starter

## Goal

Continue Slice 7 by making the `workspace` starter render from a maintained
starter fixture instead of inline/static template fragments.

By the end of this sprint, `trellis init --template workspace` should render
from `src/cli/starter-fixtures/workspace/starter.manifest.json`, with no
workspace-only starter content left behind in `init.ts`, `init-templates.ts`, or
replaced `.tpl` files.

## Why This Sprint Comes Next

Sprint 22 proved the fixture-backed starter path for the two smallest retained
starters:

- `public`: no auth, no workspace, no MCP;
- `personal`: auth + actor, no workspace/MCP.

The next narrow cut is `workspace`:

- it proves the tenant/workspace starter without MCP;
- it reuses the same fixture renderer from Sprint 22;
- it lets `workspace-mcp` become a smaller follow-up that only adds MCP-specific
  fixture files and generated refs on top of a fixture-backed workspace base.

Doing `workspace` before `workspace-mcp` keeps the refactor clean. If the base
workspace starter still depends on legacy template fragments, MCP conversion
would either duplicate those fragments or hide old and new paths side by side.

## Current State

- `public` and `personal` live under `src/cli/starter-fixtures`.
- `renderAppStarterFixture(...)` currently supports only `public` and
  `personal`.
- `workspace` is still assembled in `src/cli/lib/init.ts` from:
  - shared auth templates;
  - workspace permission/auth templates;
  - workspace feature/domain/schema template functions;
  - `workspaceTodosTemplate.tpl`;
  - `workspacePageTemplate(...)` inline Vue output.
- Some workspace templates are also used by `workspace-mcp`, so this sprint must
  delete only workspace-only sources after proving they are not still required by
  `workspace-mcp`.

## Non-Goals

- Do not convert `workspace-mcp` in this sprint.
- Do not redesign workspace starter UI, auth, guards, onboarding, or schema.
- Do not migrate CMS/Ginko setup.
- Do not add compatibility paths for old workspace template functions.
- Do not keep workspace fixture files and workspace inline template files as two
  maintained sources of truth.
- Do not introduce app inventory or doctor architecture changes beyond tests
  needed for this starter cutover.

## Design Target

### Fixture Layout

Add:

```text
src/cli/starter-fixtures/workspace/
```

The fixture should contain the real generated starter app source:

- `starter.manifest.json`
- `.env.example`
- `.gitignore`
- `README.md`
- `package.json`
- `nuxt.config.ts`
- `app/**`
- `convex/**`
- `server/api/.gitkeep`
- `server/mcp/.gitkeep`
- `shared/**`

The manifest should include only files that belong in a generated workspace
starter and exclude local/runtime artifacts:

```text
.convex/**
.env.local
.nuxt/**
.output/**
node_modules/**
coverage/**
```

### CLI Rendering

Extend the existing app-starter fixture path from Sprint 22:

1. add `workspace` to the fixture-backed template set;
2. add `trellis-starter-workspace` as the fixture source app name;
3. render `workspace` through `renderAppStarterFixture(...)`;
4. keep `workspace-mcp` and `cms` on the legacy path for this sprint.

### Deletion Rule

After `workspace` renders from a fixture and tests pass:

- delete workspace-only inline/template code that is no longer referenced;
- keep shared auth/workspace templates only if `workspace-mcp` still uses them;
- do not leave duplicate workspace starter implementations.

This means the sprint may delete fewer `.tpl` files than the raw search list
suggests. The rule is source-of-truth based, not filename based.

## Work Items

### 1. Create Workspace Starter Fixture

- [ ] Generate or copy the current `workspace` starter output into
      `src/cli/starter-fixtures/workspace`.
- [ ] Add `starter.manifest.json`.
- [ ] Keep only files that should ship in a generated workspace app.
- [ ] Exclude all local/runtime artifacts.
- [ ] Ensure the fixture includes workspace/tenant concepts but no MCP, bridge,
      CMS, or operation-tooling concepts.
- [ ] Ensure the fixture uses the canonical 1.0 backend builder lanes already
      emitted by current starter output.

### 2. Wire CLI Init To Workspace Fixture

- [ ] Extend `FixtureBackedTemplate` to include `workspace`.
- [ ] Add `workspace` to the fixture-backed template name set.
- [ ] Add app-name replacement for `trellis-starter-workspace`.
- [ ] Convert `buildAppTemplateSet('workspace', appName)` to return
      `renderAppStarterFixture({ appName, template: 'workspace' })`.
- [ ] Preserve existing write semantics and package/README app-name transforms.
- [ ] Keep `workspace-mcp` and `cms` on the existing legacy path.

### 3. Delete Replaced Workspace Sources

- [ ] Remove unused workspace imports from `src/cli/lib/init.ts`.
- [ ] Delete workspace-only template functions from
      `src/cli/lib/init-templates.ts`.
- [ ] Delete workspace-only `.tpl` files no longer referenced.
- [ ] Keep shared auth/workspace template helpers still required by
      `workspace-mcp`.
- [ ] Search proves there is no second workspace starter implementation for the
      non-MCP starter.

### 4. Tests And Checks

- [ ] Add manifest tests for `src/cli/starter-fixtures/workspace`.
- [ ] Assert the workspace fixture includes auth/workspace files.
- [ ] Assert the workspace fixture does not include MCP toolkit, MCP runtime,
      MCP tools, bridge, CMS, or operation projection files.
- [ ] Smoke-generate `trellis init --template workspace` from the built CLI.
- [ ] Verify generated output has app-name transforms and no
      `trellis-starter-workspace` placeholder.
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
rm -rf /tmp/trellis-workspace-fixture-test
mkdir -p /tmp/trellis-workspace-fixture-test
node dist/cli.mjs init demo-workspace \
  --template workspace \
  --cwd /tmp/trellis-workspace-fixture-test \
  --json
rg -n "trellis-starter-workspace|defineMcpApp|@nuxtjs/mcp-toolkit|ginko|cms" \
  /tmp/trellis-workspace-fixture-test \
  -g '!node_modules/**'
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

## Acceptance Criteria

- [ ] `trellis init --template workspace` renders from
      `src/cli/starter-fixtures/workspace/starter.manifest.json`.
- [ ] Workspace fixture exposes workspace/tenant concepts but no MCP, bridge,
      CMS, or operation-tooling concepts.
- [ ] Replaced workspace-only starter template code is deleted.
- [ ] `workspace-mcp` still works through its existing path.
- [ ] Existing starter manifest, doctor, schema-boundary, public-surface, and
      CLI checks pass.
- [ ] Slice 7 `workspace` item is checked in
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Sprint changes are committed after verification.

## Next Sprint Candidate

If this lands cleanly, Sprint 24 should convert `workspace-mcp` to a
fixture-backed starter and delete the remaining legacy starter template path for
retained Trellis starters. That sprint should also decide whether any leftover
MCP-specific template helpers become fixture files, generated fixture artifacts,
or deleted code.
