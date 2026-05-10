# Sprint 25: Delete Trellis CMS Starter

## Goal

Finish the retained app-starter cleanup by deleting the Trellis-owned `cms`
starter surface.

By the end of this sprint, `trellis init --template cms` should no longer be a
valid Trellis app starter. The only retained Trellis app starters should be:

- `public`;
- `personal`;
- `workspace`;
- `workspace-mcp`.

CMS product setup belongs to Ginko. Trellis may keep examples and bridge/package
author fixtures, but it should not teach CMS as a beginner app lane.

## Why This Sprint Comes Next

Sprints 22-24 converted every retained Trellis starter to fixture-backed
generation:

- `public`;
- `personal`;
- `workspace`;
- `workspace-mcp`.

The only remaining app starter on the legacy template assembly path is `cms`.
The 1.0 refactor plan already resolved the product decision:

> Ginko owns CMS setup; Trellis removes the beginner `cms` starter.

Converting `cms` to a fixture would keep a product lane the spec says should be
deleted. The simpler correct move is hard deletion.

## Current State

- `AppTemplate` and `CanonicalAppTemplate` still include `cms`.
- `buildAppTemplateSet(...)` still has a large `template === 'cms'` branch.
- CMS-specific template functions and `.tpl` files remain under:
  - `src/cli/lib/init-templates.ts`;
  - `src/cli/templates/init`.
- CLI/resource tests still scaffold `cms` for resource generation coverage.
- Docs/skill references still mention `--template cms`.
- `examples/08-component-mini-cms` remains as an advanced component/bridge
  example and is not deleted by this sprint.

## Non-Goals

- Do not delete `examples/08-component-mini-cms`.
- Do not build a Ginko CLI.
- Do not add a replacement `bridge-consumer` starter in this sprint.
- Do not keep `cms` as a deprecated alias.
- Do not convert `cms` to a fixture.
- Do not redesign `trellis add entity`; only update tests or inference needed
  after deleting the CMS starter.

## Design Target

### CLI Surface

Delete `cms` from app starter types and parser choices:

```text
public
personal
workspace
workspace-mcp
```

Any request for `--template cms` should fail as an invalid template, using the
existing CLI validation/error path.

### Source Deletion

Delete CMS-only starter code:

- `template === 'cms'` branch in `buildAppTemplateSet(...)`;
- CMS-only imports in `src/cli/lib/init.ts`;
- CMS-only functions in `src/cli/lib/init-templates.ts`;
- CMS-only `.tpl` files in `src/cli/templates/init`.

Keep shared code used by other surfaces. Do not delete:

- examples;
- bridge package tests;
- schema-boundary checks that inspect `examples/08-component-mini-cms`;
- resource generator CMS detection if it is still intentionally useful for
  existing CMS-shaped apps.

### Test Strategy

Resource generation currently uses a generated CMS starter fixture as its CMS
test input. After deleting the starter, tests that need CMS-shaped app context
must use one of these explicit inputs:

1. a small test fixture built for resource-generator CMS inference; or
2. an existing example path copied into a temp directory; or
3. a narrower unit test around the inferred context.

Prefer the smallest option that preserves the invariant being tested. Do not
reintroduce a Trellis CMS starter just to keep tests convenient.

## Work Items

### 1. Delete CMS From Init Surface

- [ ] Remove `cms` from `AppTemplate`.
- [ ] Remove `cms` from `CanonicalAppTemplate`.
- [ ] Remove `cms` from CLI init template choices/help text.
- [ ] Delete the `template === 'cms'` branch from `buildAppTemplateSet(...)`.
- [ ] Ensure invalid `--template cms` fails through existing CLI validation.

### 2. Delete CMS Starter Sources

- [ ] Remove CMS-only imports from `src/cli/lib/init.ts`.
- [ ] Delete CMS-only functions from `src/cli/lib/init-templates.ts`.
- [ ] Delete CMS-only `.tpl` files from `src/cli/templates/init`.
- [ ] Regenerate `meta/refactor/sprint1-public-surface-inventory.md`.
- [ ] Search proves no `cms` app starter source remains in the CLI.

### 3. Update Tests

- [ ] Update CLI init tests to expect `cms` is not a valid starter.
- [ ] Update resource-generator tests that currently scaffold `cms`.
- [ ] If CMS-shaped resource tests remain valuable, move them to an explicit
      test fixture or example-derived temp app.
- [ ] Keep `examples/08-component-mini-cms` tests intact.
- [ ] Update schema-boundary test targets away from deleted CMS template files.

### 4. Update Docs And Trackers

- [ ] Remove beginner/front-door docs references to `--template cms`.
- [ ] Update skill/reference docs that still teach `--template cms`.
- [ ] Mark Slice 7 `cms` decision complete in
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Update the migration table/tracker if needed.
- [ ] Add exit notes to this sprint plan.

## Verification

Focused unit checks:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/cli-add-resource.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/schema-boundary-policy.test.ts
```

CLI checks:

```bash
pnpm run build:cli
node dist/cli.mjs init --help
node dist/cli.mjs init demo-cms --template cms --cwd /tmp/trellis-cms-delete-smoke --json
```

The last command should fail with the existing invalid-template behavior.

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
  tests/unit/cli-add-resource.test.ts \
  tests/unit/phase0-starter-manifest.test.ts \
  tests/unit/schema-boundary-policy.test.ts
```

Search checks:

```bash
rg -n "template === 'cms'|AppTemplate.*cms|CanonicalAppTemplate.*cms|--template cms" src tests docs apps meta/skill
rg -n "cmsChecksTemplate|cmsPagesTemplate|cmsPermissionQueryTemplate|cmsPermissionsTemplate|cmsPublicPageTemplate|cmsSchemaTemplate|cmsSlugPageTemplate|cmsStudioPageTemplate" src/cli
```

Expected remaining CMS references:

- `examples/08-component-mini-cms`;
- bridge/component tests;
- historical planning/ADR docs;
- Ginko ownership notes in the 1.0 refactor plan.

## Acceptance Criteria

- [ ] `cms` is not a valid Trellis app starter.
- [ ] Retained starters remain fixture-backed and still generate successfully.
- [ ] CMS-only starter template code is deleted.
- [ ] No beginner/front-door docs teach `trellis init --template cms`.
- [ ] Tests that need CMS-shaped context no longer depend on a CMS starter.
- [ ] `examples/08-component-mini-cms` remains intact.
- [ ] Slice 7 `cms` item is checked in
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Sprint changes are committed after verification.

## Next Sprint Candidate

If this lands cleanly, Sprint 26 should move to the next source of old template
surface: template-backed `trellis add` feature slices. The likely first cut is
`trellis add mcp`, because the starter side is now fixture-backed but add-MCP
still uses MCP `.tpl` helpers directly.
