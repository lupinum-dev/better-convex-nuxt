# Sprint 75: MCP Projection Guide Cleanup

## Summary

Continue Slice 12 by making the MCP docs teach one 1.0 projection model.

The backend and operation docs now explain the protected lane model and
destructive operation invariants. The next gap is MCP projection: how tools
point at backend refs without becoming the policy layer, how direct writes stay
bounded, how shared descriptors and permission keys avoid Convex implementation
imports in server/MCP files, and how destructive tools bind preview/execute refs
to one operation identity.

## Why This Sprint

MCP is where old mental models can creep back in fastest:

- treating tool visibility as authorization;
- importing Convex permission implementations into server/MCP files;
- exposing app writes through standalone `defineTool(...)`;
- letting `tool.mutation(...)` down-classify a dangerous backend write;
- teaching operation ref helpers without explaining descriptor/projection drift;
- mixing generic custom tools with destructive business actions.

This sprint should make the MCP guide boring and reviewable: query, bounded
mutation, operation. Business rules stay in Convex handlers and operations.

## Non-Goals

- Do not change MCP runtime code.
- Do not rewrite trusted forwarding docs.
- Do not rewrite bridge package-author docs.
- Do not complete the full public API reference rewrite.
- Do not add new tool factories or public names.
- Do not document legacy `tool.fromOperation(...)`.
- Do not make standalone `defineTool(...)` an app-write path.

## Action Plan

### 1. Establish The MCP Docs Baseline

- [ ] Scan user-facing MCP docs and MCP API reference for stale or risky
      projection wording:

  ```bash
  rg -n "tool\\.query|tool\\.mutation|tool\\.operation|defineTool|defineMcpApp|permission|workspaceRead|workspaceWrite|fromOperation|tool\\.fromOperation|executeOperationRef|previewOperationRef|transportExecuteOperationRef|confirmationMode|_confirmationToken|ctx\\.mutation|ctx\\.action|convex/features|shared/features|safety|safe-write|bounded-write|external-service|destructive" apps/docs/content/docs/14.mcp-tools apps/docs/content/docs/13.api-reference/5.mcp.md apps/docs/content/docs/08.permissions/7.operations.md apps/docs/content/docs/04.mutations/4.destructive-operations.md -g '*.md'
  ```

- [ ] Classify hits as current 1.0 docs, stale deleted paths, implementation
      boundary problems, safety-class wording, or future bridge/forwarding
      scope.
- [ ] Record the baseline in this plan before editing.

### 2. Tighten `/docs/mcp-tools/define-tools`

- [ ] Make the three blessed lanes obvious:
      `tool.query(...)`, bounded `tool.mutation(...)`, and
      `tool.operation(...)`.
- [ ] State that MCP tools are allowlisted through explicit declarations or
      generated inventory; Trellis does not expose Convex refs by directory
      convention.
- [ ] State that direct query/mutation refs must carry Trellis backend metadata
      from public/protected backend builders or shared descriptors.
- [ ] State that `tool.mutation(...)` can only project backend writes whose
      backend metadata is compatible with bounded/non-destructive safety; the
      tool declaration cannot down-classify a sensitive or destructive backend
      handler.
- [ ] Fix examples so server/MCP files import shared descriptors and permission
      keys, not Convex permission implementations.
- [ ] Keep standalone `defineTool(...)` scoped to read/diagnostic/external
      service behavior without app writes.

### 3. Tighten `/docs/mcp-tools/destructive-tools`

- [ ] Keep this page focused on `tool.operation(...)`.
- [ ] Explain that the accepted fallback is explicit checked binding:
      descriptor plus preview/execute refs.
- [ ] Clarify that the dream one-liner is only valid when the imported value is a
      shared descriptor or generated operation handle, not Convex implementation
      code.
- [ ] Explain preview/execute metadata drift at the tool boundary:
      operation id, kind, args hash/schema metadata, permission key, preview ref,
      and execute ref must agree.
- [ ] Preserve `backend` versus `transport` confirmation mode only if the page
      explains why each exists without turning into a bridge guide.
- [ ] Ensure no wording implies confirmation replaces execute-time guard/load/
      authorize/tenant/drift checks.

### 4. Align MCP API Reference Only Where Needed

- [ ] Add or tighten terse reference notes for:
      direct mutation safety metadata, standalone custom-tool limits, explicit
      allowlisting, and operation binding invariants.
- [ ] Keep the reference terse; do not duplicate the full guide.

### 5. Leave Adjacent Docs Open

- [ ] Do not mark trusted forwarding security guide complete.
- [ ] Do not mark bridge package-author guide complete.
- [ ] Do not mark public API reference complete.
- [ ] If stale forwarding or bridge wording is found, record it as future scope
      unless a one-line fix is enough.

### 6. Verify

- [ ] `pnpm run check:docs:links`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] MCP docs scan from step 1 has no stale deleted-path hits, or every
      remaining hit is documented here as intentional/future-sprint scope.
- [ ] `pnpm exec oxfmt --check apps/docs/content/docs/14.mcp-tools apps/docs/content/docs/13.api-reference/5.mcp.md meta/refactor/sprint75-mcp-projection-guide-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

### 7. Update The Refactor Tracker

- [ ] Add a Sprint 75 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [ ] Mark MCP projection guide complete only if the define-tools and
      destructive-tools pages are aligned and verified.
- [ ] Leave trusted forwarding, bridge package-author, and full public API
      reference items open.

## Done Means

- MCP docs teach one projection model: query, bounded mutation, operation.
- Server/MCP examples do not import Convex implementation modules for shared
  permission or operation metadata.
- Tool visibility is clearly advisory; backend handlers remain authoritative.
- Direct MCP mutation safety comes from backend metadata or shared descriptors,
  not only the tool file.
- Destructive MCP tools use operation-backed preview/execute bindings and cannot
  drift silently.
