# Sprint 50: Observability Sink Boundary

## Goal

Start Slice 10 by making the observability delivery boundary explicit. Core
keeps the event schema, normalization, redaction, capture, and emitter contract.
Delivery becomes a narrow sink call that receives already-redacted events and
cannot redefine event meaning.

This sprint should not create a broad observability plugin system. It should
replace the direct `emitter -> evlog` coupling with one small internal sink
boundary and prove capture still works without depending on delivery.

## Why This Comes Next

Slice 9 local cleanup is complete. The next local slice is observability. Today:

- `src/runtime/observability/index.ts` exports `evlog-bridge`;
- `createObservationEmitter(...)` calls `deliverObservationToEvlog(...)`
  directly;
- config error text still says Trellis delivers observability via evlog;
- tests prove evlog failures fail open, but the core contract is still tied to
  evlog delivery.

The simplest correct next step is to create one sink boundary inside
observability and route evlog through it. That lets later sprints move evlog out
or keep it internal without touching event semantics.

## Non-Goals

- Do not introduce public arbitrary sink configuration.
- Do not add sampling/redaction customization.
- Do not remove the `evlog` dependency in this sprint unless the sink boundary
  makes it trivial and tests stay small.
- Do not move observability into a new package yet.
- Do not change event names, event families, reason codes, or capture defaults.
- Do not change request correctness when delivery fails.

## Work Items

### 1. Define The Internal Sink Contract

- [x] Add a small internal `ObservationSink` shape whose only operation is
      emitting an already-redacted `TrellisObservationEvent`.
- [x] Ensure sink delivery cannot mutate schema, redaction, sampling, identity
      semantics, correlation, or request behavior.
- [x] Keep test capture separate from delivery; capture remains available from
      `@lupinum/trellis/testing`.

### 2. Route Evlog Through The Sink Boundary

- [x] Replace the direct emitter call to `deliverObservationToEvlog(...)` with
      a sink dispatch helper.
- [x] Keep evlog as the default internal delivery for now.
- [x] Keep delivery failure fail-open.
- [x] Add a bounded timeout guard for delivery if it can be implemented without
      changing the public config surface.
- [x] Update config wording so core owns event semantics and delivery is through
      an internal sink, not "via evlog" as the core contract.

### 3. Tighten Public Surface

- [x] Stop exporting `evlog-bridge` from `src/runtime/observability/index.ts`
      unless a test proves it is still part of the 1.0 public contract.
- [x] Keep event schema/config/emitter/envelope/explanations exports intact.
- [x] Update public-surface/API docs if the export removal changes generated
      docs.

### 4. Prove The Boundary

- [x] Add or update unit tests proving sinks receive redacted events.
- [x] Add or update tests proving sink/delivery failure does not throw.
- [x] Add or update tests proving capture receives events even if delivery
      fails.
- [x] Add or update tests proving delivery cannot observe raw sensitive details
      before redaction.

## Verification

- [x] `pnpm exec vitest run --project=unit tests/unit/observability.test.ts tests/unit/query-observability-cache-boundary.test.ts tests/unit/plugin-client-bootstrap.test.ts tests/unit/runtime-config.test.ts`
- [x] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/define-convex-tool.test.ts tests/unit/server-convex-utils.test.ts`
- [x] `pnpm run check:docs:api-surface`
- [x] `pnpm run check:publish-surface`
- [x] `pnpm run check:repo-policies`
- [x] `pnpm exec oxfmt --check src/runtime/observability tests/unit/observability.test.ts meta/refactor/sprint50-observability-sink-boundary-plan.md meta/trellis-1.0-refactor-plan.md`
- [x] `git diff --check`

## Notes

- Added `src/runtime/observability/sink.ts` as an internal sink boundary.
- Kept evlog as the default internal sink for now.
- Removed `evlog-bridge` from the public observability barrel; internal runtime
  observer and MCP code import evlog-wide-summary helpers directly.
- A full `tsconfig.types.json` run still reports unrelated pre-existing
  Vue-router and trusted-forwarding strictness errors, so this sprint used the
  focused verification set listed above.

## Done Means

- Core event schema and redaction remain the source of truth.
- The emitter no longer knows evlog as a special direct dependency.
- Test capture remains delivery-independent.
- Delivery failure and slow delivery do not become request correctness failures.
- The public observability barrel no longer exposes evlog delivery as a normal
  app-facing API unless intentionally retained.
