# Sprint 74: Operation And Destructive Safety Guide Cleanup

## Summary

Continue Slice 12 by making the operation/destructive safety docs match the 1.0
architecture.

Sprint 73 gave backend handler authors one clear lane model. The next doc gap is
the escalation path from protected handlers into operations: when to use an
operation, what preview is allowed to do, what execute must re-check, and how
destructive MCP confirmation differs from ordinary browser UI confirmation.

## Why This Sprint

Operations are the source-of-truth primitive for reusable and destructive
business actions. If the docs stay vague here, teams will either wrap every
write in an operation or treat preview as an advisory UI query. Both are wrong.

This sprint should teach the strict invariants without introducing another
parallel story:

- normal writes stay protected mutations;
- operations own reusable business actions;
- destructive preview is side-effect-free;
- execute re-runs guard, load, authorize, tenant binding, and drift checks;
- MCP destructive tools use operation-backed confirmation and redemption;
- browser dialogs are product UX unless they explicitly opt into the stricter
  confirmation path.

## Non-Goals

- Do not change runtime code.
- Do not rewrite MCP projection docs beyond links and invariant alignment.
- Do not rewrite trusted forwarding docs.
- Do not add new operation APIs in docs.
- Do not make browser confirmation pretend to be the MCP token-backed path.
- Do not document legacy `tool.fromOperation(...)`, raw forwarding, or old
  operation helper names.

## Action Plan

### 1. Establish The Operation Docs Baseline

- [x] Scan the current operation/destructive docs for stale or weak wording:

  ```bash
  rg -n "defineOperation|defineOperationDescriptor|implementOperation|previewOf|preview\\(|handler:|side-effect|side effect|confirmation|confirm|destructiveSafety|tool\\.operation|tool\\.fromOperation|executeOperationRef|previewOperationRef|transportExecuteOperationRef|_confirmationToken|raw forwarding|_trustedForwardingKey" apps/docs/content/docs/08.permissions apps/docs/content/docs/04.mutations apps/docs/content/docs/14.mcp-tools apps/docs/content/docs/13.api-reference -g '*.md'
  ```

- [x] Classify hits as current 1.0 operation docs, stale helper names, MCP-only
      details, browser UX details, or false positives.
- [x] Record the baseline in this plan before editing.

Baseline: no `tool.fromOperation(...)`, raw forwarding, or
`_trustedForwardingKey` hits remain in the scoped docs. The operation and
destructive-operation pages already use current `defineOperation(...)`,
`previewOf(...)`, and `tool.operation(...)` concepts, but they did not yet state
side-effect-free preview or execute-time re-checks clearly enough. The MCP
destructive tools page still contains operation ref helper details
(`executeOperationRef`, `previewOperationRef`, `transportExecuteOperationRef`,
and `_confirmationToken`) that belong to the later MCP projection rewrite, not
this guide cleanup.

### 2. Tighten `/docs/permissions/operations`

- [x] Keep this page as the concept and backend-authoring guide.
- [x] Make the source-of-truth chain explicit:
      operation descriptor/definition -> protected projections -> MCP/tool
      bindings.
- [x] State that operations are not the default write shape.
- [x] State that preview is a phase of the same operation, not a parallel
      function.
- [x] Add the destructive invariant:
      preview is side-effect-free and may only read, compute, and return display
      plus confirmation material.
- [x] Add the execute invariant:
      execute re-runs guard, load, authorize, tenant binding, and drift checks;
      preview success is not an authorization grant.
- [x] Keep operation descriptor drift language high-level here; detailed MCP
      projection stays in MCP docs.

### 3. Tighten `/docs/mutations/destructive-operations`

- [x] Keep this page as the browser/product UX guide.
- [x] Explain that browser confirm dialogs are not automatically token-backed
      MCP confirmation.
- [x] Add a clear “what Trellis enforces” list for destructive operations:
      stable id, preview, destructiveSafety, side-effect-free preview,
      execute re-checks, and MCP token path when projected to agents.
- [x] Clarify what the app owns:
      modal copy, typed confirmation, re-fetch timing, browser friction, and
      whether browser flows opt into stricter confirmation.
- [x] Remove any wording that implies a preview query authorizes a later
      mutation.

### 4. Align API Reference Only Where Needed

- [x] Add one short invariant note under `defineOperation(...)` if the reference
      currently omits preview/execute safety.
- [x] Keep the API reference terse; do not duplicate the full guide.

### 5. Leave MCP Projection For A Later Sprint

- [x] Do not mark MCP projection guide complete.
- [x] If links mention destructive MCP, ensure they point to the current MCP
      page without expanding this sprint into a rewrite of that page.
- [x] If stale helper names are found in MCP docs, either fix the narrow wording
      or record them as Sprint 75 scope if they need a larger MCP projection
      rewrite.

### 6. Verify

- [x] `pnpm run check:docs:links`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:repo-policies`
- [x] Operation docs scan from step 1 has no stale deleted-path hits, or every
      remaining hit is documented here as intentional/future-sprint scope.
- [x] `pnpm exec oxfmt --check apps/docs/content/docs/08.permissions/7.operations.md apps/docs/content/docs/04.mutations/4.destructive-operations.md apps/docs/content/docs/13.api-reference/3.functions.md meta/refactor/sprint74-operation-destructive-safety-guide-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

### 7. Update The Refactor Tracker

- [x] Add a Sprint 74 completion note to
      `meta/trellis-1.0-refactor-plan.md`.
- [x] Mark Operation/destructive safety guide complete only if both operation and
      destructive-operation pages are aligned and verified.
- [x] Leave MCP projection, trusted forwarding, bridge package-author, and full
      public API reference items open.

## Done Means

- Backend authors understand when a protected mutation is enough and when an
  operation is justified.
- Destructive preview is documented as side-effect-free.
- Execute is documented as re-checking authorization and drift.
- Browser confirmation and MCP token-backed confirmation are not conflated.
- The operation docs teach one source of truth, not parallel preview/execute
  implementations.
