# Sprint 52: Runtime Boundary Policy

## Summary

Finish the next local piece of Slice 2 by turning the runtime/package boundary
rules into an executable repo policy. The sprint goal is not to move more code.
The goal is to prevent the old problem from returning: core/runtime files
quietly importing bridge, ESLint, devtools UI, or observability delivery code.

Owner: Codex.

## Why This Sprint

Sprint 48 reconciled the bridge package boundary. Sprint 51 removed evlog
delivery from core. The refactor plan still has a Slice 2 proof gap:

- core package can build without bridge runtime imports;
- public/core apps do not load MCP, bridge, ESLint, observability delivery, or
  devtools UI code accidentally;
- dependency graph checks enforce this instead of relying on docs.

The simplest useful next step is to strengthen `check:repo-policies` with a
single boundary inventory/check. Do not add a new public API, package, or
runtime abstraction.

## Constraints

- Do not move bridge code in this sprint.
- Do not split ESLint into a new package in this sprint.
- Do not create a generic dependency graph framework.
- Do not change public exports unless the policy exposes an existing violation
  that must be fixed.
- Do not make devtools disappear from the Nuxt module; only prevent public/core
  runtime subpaths from importing devtools UI or tooling code. Lightweight
  `src/runtime/devtools/{state,runtime,types}` instrumentation stays allowed
  until a later devtools-specific cleanup replaces it.

## Boundary Model

### Public/Core Runtime Roots

These roots must stay free of advanced/tooling implementation imports:

- `src/runtime/auth`
- `src/runtime/args`
- `src/runtime/backend`
- `src/runtime/composables`
- `src/runtime/convex`
- `src/runtime/feature`
- `src/runtime/functions`
- `src/runtime/observability`
- `src/runtime/schema`
- `src/runtime/server`
- `src/runtime/testing`
- `src/runtime/trusted-forwarding`
- `src/runtime/type-primitives`
- `src/runtime/types`
- `src/runtime/utils`
- `src/runtime/visibility`

### Allowed Advanced Roots

These may own their respective advanced code:

- `src/runtime/mcp` may import MCP runtime modules.
- `src/devtools.ts`, `src/devtools/**`, `src/runtime/devtools/**`,
  `src/module.ts`, and module setup code may import devtools implementation.
- `src/eslint/**` may import ESLint implementation.
- `packages/trellis-bridge/**` may import bridge implementation.
- tests, scripts, docs, meta, and examples may mention advanced packages when
  checking migration or documenting advanced/package-author use.

## Work Items

### 1. Add One Runtime Boundary Check

- [x] Extend `scripts/check-repo-policies.mjs` with a focused runtime boundary
      policy instead of creating a second scanner.
- [x] Check import/export specifiers and dynamic imports, not arbitrary text.
- [x] Fail when public/core runtime roots import `@lupinum/trellis-bridge`.
- [x] Fail when public/core runtime roots import `packages/trellis-bridge`.
- [x] Fail when public/core runtime roots import `evlog`.
- [x] Fail when public/core runtime roots import `@typescript-eslint/*` or
      `eslint`.
- [x] Fail when public/core runtime roots import `@nuxt/devtools*`.
- [x] Fail when public/core runtime roots import `src/devtools/**`.
- [x] Keep lightweight `src/runtime/devtools/{state,runtime,types}` imports
      allowed as current runtime instrumentation.
- [x] Fail when public/core runtime roots import `src/runtime/mcp/**` from
      non-MCP roots.
- [x] Keep current bridge-boundary check behavior or fold it into the new
      policy without weakening it.

### 2. Add Policy Tests With Tiny Fixtures

- [x] Add focused tests for the policy helper if the check is extracted into a
      helper module.
- [x] Exercise the extracted policy helper with tiny in-memory fixtures.
- [x] Cover allowed devtools import from module/devtools root.
- [x] Cover blocked devtools import from public runtime root.
- [x] Cover blocked bridge import from public runtime root.
- [x] Cover blocked MCP import from a non-MCP runtime root.
- [x] Cover allowed MCP internal import inside `src/runtime/mcp`.
- [x] Cover blocked evlog import from any core runtime root.

### 3. Fix Any Real Violations Directly

- [x] If the policy finds a current root/core violation, fix the import by
      deleting it or moving the dependency to the owning advanced root.
- [x] Do not add allowlist exceptions unless the refactor plan explicitly names
      the boundary as valid.
- [x] If a boundary is genuinely wrong in this plan, update this sprint plan and
      `meta/trellis-1.0-refactor-plan.md` with the reason before changing code.

### 4. Update Slice 2

- [x] Add a Sprint 52 progress note under Slice 2.
- [x] Mark the dependency-graph proof item complete if `check:repo-policies`
      now enforces the boundary.
- [x] Keep Slice 2 open unless all remaining bridge/package/doc items are done.

## Verification

- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec vitest run --project=unit tests/unit/repo-policies.test.ts`
      if policy unit tests exist after implementation.
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:docs:api-surface`
- [x] `rg -n "from 'evlog'|from \\\"evlog\\\"|@lupinum/trellis-bridge|packages/trellis-bridge|@nuxt/devtools|@typescript-eslint|from ['\\\"]eslint" src/runtime src/module.ts src/devtools.ts src/eslint packages/trellis-bridge`
      with reviewed/expected matches only in allowed roots.
- [x] `pnpm exec oxfmt --check scripts/check-repo-policies.mjs scripts/lib/repo-policy-boundaries.mjs tests/unit/repo-policies.test.ts meta/refactor/sprint52-runtime-boundary-policy-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Done Means

- `check:repo-policies` fails if core/public runtime code imports bridge,
  observability delivery, ESLint, devtools UI, or MCP implementation by
  accident.
- Allowed advanced roots stay explicit and narrow.
- Slice 2 has an executable dependency-boundary proof.
- No new public compatibility path or second source of truth is introduced.
