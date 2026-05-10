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

- [ ] Add a small internal `ObservationSink` shape whose only operation is
      emitting an already-redacted `TrellisObservationEvent`.
- [ ] Ensure sink delivery cannot mutate schema, redaction, sampling, identity
      semantics, correlation, or request behavior.
- [ ] Keep test capture separate from delivery; capture remains available from
      `@lupinum/trellis/testing`.

### 2. Route Evlog Through The Sink Boundary

- [ ] Replace the direct emitter call to `deliverObservationToEvlog(...)` with
      a sink dispatch helper.
- [ ] Keep evlog as the default internal delivery for now.
- [ ] Keep delivery failure fail-open.
- [ ] Add a bounded timeout guard for delivery if it can be implemented without
      changing the public config surface.
- [ ] Update config wording so core owns event semantics and delivery is through
      an internal sink, not "via evlog" as the core contract.

### 3. Tighten Public Surface

- [ ] Stop exporting `evlog-bridge` from `src/runtime/observability/index.ts`
      unless a test proves it is still part of the 1.0 public contract.
- [ ] Keep event schema/config/emitter/envelope/explanations exports intact.
- [ ] Update public-surface/API docs if the export removal changes generated
      docs.

### 4. Prove The Boundary

- [ ] Add or update unit tests proving sinks receive redacted events.
- [ ] Add or update tests proving sink/delivery failure does not throw.
- [ ] Add or update tests proving capture receives events even if delivery
      fails.
- [ ] Add or update tests proving delivery cannot observe raw sensitive details
      before redaction.

## Verification

- [ ] `pnpm exec vitest run --project=unit tests/unit/observability.test.ts tests/unit/query-observability-cache-boundary.test.ts tests/unit/plugin-client-bootstrap.test.ts tests/unit/runtime-config.test.ts`
- [ ] `pnpm exec vitest run --project=unit tests/unit/functions-defineTrellis.test.ts tests/unit/define-convex-tool.test.ts tests/unit/server-convex-utils.test.ts`
- [ ] `pnpm run check:docs:api-surface`
- [ ] `pnpm run check:publish-surface`
- [ ] `pnpm run check:repo-policies`
- [ ] `pnpm exec oxfmt --check src/runtime/observability tests/unit/observability.test.ts meta/refactor/sprint50-observability-sink-boundary-plan.md meta/trellis-1.0-refactor-plan.md`
- [ ] `git diff --check`

## Done Means

- Core event schema and redaction remain the source of truth.
- The emitter no longer knows evlog as a special direct dependency.
- Test capture remains delivery-independent.
- Delivery failure and slow delivery do not become request correctness failures.
- The public observability barrel no longer exposes evlog delivery as a normal
  app-facing API unless intentionally retained.
