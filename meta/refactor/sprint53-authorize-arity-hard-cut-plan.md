# Sprint 53: Authorize Arity Hard Cut

## Summary

Finish the next local piece of Slice 3 by deleting arity-based `authorize`
inference from backend handlers. The sprint goal is one authorization shape that
is reviewable and not dependent on JavaScript function `.length`.

Owner: Codex.

## Why This Sprint

Slice 3 still has one dangerous old behavior:

- `normalizeAuthorize(...)` treats `authorize.length <= 1` as a loaded-resource
  factory.
- Docs still teach one-argument `authorize: ({ todo }) => ...`.
- Type tests still accept the shorthand.

That was convenient, but it is fragile. Defaults, wrappers, rest params,
minification, and refactors can change function arity without changing intent.
For 1.0, loaded authorization should use the explicit object form:

```ts
authorize: {
  label: 'todo.update',
  check: (_actor, { todo }) => canUpdateTodo(todo),
}
```

## Constraints

- Do not add a compatibility alias or strict-mode toggle.
- Do not silently rewrite app authorization behavior.
- Do not remove support for direct actor-aware authorize checks
  `(actor, loaded, args, ctx) => boolean`; that shape is explicit enough because
  it receives the full authorization context.
- Do not change guard semantics in this sprint.
- Keep changes focused on arity inference, docs, and audit visibility.

## Work Items

### 1. Delete Runtime Arity Inference

- [ ] Remove the `authorize.length <= 1` branch from
      `src/runtime/functions/define-handler.ts`.
- [ ] Treat function authorize values as full checks only.
- [ ] Keep boolean, guard, and object authorize forms unchanged.
- [ ] Add or update a test proving one-argument function authorize no longer
      receives loaded data as a factory.

### 2. Convert Tests And Type Fixtures

- [ ] Replace one-argument loaded-resource factory tests with explicit
      `{ label, check }` authorize object tests.
- [ ] Keep actor-aware inline function authorize tests.
- [ ] Update `tests/types/authorize-shorthand.types.ts` so it no longer asserts
      one-argument factory support.
- [ ] Add a negative type/runtime expectation if there is a clean local pattern
      for proving the shorthand is gone.

### 3. Update Docs And Migration Notes

- [ ] Update `apps/docs/content/docs/08.permissions/4.authorization-and-can.md`
      so docs teach explicit object form for loaded authorization.
- [ ] Remove language that recommends one-argument loaded-resource factories.
- [ ] Add a short migration note in the doc or upgrade audit text explaining
      that one-argument `authorize` must become object form.

### 4. Add Audit Visibility

- [ ] Ensure `trellis upgrade --check` or existing upgrade findings still detect
      likely one-argument authorize callbacks.
- [ ] If detection exists, add focused test coverage for the audit finding.
- [ ] If detection does not exist, add the narrowest scanner needed to report
      files/lines without trying to auto-rewrite authorization.

### 5. Update Slice 3

- [ ] Add a Sprint 53 progress note under Slice 3.
- [ ] Mark "Delete arity-based `authorize` inference" complete.
- [ ] Mark "Add audit report for authorization rewrites that cannot be proven
      safe" complete if upgrade/check now reports likely shorthand call sites.
- [ ] Keep Slice 3 open for unsafe permit cleanup and actor wiring proof if
      those remain.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/functions-defineHandler.test.ts tests/unit/functions-defineTrellis.test.ts tests/unit/cli-upgrade.test.ts`
- [ ] `pnpm exec vue-tsc -p tsconfig.types.json --noEmit`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `rg -n "authorize:\\s*\\(\\{[^)]*\\}\\)\\s*=>|authorize:\\s*\\([^,)]*:\\s*\\{[^)]*\\}\\)\\s*=>" src tests examples apps apps/docs/content/docs`
      returns no supported one-argument loaded-resource authorize examples.
- [ ] `pnpm exec oxfmt --check src/runtime/functions/define-handler.ts tests/unit/functions-defineHandler.test.ts tests/types/authorize-shorthand.types.ts apps/docs/content/docs/08.permissions/4.authorization-and-can.md meta/refactor/sprint53-authorize-arity-hard-cut-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- Runtime authorization no longer depends on `function.length`.
- Docs teach one loaded-authorization shape.
- Existing actor-aware authorize functions still work.
- Upgrade/audit tooling reports likely old shorthand call sites instead of
  silently rewriting them.
- No compatibility path remains for loaded-resource factory authorize.
