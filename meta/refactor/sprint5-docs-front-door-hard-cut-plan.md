# Sprint 5: Docs Front Door Hard Cut

## Goal

Make the first docs a new Trellis user reads match the 1.0 backend surface that the
CLI now generates.

Sprint 4 hard-cut generated starter/backend code to:

- `@lupinum/trellis/backend`
- `query.public(...)`
- `mutation.public(...)`
- `query.protected(...)`
- `mutation.protected(...)`
- `query.unsafe(...)` / `mutation.unsafe(...)`

The docs front door still teaches older imports and builder shapes. This sprint
removes that mismatch before broader example and MCP cleanup begins.

## Non-Goals

- Do not change runtime APIs in this sprint.
- Do not delete `tool.fromOperation(...)`; that belongs to the MCP operation lane
  sprint.
- Do not migrate bridge or CMS docs except where they block beginner docs.
- Do not migrate advanced examples `04`-`08`; they need their own example cleanup
  sprint.
- Do not add compatibility aliases or parallel docs for old and new backend paths.

## Work Items

### 1. Update Beginner Docs

- [x] Update `apps/docs/content/docs/01.getting-started/3.first-live-query.md`.
  - [x] Replace `@lupinum/trellis/functions` with
        `@lupinum/trellis/backend`.
  - [x] Replace plain `query({ ... })` / `mutation({ ... })` snippets with
        explicit public lanes.
  - [x] Keep the example as simple as the current page; do not introduce auth,
        workspace, MCP, bridge, or operation concepts.

- [x] Update `apps/docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md`.
  - [x] Replace `@lupinum/trellis/functions` with
        `@lupinum/trellis/backend`.
  - [x] Replace protected handler examples with explicit protected lanes.
  - [x] Preserve the current learning sequence: auth first, then actor-protected
        reads/writes.

### 2. Update Foundational Reference Language

- [x] Update `apps/docs/content/docs/13.api-reference/3.functions.md`.
  - [x] Teach the 1.0 backend subpath.
  - [x] Replace `unsafe.query` / `unsafe.mutation` with
        `query.unsafe` / `mutation.unsafe`.
  - [x] Do not document `@lupinum/trellis/functions` as an equal alternative.

- [x] Update `apps/docs/content/docs/02.concepts/2.glossary.md`.
  - [x] Replace legacy unsafe wording with typed lane wording.

- [x] Update `apps/docs/content/docs/08.permissions/6.cross-tenant-and-raw-access.md`.
  - [x] Replace `unsafe.query(...)` / `unsafe.mutation(...)` with
        `query.unsafe(...)` / `mutation.unsafe(...)`.
  - [x] Preserve the warning that unsafe paths are explicit review surfaces, not
        convenience APIs.

- [x] Update `apps/docs/STYLE.md`.
  - [x] Replace generic plain-builder examples with explicit lane examples.

### 3. Add A Docs Surface Guard

- [x] Extend the public-surface inventory script or its expectations so beginner
      docs flag:
  - [x] `@lupinum/trellis/functions`
  - [x] plain `query({ ... })`
  - [x] plain `mutation({ ... })`
  - [x] legacy `unsafe.query(...)` / `unsafe.mutation(...)`

- [x] Keep allowed old-surface hits scoped to files intentionally deferred:
  - MCP `tool.fromOperation(...)` docs.
  - bridge/component docs.
  - historical planning docs.
  - advanced examples scheduled for later migration.

### 4. Verification

- [x] Run docs API-surface checks.
- [x] Run public/publish surface checks.
- [x] Run the refactor public-surface inventory check.
- [x] Run focused docs grep checks for the updated beginner docs.

Suggested commands:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
rg -n "@lupinum/trellis/functions|\\bquery\\(\\{|\\bmutation\\(\\{|unsafe\\.(query|mutation)" apps/docs/content/docs/01.getting-started apps/docs/STYLE.md
```

## Acceptance Criteria

- [x] Beginner docs no longer teach `@lupinum/trellis/functions`.
- [x] Beginner docs no longer teach plain backend builders.
- [x] Foundational unsafe docs use `query.unsafe(...)` /
      `mutation.unsafe(...)`.
- [x] Docs checks and public-surface checks pass.
- [x] Any remaining old-surface docs hits are explicitly deferred to MCP,
      bridge/CMS, or example migration sprints.

## Exit Notes To Capture

- [x] Which docs still intentionally mention old MCP/bridge/example surfaces.
- [x] Whether docs checks need a stricter allowlist in Sprint 6.
- [x] Whether the next sprint should migrate MCP `tool.fromOperation(...)` or
      advanced examples first.

Exit notes:

- Remaining docs old-surface hits are MCP `tool.fromOperation(...)`,
  bridge/component docs, raw trusted-forwarding docs, and planning/reference
  files. They are intentionally deferred.
- The generated inventory now has a `Docs Front Door Old Builder Hits` section.
  It is empty after this sprint and should stay empty.
- Sprint 6 should migrate MCP `tool.fromOperation(...)` before broader
  advanced examples, because generated resource MCP tools still teach that old
  public API.
