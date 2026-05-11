# Sprint 4: Starter Template Hard Cut

Status: implemented
Owner: Matthias

Sprint 4 prevents new generated apps from reintroducing the old backend surface
that Sprint 3 started deleting. The goal is to make `trellis init` and
`trellis add` generate `@lupinum/trellis/backend` imports and explicit backend
lanes for the public, personal, workspace, and workspace-MCP beginner paths.

This sprint is deliberately narrower than "convert every old example." It
targets source-of-truth generators first. Later examples and bridge/CMS surfaces
can be converted after the generated app path is clean.

## Decisions From Sprint 3

- `@lupinum/trellis/backend` is the canonical backend import.
- `@lupinum/trellis/functions` must not be generated for beginner app code.
- Plain handler objects must use `query.public(...)`, `query.protected(...)`,
  `mutation.public(...)`, `mutation.protected(...)`, or an explicit unsafe lane.
- Operation/projection shims may still use callable builders until the operation
  projection sprint replaces that path.
- String `bypass` reasons remain until the typed unsafe permit sprint.

## Non-Goals

- Do not finish fixture-backed starter generation in this sprint.
- Do not migrate Ginko/CMS or bridge-author templates.
- Do not migrate examples `04`-`08` except where a test fixture requires it.
- Do not remove operation projection callable shims.
- Do not replace string unsafe bypasses with typed permits yet.
- Do not rewrite all docs. Touch only docs/tests that assert generated starter
  output.

## Work Items

### 1. Convert Init Template Source Of Truth

- [x] Convert static init templates under `src/cli/templates/init` from
      `@lupinum/trellis/functions` to `@lupinum/trellis/backend` where they
      generate beginner app backend code.
- [x] Convert inline init templates in `src/cli/lib/init-templates.ts` to
      `@lupinum/trellis/backend`.
- [x] Convert public starter todo handlers to `query.public(...)` /
      `mutation.public(...)`.
- [x] Convert personal starter todo handlers to `query.protected(...)` /
      `mutation.protected(...)`.
- [x] Convert workspace starter todo/workspace handlers to `query.protected(...)`
      / `mutation.protected(...)`.
- [x] Convert permission context generated handlers to the accepted explicit
      lane shape, or leave only if the current helper returns a projection object
      that is intentionally covered by the temporary operation/projection shim.
- [x] Convert onboarding/upload escape hatches to `mutation.unsafe(...)` /
      `query.unsafe(...)` while keeping string `bypass` reasons for the later
      typed-permits sprint.

### 2. Convert `trellis add` Resource Generators

- [x] Convert `src/cli/lib/resource.ts` generated imports from
      `@lupinum/trellis/functions` to `@lupinum/trellis/backend`.
- [x] Convert generated list/get handlers to `query.protected(...)`.
- [x] Convert generated create/update/remove handlers to
      `mutation.protected(...)` unless the generated remove handler is an
      operation projection shim.
- [x] Convert generated preview handlers to the explicit checked binding shape
      where possible; otherwise record the remaining operation callable shim
      with an owner.
- [x] Leave generated MCP `tool.fromOperation(...)` cleanup to the MCP operation
      sprint unless a small local rename is already supported by current code.

### 3. Update Tests That Assert Generated Code

- [x] Update CLI init tests to assert generated public/personal/workspace app
      code uses `@lupinum/trellis/backend`.
- [x] Update CLI init tests to assert generated beginner app handlers use
      explicit lanes.
- [x] Update resource/add tests or add focused coverage proving generated
      feature domain files use backend imports and explicit lanes.
- [x] Update doctor fixture snippets that still teach app-owned
      `unsafe.query(...)` / `unsafe.mutation(...)` only when they are not
      intentionally testing legacy detection.
- [x] Keep eslint rule fixture strings unchanged unless the rule itself is being
      migrated; lint fixtures are allowed to mention old spellings while testing
      old-spelling diagnostics.

### 4. Add A Guard Against Template Regression

- [x] Add or update a focused check that fails when beginner init templates
      generate `@lupinum/trellis/functions`.
- [x] Add or update a focused check that fails when beginner init templates
      generate direct `query({ ... })` / `mutation({ ... })` plain handlers.
- [x] Scope the check to beginner public/personal/workspace/workspace-MCP
      generated app code; do not block historical docs, bridge fixtures, or
      operation projection shims in this sprint.

### 5. Record Remaining Cleanup

- [x] Recount remaining `@lupinum/trellis/functions` hits outside historical
      planning/ADR files.
- [x] Separate remaining hits into: - later examples `04`-`08`; - bridge/CMS extraction; - docs rewrite; - operation projection shim; - typed unsafe permits; - test-only legacy diagnostics.
- [x] Update `meta/trellis-1.0-refactor-plan.md` checkboxes only for completed
      Slice 3/package-surface items.
- [x] Record the next sprint recommendation in the exit notes.

## Acceptance Criteria

- [x] `trellis init --template public` generates backend imports and explicit
      public lanes.
- [x] `trellis init --template personal` generates backend imports and explicit
      protected lanes.
- [x] `trellis init --template workspace` generates backend imports and explicit
      protected/unsafe lanes where appropriate.
- [x] `trellis init --template workspace-mcp` inherits the same clean backend
      shape.
- [x] `trellis add` generated feature code uses backend imports and explicit
      lanes for plain handlers.
- [x] Beginner generated app code no longer contains
      `@lupinum/trellis/functions`.
- [x] Beginner generated app code no longer contains plain direct
      `query({ ... })` / `mutation({ ... })` handlers, excluding tracked
      operation/projection shims.
- [x] `pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts`
      passes.
- [x] Focused resource/add tests pass.
- [x] `pnpm run check:refactor:surface:inventory` passes.
- [x] `pnpm run check:docs:api-surface` passes.
- [x] `pnpm run check:publish-surface` passes.
- [x] `pnpm run test:types:public` passes.
- [x] `git diff --check` passes.

## Suggested Verification Commands

```bash
pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts
pnpm exec vitest run --project=unit tests/unit/operation-ref-codegen.test.ts tests/unit/phase0-starter-manifest.test.ts
pnpm run check:refactor:surface:inventory
pnpm run check:docs:api-surface
pnpm run check:publish-surface
pnpm run test:types:public
git diff --check
```

## Exit Notes To Fill At Sprint End

- Commit: `feat: hard cut generated starter backend lanes`.
- Generated init templates converted: public, personal, workspace, and
  workspace-MCP beginner paths now emit `@lupinum/trellis/backend` plus
  explicit public/protected/unsafe lanes. CMS/bridge-author templates remain
  out of scope for this sprint.
- Generated resource templates converted: `trellis add entity` emits backend
  imports and explicit protected lanes for plain handlers. Operation projection
  callable shims and generated `tool.fromOperation(...)` remain tracked for the
  MCP operation sprint.
- Template regression check: `tests/unit/cli-doctor.test.ts` now asserts
  generated beginner app files do not contain `@lupinum/trellis/functions` or
  plain direct `query({ ... })` / `mutation({ ... })` handlers.
- Tests run:
  - `pnpm run build:cli`
  - `pnpm exec vitest run --project=unit tests/unit/cli-doctor.test.ts`
  - `pnpm exec vitest run --project=unit tests/unit/operation-ref-codegen.test.ts tests/unit/phase0-starter-manifest.test.ts`
  - `pnpm run test:types:public`
  - `pnpm run check:refactor:surface:inventory`
  - `pnpm run check:docs:api-surface`
  - `pnpm run check:publish-surface`
  - `git diff --check`
- Remaining old `@lupinum/trellis/functions` hits: 37 non-historical hits
  remain, owned by later examples `04`-`08`, bridge/CMS extraction, docs
  rewrite, test/build alias fixtures, and migration/changelog text.
- Remaining old plain builder hits: beginner template paths are clean. Remaining
  generator hits are CMS template handlers and operation/projection shims.
- Recommended Sprint 5: convert docs-facing beginner pages and/or later examples
  `04`-`08` to backend imports and explicit lanes, while keeping bridge/CMS
  extraction separate.
