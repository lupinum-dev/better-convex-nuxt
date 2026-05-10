# Sprint 55: Protected Identity Wiring Proof

## Summary

Close the remaining Slice 3 proof gap by making protected handler identity
behavior explicit, tested, and documented: missing protected principal/actor
wiring must fail closed, while a resolved-null actor remains a normal
anonymous/unauthorized state that guards can deny cleanly.

Owner: Codex.

## Why This Sprint

Slice 3 is almost done. The remaining risk is not syntax anymore; it is whether
the explicit `public` / `protected` / `unsafe` lanes behave correctly when app
identity setup is absent, incomplete, or intentionally resolves to no actor.

The 1.0 rule is:

```text
Missing wiring = setup failure.
Resolved null = runtime identity state.
```

Those are different failures. If we blur them, development becomes confusing
and production can accidentally treat misconfiguration like an ordinary denied
user.

## Constraints

- Prefer tests and small runtime checks over new abstractions.
- Do not add compatibility modes, feature flags, or alternate identity paths.
- Do not redesign `definePrincipal`, `defineActor`, guards, permissions, or
  Better Auth integration in this sprint.
- Do not make public handlers require actor wiring.
- Do not make anonymous-capable/public-access flows fail only because the actor
  resolver returns `null`.
- Keep production fail-closed and development/test errors actionable.

## Questions To Answer First

- Does `defineTrellis(...)` currently have an implicit actor fallback that hides
  missing app actor wiring?
- Which protected paths require actor resolution:
  `authRequired`, permission guards, custom guards, `load`, `authorize`, and
  handler calls to `ctx.actor()`?
- Can tests distinguish missing `ctx.actor`/actor resolver setup from an actor
  resolver that ran and returned `null`?
- Do default `definePrincipal.fromAuth()` and `defineActor.fromAuth()` remain a
  deliberate starter convenience, or do protected apps need to opt in
  explicitly?

## Work Items

### 1. Map The Current Identity Path

- [x] Trace `defineTrellis(...)` principal resolution, delegation resolution,
      actor resolution, and `buildStructuredBuilder(...)` guard execution.
- [x] Identify where missing principal wiring is already a setup failure.
- [x] Identify where missing actor wiring is currently treated as `null`.
- [x] Document the smallest code location that can enforce the invariant.

### 2. Add Focused Runtime Tests

- [x] Add a test proving protected handlers fail clearly when principal wiring
      is missing.
- [x] Add a test proving protected handlers fail clearly when actor wiring is
      missing for actor-required guards.
- [x] Add a test proving a resolver that returns `null` is handled as
      unauthorized, not setup failure.
- [x] Add a test proving public handlers do not require actor wiring.
- [x] Add a test proving unsafe handlers still require typed permits, but do
      not accidentally become a protected identity shortcut.

### 3. Tighten Runtime Behavior Only Where Tests Show Drift

- [x] If missing actor wiring is currently indistinguishable from resolved-null
      actor, introduce one direct internal runtime check.
- [x] Keep the check internal to runtime code; do not add public config.
- [x] Development/test behavior should throw an actionable setup error naming
      the missing accessor/resolver and lane.
- [x] Production behavior should deny/fail closed without leaking internal
      setup details.
- [x] Preserve resolved-null actor denial messages and observations.

### 4. Update Doctor/Inventory Only If There Is A Real Signal

- [ ] If app-level missing actor wiring is statically detectable, add or update
      one doctor finding.
- [x] If it is not reliably detectable, do not fake it with regex.
- [x] Prefer runtime invariant tests over weak source scanning.

### 5. Update Docs And Slice 3

- [x] Update principal/actor docs with the missing-wiring versus resolved-null
      distinction.
- [x] Add a Sprint 55 progress note under Slice 3.
- [x] Mark "Missing protected principal/actor wiring fails closed" complete
      only after runtime tests prove it.
- [x] Mark "Resolved-null actor is distinct from missing actor resolver wiring"
      complete only after tests prove both paths.
- [ ] If these complete Slice 3, mark Slice 3 done and record any remaining
      follow-up outside the slice.

## Verification

- [x] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts`
- N/A: `pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts`;
  doctor findings did not change.
- [x] `pnpm exec vue-tsc -p tsconfig.types.json --noEmit`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec oxfmt --check src/runtime/functions src/runtime/auth tests/unit/functions-defineTrellis.test.ts tests/unit/functions-defineHandler.test.ts apps/docs/content/docs/08.permissions/2.principal-and-actor.md meta/refactor/sprint55-protected-identity-wiring-proof-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Done Means

- Protected handlers have tested fail-closed behavior for missing identity
  wiring.
- Resolved-null actor remains a tested runtime identity state, not a setup
  failure.
- Public handlers remain easy and do not require actor setup.
- The implementation does not introduce a second identity model or public
  compatibility flag.
- Slice 3 is either complete or has only explicitly documented residual work.
