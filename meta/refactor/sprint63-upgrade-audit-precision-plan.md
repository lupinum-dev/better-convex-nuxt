# Sprint 63: Upgrade Audit Precision And Deleted Path Proof

## Summary

Harden the Trellis 1.0 migration audit after the first write-mode codemods.
Sprint 62 made the safe mechanical edits executable. This sprint makes the
remaining manual/security migrations precise, reviewable, and backed by failure
proofs, without adding compatibility shims or broader rewrite behavior.

Owner: Codex.

## Why This Sprint Comes Next

Slice 11 still has three unresolved proof items:

- audit reports should point to exact files and lines;
- authorize arity migration still needs stronger audit evidence;
- removed imports should fail loudly through diagnostics or TypeScript errors.

Those are the right next checks before deleting more old paths. More codemod
surface would be the wrong move now: authorization, forwarding, backend lane
classification, and MCP safety classification remain human-review decisions.

## Constraints

- Do not re-add old exports, aliases, bridge paths, or root builder shims.
- Do not auto-rewrite authorization callbacks.
- Do not auto-rewrite raw forwarding identity payloads.
- Do not infer backend lane classification from names.
- Do not make regex source scanning the source of truth for security claims.
- Findings must be safe to paste into bug reports: no raw envelopes, tokens,
  principal payloads, delegation payloads, or bearer data.
- Prefer AST/import-aware checks where possible. If a check cannot be precise,
  keep it manual and document why.

## Work Items

### 1. Tighten Location Evidence

- [x] Replace first-match-per-file token scans with all-occurrence evidence where
      findings are token-based.
- [x] Keep file/line output stable and relative to the inspected project.
- [x] Include enough source/finding metadata for JSON consumers to distinguish
      project scan evidence from inventory evidence.
- [x] Add tests proving two old usages in the same file produce two exact
      locations when that helps the reviewer.
- [x] Avoid logging or serializing sensitive matched values.

### 2. Strengthen Authorize Arity Audit

- [x] Replace or supplement the current authorize regex with AST-aware detection
      for `authorize` object properties.
- [x] Flag one-argument callback forms that depend on deleted arity inference.
- [x] Do not flag explicit object form such as
      `authorize: { label, check }`.
- [x] Do not flag unrelated variables/functions named `authorize`.
- [x] Add tests for arrow functions, async arrow functions, function expressions,
      typed parameters, explicit object form, and unrelated uses.
- [x] Keep the finding warning/manual; no automatic rewrite.

### 3. Prove Removed Imports Fail Loudly

- [x] Add type or CLI tests proving deleted public import paths fail after the
      codemod path exists: `@lupinum/trellis/functions` and
      `@lupinum/trellis/bridge`.
- [x] Prefer existing public-surface/typecheck fixtures over a new validation
      harness.
- [x] Assert the replacement guidance is available through
      `trellis upgrade --check` / `--write`, not through hidden aliases.
- [x] Do not reintroduce old package exports just to improve the error message.

### 4. Verify Write Mode Still Stays Narrow

- [x] Re-run write-mode tests after audit-location changes.
- [x] Add or update tests proving `--write` still does not rewrite raw
      trusted-forwarding fields, authorize callbacks, unsafe permit metadata, or
      backend root builder calls.
- [x] Confirm `--write` reruns audit after edits and reports remaining manual
      findings with exact file/line evidence.

### 5. Update Trackers

- [x] Mark Slice 11 "Audit report for authorize inference" complete only after
      AST-backed tests pass.
- [x] Mark Slice 11 "Audit reports point to exact files/lines" complete only if
      token and inventory findings retain precise evidence.
- [x] Mark Slice 11 "Removed imports fail loudly..." complete only after tests
      prove old paths are absent and migration guidance exists.
- [x] Add a Sprint 63 completion note to the 1.0 refactor tracker.
- [x] Do not mark Slice 11 done unless the remaining delete items are actually
      complete.

## Verification

- [x] `pnpm exec vitest run --project=unit tests/unit/cli-upgrade.test.ts`
- [x] `pnpm exec vitest run --project=unit tests/unit/package-subpath-exports.test.ts`
- [x] `pnpm run build:cli`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm run test:types`
- [x] `pnpm exec oxfmt --check src/cli/commands/upgrade.ts tests/unit/cli-upgrade.test.ts tests/dts/removed-subpaths.types.ts meta/refactor/sprint63-upgrade-audit-precision-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Result

- Token-based migration findings now report every affected line in a file
  instead of only the first match.
- `authorize` arity migration is AST-backed for `authorize` object properties
  and remains warning/manual.
- Explicit `{ label, check }` authorize objects and unrelated symbols named
  `authorize` are not flagged.
- Removed `@lupinum/trellis/functions` and `@lupinum/trellis/bridge` subpaths
  are covered by public type tests instead of compatibility aliases.
- `trellis upgrade --write` still rewrites only mechanical imports and safe
  `tool.fromOperation(...)` spelling changes; raw forwarding, authorize,
  unsafe permits, and backend lane decisions stay manual.

## Done Means

- `trellis upgrade --check` and `--write` produce precise, safe evidence for
  remaining manual migration work.
- Authorize arity inference has tested audit coverage without an unsafe codemod.
- Deleted import paths are not kept alive by compatibility aliases.
- Tests prove old import paths fail while upgrade tooling points to the 1.0
  replacements.
- Slice 11 tracker status reflects only completed work.
