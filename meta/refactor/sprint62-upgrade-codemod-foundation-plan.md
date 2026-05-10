# Sprint 62: Upgrade Codemod Foundation

## Summary

Turn `trellis upgrade` from a read-only audit into a narrow, explicit migration
tool for mechanical 1.0 rewrites. The sprint adds write-mode support only for
changes that are safe to automate: import path renames and direct
`tool.fromOperation(...)` call spelling. Security-sensitive migrations remain
audit-only.

Owner: Codex.

## Why This Sprint

The local release gates are now green. The next blocker in the 1.0 tracker is
Slice 11 migration tooling:

1. Codemod for mechanical import/path renames.
2. Codemod for `tool.fromOperation`.
3. Codemods tested against fixtures.
4. Removed imports fail loudly with useful diagnostics or TypeScript errors.

This sprint keeps the tool honest: write mode may edit only changes whose
meaning is unchanged or whose 1.0 replacement is a direct API spelling
replacement. It must not pretend to migrate authorization, raw forwarding,
unsafe permit metadata, or backend builder lane classification.

## Constraints

- Do not add compatibility aliases or resurrect old public paths.
- Do not auto-rewrite authorization, tenant, forwarding identity, destructive
  operation binding, or MCP safety classification.
- Do not change raw forwarding to signed forwarding by text replacement.
- Do not infer public/protected/unsafe lanes for old root backend builder calls.
- Do not mutate files in `--check` mode.
- Prefer AST/token-aware edits over broad global replacement.
- Every write-mode edit must be covered by a fixture test and must be
  idempotent.

## Work Items

### 1. Define Write-Mode Contract

- [x] Add an explicit `--write` option to `trellis upgrade`.
- [x] Keep default and `--check` read-only.
- [x] Reject `--write --json` if the output contract would be confusing, or
      define a clear JSON result with `changedFiles`.
- [x] Print changed file paths and a short summary in human output.
- [x] Return non-zero if write mode sees fail-level findings that require manual
      security review.

### 2. Mechanical Import Codemods

- [x] Rewrite `@lupinum/trellis/functions` imports to
      `@lupinum/trellis/backend`.
- [x] Rewrite `@lupinum/trellis/bridge` imports to
      `@lupinum/trellis-bridge`.
- [x] Preserve import specifier aliases and formatting as much as the local file
      style allows.
- [x] Do not rewrite local app `./functions` imports; those are app-owned
      Convex composition files and require project context.
- [x] Make the codemod idempotent.

### 3. `tool.fromOperation(...)` Codemod

- [x] Rewrite direct member calls `tool.fromOperation(...)` to
      `mcp.tool.operation(...)` only when the receiver is exactly `tool`.
- [x] If the file does not already have an `mcp` binding, emit an audit finding
      instead of guessing imports or runtime variable names.
- [x] Do not rewrite nested/dynamic forms such as
      `runtime.tool.fromOperation(...)` or `someTool.fromOperation(...)` unless
      the AST can prove the canonical MCP runtime binding.
- [x] Make the codemod idempotent.

### 4. Keep Security Migrations Audit-Only

- [x] Keep raw trusted-forwarding findings as fail/manual.
- [x] Keep authorize arity findings as warn/manual.
- [x] Keep unsafe permit migration as warn/manual unless the typed permit can be
      proved from existing structured metadata.
- [x] Keep backend root builder calls as warn/manual because lane selection is a
      security decision.
- [x] Ensure write mode reports skipped manual findings with exact file/line
      evidence.

### 5. Tests And Fixtures

- [x] Add tests proving `--check` never writes.
- [x] Add tests proving `--write` rewrites only mechanical import paths.
- [x] Add tests proving `--write` rewrites direct `tool.fromOperation(...)`
      when an `mcp` binding exists.
- [x] Add tests proving write mode leaves manual/security findings untouched.
- [x] Add idempotency tests: running `--write` twice has no second diff.
- [x] Add fixture cases for mixed old imports and unrelated string literals.

### 6. Update Trackers

- [x] Mark Slice 11 mechanical import/path codemod complete only after tests.
- [x] Mark Slice 11 `tool.fromOperation` codemod complete only after tests.
- [x] Mark codemods-tested-against-fixtures complete only after the new fixture
      cases pass.
- [x] Add a Sprint 62 completion note to the 1.0 refactor tracker.

## Verification

- [x] `pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts`
- [x] `pnpm run build:cli && pnpm run check:starter-fixtures`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm run lint`
- [x] `pnpm run test:types`
- [x] `pnpm exec oxfmt --check src/cli/commands/upgrade.ts tests/unit/cli-upgrade.test.ts meta/refactor/sprint62-upgrade-codemod-foundation-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Result

- `trellis upgrade --write` now applies only tested mechanical codemods.
- `@lupinum/trellis/functions` imports rewrite to
  `@lupinum/trellis/backend`.
- `@lupinum/trellis/bridge` imports rewrite to `@lupinum/trellis-bridge`.
- Direct `tool.fromOperation(...)` calls rewrite to
  `mcp.tool.operation(...)` only when the file already has an `mcp` binding.
- Raw forwarding, authorize arity, unsafe permits, and backend root builder lane
  selection remain audit-only.
- Write mode is idempotent and reports changed files.

## Done Means

- `trellis upgrade --write` exists, but only performs safe mechanical edits.
- Security-sensitive migrations remain audit-only and visible.
- Codemods are idempotent and fixture-tested.
- The 1.0 tracker no longer has migration tooling as a vague future promise.
