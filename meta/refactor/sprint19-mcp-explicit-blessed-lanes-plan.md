# Sprint 19: MCP Explicit Blessed Lanes Hard Cut

## Goal

Make the MCP app-backed API match the 1.0 shape:

```ts
mcp.tool.query(...)
mcp.tool.mutation(...)
mcp.tool.operation(...)
```

By the end of this sprint, `defineMcpApp(...).tool` should no longer be a
callable generic factory that takes `operation: "query" | "mutation" | "action"`.
The operation kind should be selected by the lane name. This keeps MCP as a
projection of the backend model, not a second backend with vague tool options.

## Why This Sprint Comes Next

Sprints 16-18 closed the operation descriptor boundary and the bridge signed
forwarding path. The remaining Slice 6 confusion is API shape:

- `tool.operation(...)` is already the operation-backed path.
- Direct write safety already requires backend/generated ref metadata.
- `tool.fromOperation(...)` was already deleted in Sprint 6, but the tracker is
  stale.
- The app-backed direct query/mutation path still hides behind `tool({...})` with
  `operation` as an option.

That leaves one old source of ambiguity: the caller can make an app-backed MCP
tool without choosing a visible lane. We should hard-cut it now before updating
starters and docs.

## Current State

- `defineMcpApp(...)` returns `tool.operation(...)`.
- Direct writes call `assertDirectToolSafety(...)`.
- Direct mutation safety must be stamped on the backend/generated ref and must
  match the tool-side safety declaration.
- Destructive or preview behavior through generic tools already fails.
- Standalone `defineTool(...)` remains available for advanced custom MCP tools
  and already rejects destructive tools.
- Current docs still teach `tool(options)` as a regular app-backed tool factory.

## Non-Goals

- Do not reintroduce `tool.fromOperation(...)`.
- Do not weaken direct mutation backend safety metadata.
- Do not migrate Ginko destructive MCP wrappers in this sprint.
- Do not implement full `doctor` inventory.
- Do not redesign standalone `defineTool(...)` beyond documenting its narrower
  role.
- Do not add aliases like `tool.write(...)` or compatibility shims for the old
  callable `tool(...)` shape.
- Do not solve action projection here; external side-effect actions remain
  operation-backed unless a later sprint explicitly accepts direct action lanes.

## Work Items

### 1. Split The App-Backed Tool Factory

- [ ] Replace the callable `ToolFactory` shape with an object containing
      `query`, `mutation`, and `operation`.
- [ ] Implement `tool.query(...)` as the direct read lane.
- [ ] Implement `tool.mutation(...)` as the direct bounded-write lane.
- [ ] Keep `tool.operation(...)` as the existing descriptor-backed operation
      lane.
- [ ] Delete `operation?: ConvexToolOperation` from direct app-backed tool
      options.
- [ ] Delete direct `action` projection from the app-backed lane for now; action
      work with side effects remains operation-backed.

### 2. Keep Safety Source Of Truth Backend-Owned

- [ ] Direct `tool.mutation(...)` still requires `safety.kind:
    "bounded-write"`.
- [ ] Direct `tool.mutation(...)` still rejects missing backend/generated ref
      safety metadata.
- [ ] Tool-side safety can confirm/narrow but cannot down-classify backend ref
      safety.
- [ ] `tool.query(...)` does not require write safety metadata.
- [ ] Destructive, sensitive, audited, bulk, previewed, or external-side-effect
      work still requires `tool.operation(...)`.

### 3. Update Maintained Call Sites

- [ ] Convert maintained server/MCP direct read tools to `tool.query(...)`.
- [ ] Convert maintained direct bounded writes to `tool.mutation(...)`.
- [ ] Leave operation-backed tools on `tool.operation(...)`.
- [ ] Update generated resource MCP tools if they generate direct read/write
      examples.
- [ ] Keep standalone `defineTool(...)` examples only where the tool is genuinely
      custom and not an app-backed write.

### 4. Update Types And Tests

- [ ] Update DTS/type tests so `runtime.tool(...)` is a type error.
- [ ] Add tests that `tool.query(...)` calls Convex query refs.
- [ ] Add tests that `tool.mutation(...)` calls Convex mutation refs.
- [ ] Add tests that `tool.mutation(...)` rejects missing backend safety
      metadata.
- [ ] Add tests that `tool.mutation(...)` rejects sensitive/destructive/external
      backend safety.
- [ ] Preserve operation binding tests for descriptor/ref drift.

### 5. Update Docs And Public Surface Checks

- [ ] Update MCP docs to teach only `tool.query`, `tool.mutation`, and
      `tool.operation` for app-backed tools.
- [ ] Update API reference wording from `tool(options)` to explicit lanes.
- [ ] Update public surface inventory notes for Slice 6.
- [ ] Ensure searches for old callable app-backed examples return only
      historical/refactor notes.

### 6. Update The 1.0 Tracker

- [ ] Mark `tool.fromOperation(...)` deletion complete because Sprint 6 already
      did it.
- [ ] Mark `tool.operation` alias cleanup complete because no alias remains.
- [ ] Mark explicit MCP lane items complete only after tests/docs/call sites are
      converted.
- [ ] Leave generic custom unsafe-permit work unchecked unless actually done.

## Verification

Focused MCP tests:

```bash
pnpm exec vitest run --project=unit \
  tests/unit/define-convex-tool.test.ts \
  tests/unit/mcp-operation-binding.test.ts \
  tests/unit/mcp-descriptor-boundary.test.ts \
  tests/types/mcp-runtime.types.ts \
  tests/dts/mcp.types.ts
```

Example checks:

```bash
pnpm --dir examples/07-mcp-reference test
pnpm --dir examples/08-component-mini-cms test
```

Surface checks:

```bash
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run check:refactor:surface:inventory
pnpm run check:cli
```

Cross-repo check:

```bash
pnpm --dir ../ginko-cms run test:types
```

Known non-gates unless fixed separately:

```bash
pnpm run test:types
pnpm --dir examples/07-mcp-reference typecheck
pnpm --dir examples/03-team-workspace typecheck
```

Current unrelated failures include Vue Router type identity drift, generated API
typing drift, package export expectation drift, and Convex dependency-version
type drift.

## Acceptance Criteria

- [ ] `defineMcpApp(...).tool` exposes only `query`, `mutation`, and
      `operation` for app-backed tools.
- [ ] `runtime.tool(...)` is gone from public types and maintained examples.
- [ ] Direct query tools use `tool.query(...)`.
- [ ] Direct bounded writes use `tool.mutation(...)`.
- [ ] Direct mutation safety remains backend/ref-owned and cannot be
      down-classified in the MCP file.
- [ ] Operation-backed tools remain descriptor-backed.
- [ ] Docs teach only the three blessed app-backed lanes.
- [ ] No compatibility alias is added for the old callable `tool(...)` shape.
- [ ] Slice 6 tracker reflects completed and still-pending work accurately.
- [ ] Verification commands above pass except explicitly listed non-gates.
- [ ] Sprint changes are committed after verification.

## Exit Notes

- [ ] Fill this in during implementation.
