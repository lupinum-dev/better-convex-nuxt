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

- [ ] Update `apps/docs/content/docs/01.getting-started/3.first-live-query.md`.
  - [ ] Replace `@lupinum/trellis/functions` with
        `@lupinum/trellis/backend`.
  - [ ] Replace plain `query({ ... })` / `mutation({ ... })` snippets with
        explicit public lanes.
  - [ ] Keep the example as simple as the current page; do not introduce auth,
        workspace, MCP, bridge, or operation concepts.

- [ ] Update `apps/docs/content/docs/01.getting-started/4.build-a-signed-in-todo-app.md`.
  - [ ] Replace `@lupinum/trellis/functions` with
        `@lupinum/trellis/backend`.
  - [ ] Replace protected handler examples with explicit protected lanes.
  - [ ] Preserve the current learning sequence: auth first, then actor-protected
        reads/writes.

### 2. Update Foundational Reference Language

- [ ] Update `apps/docs/content/docs/13.api-reference/3.functions.md`.
  - [ ] Teach the 1.0 backend subpath.
  - [ ] Replace `unsafe.query` / `unsafe.mutation` with
        `query.unsafe` / `mutation.unsafe`.
  - [ ] Do not document `@lupinum/trellis/functions` as an equal alternative.

- [ ] Update `apps/docs/content/docs/02.concepts/2.glossary.md`.
  - [ ] Replace legacy unsafe wording with typed lane wording.

- [ ] Update `apps/docs/content/docs/08.permissions/6.cross-tenant-and-raw-access.md`.
  - [ ] Replace `unsafe.query(...)` / `unsafe.mutation(...)` with
        `query.unsafe(...)` / `mutation.unsafe(...)`.
  - [ ] Preserve the warning that unsafe paths are explicit review surfaces, not
        convenience APIs.

- [ ] Update `apps/docs/STYLE.md`.
  - [ ] Replace generic plain-builder examples with explicit lane examples.

### 3. Add A Docs Surface Guard

- [ ] Extend the public-surface inventory script or its expectations so beginner
      docs flag:
  - [ ] `@lupinum/trellis/functions`
  - [ ] plain `query({ ... })`
  - [ ] plain `mutation({ ... })`
  - [ ] legacy `unsafe.query(...)` / `unsafe.mutation(...)`

- [ ] Keep allowed old-surface hits scoped to files intentionally deferred:
  - MCP `tool.fromOperation(...)` docs.
  - bridge/component docs.
  - historical planning docs.
  - advanced examples scheduled for later migration.

### 4. Verification

- [ ] Run docs API-surface checks.
- [ ] Run public/publish surface checks.
- [ ] Run the refactor public-surface inventory check.
- [ ] Run focused docs grep checks for the updated beginner docs.

Suggested commands:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
rg -n "@lupinum/trellis/functions|\\bquery\\(\\{|\\bmutation\\(\\{|unsafe\\.(query|mutation)" apps/docs/content/docs/01.getting-started apps/docs/STYLE.md
```

## Acceptance Criteria

- [ ] Beginner docs no longer teach `@lupinum/trellis/functions`.
- [ ] Beginner docs no longer teach plain backend builders.
- [ ] Foundational unsafe docs use `query.unsafe(...)` /
      `mutation.unsafe(...)`.
- [ ] Docs checks and public-surface checks pass.
- [ ] Any remaining old-surface docs hits are explicitly deferred to MCP,
      bridge/CMS, or example migration sprints.

## Exit Notes To Capture

- [ ] Which docs still intentionally mention old MCP/bridge/example surfaces.
- [ ] Whether docs checks need a stricter allowlist in Sprint 6.
- [ ] Whether the next sprint should migrate MCP `tool.fromOperation(...)` or
      advanced examples first.
