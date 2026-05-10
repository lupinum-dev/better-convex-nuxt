# Sprint 54: Backend Unsafe Permit Hard Cut

## Summary

Finish the next local piece of Slice 3 by replacing backend unsafe string
`bypass` reasons with the same typed `unsafe.permit(...)` shape already used by
advanced MCP tools. The sprint goal is one unsafe permit mechanism across
backend unsafe handlers and MCP custom tools.

Owner: Codex.

## Why This Sprint

Slice 3 still has the old unsafe backend shape:

```ts
mutation.unsafe({
  bypass: 'Generate upload URLs before a concrete tenant-scoped record exists.',
  args,
  handler,
})
```

That keeps a string-only escape hatch alive. The 1.0 spec wants unsafe surfaces
to be structured enough for doctor, inventory, docs, and reviewers:

```ts
mutation.unsafe({
  permit: unsafe.permit({
    kind: 'preTenantUpload',
    reason: 'Generate upload URLs before a concrete tenant-scoped record exists.',
    scope: ['files'],
  }),
  args,
  handler,
})
```

## Constraints

- Do not keep `bypass` as a compatibility alias.
- Do not add a second backend-specific permit shape.
- Reuse the existing `TrellisUnsafePermit` / `unsafe.permit(...)` contract.
- Do not solve tenant escape permits in this sprint unless the change is
  naturally shared and small.
- Do not bulk redesign unsafe inventory. Preserve existing findings and enrich
  them only where the typed permit is already available.

## Work Items

### 1. Move/Expose The Shared Permit Primitive

- [ ] Move the typed permit primitive to a shared runtime location if importing
      from `runtime/mcp` would violate the new boundary policy.
- [ ] Keep `@lupinum/trellis/mcp` exporting `unsafe.permit(...)` for MCP users.
- [ ] Export the same `unsafe.permit(...)` from the backend/core surface that
      backend unsafe handlers already use.
- [ ] Avoid broad public barrels beyond the chosen 1.0 backend surface.

### 2. Replace Backend Unsafe Definition Shape

- [ ] Change backend unsafe definitions from `{ bypass: string }` to
      `{ permit: TrellisUnsafePermit }`.
- [ ] Replace `requireUnsafeBypass(...)` with `requireUnsafePermit(...)`.
- [ ] Preserve `unsafe.handler.used` emission, but include structured permit
      metadata (`kind`, `reason`, `scope`, optional `reviewBy`) instead of only
      `reason`.
- [ ] Update runtime errors to require `unsafe.permit(...)`, not `bypass`.

### 3. Convert Local Call Sites

- [ ] Convert focused unit tests.
- [ ] Convert retained examples and harness unsafe handlers.
- [ ] Convert CLI add fixtures.
- [ ] Convert docs examples and API reference text.
- [ ] Update ESLint rule naming/message from unsafe-requires-bypass to
      unsafe-requires-permit if the rule still applies.

### 4. Keep Migration Audit Useful

- [ ] Ensure `trellis upgrade --check` still reports old `bypass` usage as an
      unsafe permit migration warning.
- [ ] Add or update a focused upgrade test for string-only unsafe bypasses if
      current coverage is insufficient.
- [ ] Do not auto-rewrite bypass strings unless a future codemod explicitly
      proves the target permit kind/scope.

### 5. Update Slice 3

- [ ] Add a Sprint 54 progress note under Slice 3.
- [ ] Mark "Delete string-only unsafe bypasses" complete.
- [ ] Mark "Replace unsafe bypass strings with typed `unsafe.permit(...)`"
      complete.
- [ ] Keep Slice 3 open for missing actor wiring proof if still unresolved.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/eslint-plugin.test.ts tests/unit/cli-upgrade.test.ts tests/unit/define-convex-tool.test.ts`
- [ ] `pnpm exec vue-tsc -p tsconfig.types.json --noEmit`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `rg -n "bypass:" src tests examples apps apps/docs/content/docs`
      returns only migration/audit text or unrelated non-backend uses.
- [ ] `rg -n "unsafe\\.permit" src tests examples apps apps/docs/content/docs`
      shows backend unsafe handlers and MCP custom tools using the same helper.
- [ ] `pnpm exec oxfmt --check src/runtime/functions src/runtime/mcp src/eslint tests/unit/functions-defineTrellis.test.ts tests/unit/eslint-plugin.test.ts tests/unit/cli-upgrade.test.ts tests/unit/define-convex-tool.test.ts apps/docs/content/docs meta/refactor/sprint54-backend-unsafe-permit-hard-cut-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- Backend unsafe handlers cannot be defined with string-only `bypass`.
- Backend and MCP unsafe surfaces share one typed permit primitive.
- Observability/inventory still explain unsafe usage with redacted structured
  metadata.
- Docs and retained examples teach `permit: unsafe.permit(...)`.
- Upgrade/audit tooling flags old string bypasses without silently rewriting
  authorization-sensitive code.
