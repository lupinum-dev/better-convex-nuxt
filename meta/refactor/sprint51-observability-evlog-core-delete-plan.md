# Sprint 51: Observability Evlog Core Delete

## Goal

Finish the local Slice 10 cleanup by removing evlog delivery from the core
runtime package. Core should own semantic event schema, normalization,
redaction, capture, and bounded sink dispatch. It should not force normal apps
to install or load evlog delivery code.

Do not create `@lupinum/trellis-observability` in this sprint. A separate
delivery package should exist only when there is a concrete consumer and a
reviewed public integration contract. For now, deleting core delivery weight is
the simpler correct move.

## Why This Comes Next

Sprint 50 added an internal sink boundary and removed `evlog-bridge` from the
public observability barrel. But evlog still remains in core:

- root `package.json` depends on `evlog`;
- `src/runtime/observability/evlog-bridge.ts` imports and wraps evlog;
- runtime observer and MCP code still import evlog-wide-summary helpers;
- tests mock evlog to prove delivery failures fail open.

That means public/core apps still carry observability delivery implementation
code. Slice 10 says delivery should be bounded and optional; the next hard cut
is to delete evlog delivery from core.

## Non-Goals

- Do not add a new observability package yet.
- Do not introduce public sink configuration.
- Do not add a compatibility shim for evlog helpers.
- Do not change event names, redaction, capture, sampling, or correlation.
- Do not remove test capture.
- Do not make observability delivery part of request correctness.

## Work Items

### 1. Delete Evlog Delivery From Core

- [ ] Remove `evlog` from root runtime dependencies.
- [ ] Delete `src/runtime/observability/evlog-bridge.ts`.
- [ ] Replace the default sink delivery with a bounded no-op sink or direct
      capture-only behavior.
- [ ] Delete evlog-specific public/internal tests.
- [ ] Update config and docs wording so observability is semantic events plus
      capture; log delivery is not a core runtime promise.

### 2. Replace Wide Summary Coupling

- [ ] Replace runtime observer's evlog-wide-summary usage with a small internal
      no-op/summary object that never affects request correctness.
- [ ] Replace MCP runtime's evlog-wide-summary usage the same way.
- [ ] Keep `RuntimeObserver.debug(...)`, `setSummary(...)`, and
      `emitSummary(...)` as safe no-ops or semantic-event helpers, whichever is
      simpler without adding another delivery path.

### 3. Preserve Semantic Observability

- [ ] Keep `createObservationEmitter(...)` producing normalized/redacted events.
- [ ] Keep `createObservationCapture()` working through
      `@lupinum/trellis/testing`.
- [ ] Keep sink failure and slow sink tests, but make them use the internal test
      sink instead of evlog mocks.
- [ ] Ensure no normal runtime file imports `evlog`.

### 4. Close Slice 10

- [ ] Mark "Move evlog delivery out of core" complete if root dependency and
      runtime imports are gone.
- [ ] Mark Slice 10 done if observability remains semantic/capturable and has
      no core delivery dependency.
- [ ] Leave any future observability package as an explicit later product
      decision, not a 1.0 blocker.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/observability.test.ts tests/unit/query-observability-cache-boundary.test.ts tests/unit/plugin-client-bootstrap.test.ts tests/unit/runtime-config.test.ts`
- [ ] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/define-convex-tool.test.ts tests/unit/server-convex-utils.test.ts`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `rg -n "from 'evlog'|from \\\"evlog\\\"|evlog-bridge|safeDebugToEvlog|createWideSummary" package.json src tests apps/docs/content/docs`
- [ ] `pnpm exec oxfmt --check package.json src/runtime/observability src/runtime/mcp/define-mcp-app.ts tests/unit/observability.test.ts meta/refactor/sprint51-observability-evlog-core-delete-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- Core runtime has no evlog dependency or import.
- Public/core apps can use semantic observation and test capture without loading
  delivery implementation code.
- Observability remains useful for explaining security decisions.
- Delivery extraction does not create a second public sink system.
- Slice 10 can close locally.
