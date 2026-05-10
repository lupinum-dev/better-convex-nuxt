# Sprint 7: MCP Reference Example Hard Cut

## Goal

Bring the maintained MCP reference example back onto the 1.0 backend lanes and
make its test suite meaningful again.

Sprint 6 removed `tool.fromOperation(...)`, but
`pnpm --dir examples/07-mcp-reference test` now fails before it reaches MCP
tool behavior because the example still declares old unclassified backend
handlers. This sprint migrates that example to explicit lanes and updates the
resource generator where it still emits old operation projection builders.

## Non-Goals

- Do not migrate every advanced example in this sprint.
- Do not migrate Ginko/component bridge internals.
- Do not redesign operation descriptors or MCP safety metadata.
- Do not reintroduce callable `query(...)` / `mutation(...)` compatibility.
- Do not change business behavior in the MCP reference example beyond the
  minimum needed to express the same handlers through explicit lanes.

## Work Items

### 1. MCP Reference Runtime Imports

- [x] Update `examples/07-mcp-reference/convex/functions.ts` and related
      imports to use `@lupinum/trellis/backend` where needed.
- [x] Remove remaining imports of old `unsafe` builder objects from the example
      once unsafe lanes are expressed as `query.unsafe(...)` /
      `mutation.unsafe(...)`.

### 2. Permission Context And Workspace Onboarding

- [x] Convert `convex/permissions/context.ts` to `query.protected(...)`.
- [x] Convert `convex/features/workspaces/domain.ts` onboarding mutation to the
      correct explicit lane.
  - [x] Prefer `mutation.public(...)` only if the handler stays principal-gated
        through `requireAuth(...)`.
  - [x] Use `mutation.unsafe(...)` only if the handler truly must bypass the
        normal public/protected lanes.

### 3. Runbook Domain

- [x] Convert public catalog reads:
  - [x] `listPublic`
  - [x] `searchPublic`
  - [x] `get`
- [x] Convert workspace reads/writes:
  - [x] `listWorkspace`
  - [x] `getWorkspace`
  - [x] `create`
  - [x] `update`
  - [x] `workspaceOverview`
- [x] Convert operation projections:
  - [x] `remove`
  - [x] `bulkRemove`
  - [x] `previewRemove`
  - [x] `previewBulkRemove`
- [x] Preserve the same guard/load/authorize semantics and test expectations.

### 4. MCP Key Domain

- [x] Convert manager-facing handlers:
  - [x] `list`
  - [x] `create`
  - [x] `revoke`
- [x] Convert MCP runtime validation/touch handlers:
  - [x] `validate`
  - [x] `touch`
- [x] Preserve hash-only key storage and last-used debounce behavior.

### 5. Users Domain

- [x] Convert `getCurrentUser`.
- [x] Convert `listWorkspaceUsersForMcpKeys`.
- [x] Preserve role/workspace visibility behavior.

### 6. Resource Generator Operation Projection Cleanup

- [x] Update `src/cli/lib/resource.ts` so operation execute and preview
      projections use explicit operation lanes instead of callable
      `mutation(operation)` / `query(previewOf(operation))`.
- [x] Update `tests/unit/cli-add-resource.test.ts` expectations.
- [x] Keep generated destructive MCP tools on `tool.operation(...)`.

### 7. Verification

- [x] Run the MCP reference example tests.
- [x] Run resource generator tests.
- [x] Run focused grep over the MCP reference example and generator.
- [x] Run public type surface and publish surface checks if generator changes
      affect public typing.
- [x] Run refactor inventory check.

Suggested commands:

```bash
pnpm --dir examples/07-mcp-reference test
pnpm vitest run tests/unit/cli-add-resource.test.ts
rg -n "export const .* = (query|mutation|action)\\(|\\b(query|mutation|action)\\(\\{|unsafe\\.(query|mutation|action)" examples/07-mcp-reference/convex src/cli/lib/resource.ts tests/unit/cli-add-resource.test.ts
pnpm run test:types:public
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
```

## Acceptance Criteria

- [x] `examples/07-mcp-reference` no longer contains old unclassified backend
      handler declarations.
- [x] `examples/07-mcp-reference` no longer uses `unsafe.query(...)` /
      `unsafe.mutation(...)`.
- [x] Operation projections in the example and generated resource code use
      explicit operation lanes.
- [x] `pnpm --dir examples/07-mcp-reference test` passes.
- [x] Resource generator tests pass.
- [x] No compatibility shim or old callable backend path is added.

## Exit Notes To Capture

- [x] Whether any old builder hits remain in generated resource tests because of
      intentionally deferred CMS/bridge code.
- [x] Whether Sprint 8 should migrate examples `04`-`06` or tackle direct MCP
      mutation safety metadata first.
- [x] Any broader type-check blockers that remain unrelated to this sprint.

Exit notes:

- The only focused grep hit left in the Sprint 7 command is
  `tests/unit/cli-add-resource.test.ts` asserting `listPublished = query({` for
  the deferred CMS/bridge path. That stays for the bridge/CMS sprint.
- Sprint 8 should migrate the remaining maintained examples `04`-`06` before
  direct MCP mutation safety metadata, because example checks still carry old
  backend builder shapes.
- Broader `pnpm run test:types` blockers from Sprint 6 remain outside this
  sprint: starter fixture codegen typing, local Ginko/vue-router version skew,
  and type-primitives operation map exports.
