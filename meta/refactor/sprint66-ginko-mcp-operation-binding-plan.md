# Sprint 66: Ginko MCP Operation Binding Cutover

## Summary

Migrate Ginko CMS's active destructive MCP wrapper from the deleted
`rawMcpRuntime.tool.fromOperation(...)` surface to the current
`rawMcpRuntime.tool.operation(...)` surface, without changing unrelated Ginko
bridge internals.

The goal is to prove the first real cross-repo consumer can use the Trellis 1.0
MCP operation lane in release-facing code.

## Why This Sprint

Sprint 65 established the cross-repo baseline and identified exactly one active
Ginko MCP migration surface:

- `packages/cms/src/server/mcp/runtime.ts` routes destructive tools through
  `rawMcpRuntime.tool.fromOperation(...)`.
- `test/shared/mcp-tools.test.ts` expects that legacy method.

Trellis already hard-deleted public `tool.fromOperation(...)`; keeping Ginko on
that shape leaves the real bridge consumer behind the 1.0 surface. This sprint
should remove that mismatch directly.

## Non-Goals

- Do not migrate Ginko component bridge factories.
- Do not migrate Ginko raw forwarding fields.
- Do not regenerate Ginko generated Convex artifacts unless the focused tests
  prove it is required.
- Do not change Trellis MCP runtime behavior unless Ginko exposes a real bug in
  the current `tool.operation(...)` path.
- Do not mark the full Ginko cross-repo gate complete.
- Do not keep a compatibility wrapper named `fromOperation`.

## Action Plan

### 1. Inspect The Exact Ginko Binding

- [ ] Read `packages/cms/src/server/mcp/runtime.ts` and confirm the destructive
      branch currently builds `executeOperationRef(...)`,
      `transportExecuteOperationRef(...)`, and `previewOperationRef(...)`.
- [ ] Read `test/shared/mcp-tools.test.ts` and identify assertions that mention
      `rawMcpRuntime.tool.fromOperation`.
- [ ] Confirm whether Ginko imports the Trellis MCP runtime from source,
      workspace package, or packed package in the focused test path.

### 2. Migrate The Active Binding

- [ ] Replace the destructive branch call with
      `rawMcpRuntime.tool.operation(operation, { ... })`.
- [ ] Update the runtime error message to say
      `Trellis tool.operation(...)`, not `tool.fromOperation(...)`.
- [ ] Delete any defensive runtime check for `rawMcpRuntime.tool.fromOperation`.
      The current Trellis runtime must expose `tool.operation(...)`; if not, the
      type/test failure is the useful signal.
- [ ] Keep `previewOperationRef(operation, preview)`.
- [ ] Keep `executeOperationRef(operation, call)`.
- [ ] Keep `transportExecuteOperationRef(operation, call)`.
- [ ] Keep Ginko capability gating and confirmation-store behavior unchanged.

### 3. Update Focused Ginko Tests

- [ ] Update `test/shared/mcp-tools.test.ts` to expect
      `rawMcpRuntime.tool.operation`.
- [ ] Add or adjust a negative assertion proving `fromOperation` is not required
      by the Ginko runtime wrapper.
- [ ] Keep package-boundary assertions for deleted old imports intact.

### 4. Add Trellis-Side Cross-Repo Evidence

- [ ] Update `meta/trellis-1.0-refactor-plan.md` with a Sprint 66 note.
- [ ] Mark the Ginko destructive MCP wrapper checklist item complete only if the
      focused Ginko tests pass.
- [ ] Do not mark packed Trellis package install or full Ginko `pnpm run check`
      complete unless those gates actually run and pass in this sprint.

### 5. Verify

- [ ] In Ginko:
      `pnpm exec vitest run test/shared/mcp-tools.test.ts`
- [ ] In Ginko:
      `pnpm exec vitest run test/module/package-boundaries.test.ts test/shared/mcp-tools.test.ts`
- [ ] In Ginko:
      `rg -n "rawMcpRuntime\\.tool\\.fromOperation|tool\\.fromOperation" packages/cms/src test/shared test/module`
- [ ] In Trellis:
      `pnpm run check:repo-policies`
- [ ] In Trellis:
      `pnpm exec oxfmt --check meta/refactor/sprint66-ginko-mcp-operation-binding-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] In Trellis and Ginko:
      `git diff --check`

## Done Means

- Ginko release-facing MCP runtime code uses `rawMcpRuntime.tool.operation(...)`.
- Ginko focused MCP wrapper tests expect the current Trellis operation lane.
- No Ginko active MCP runtime/test path depends on `tool.fromOperation(...)`.
- Trellis tracker records the Ginko MCP operation binding cutover.
- Full Ginko package/e2e gates remain honestly open unless run.
