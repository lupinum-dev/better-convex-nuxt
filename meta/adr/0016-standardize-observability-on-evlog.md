# 0016: Standardize Observability On Evlog

Status: Accepted
Date: 2026-04-29

## Context

Trellis now emits observability events from several runtime surfaces: browser query and mutation state, Nuxt server handling, Convex function wrappers, protected handlers, trusted forwarding, tenant/service database access, destructive operations, and MCP tools.

Those events are not ordinary application logs. They explain framework decisions at trust and authorization boundaries: which principal was resolved, which actor was loaded, which guard or authorization rule denied, when tenant isolation was intentionally escaped, when destructive confirmation drifted, and which MCP tool was called or denied.

Earlier observability designs left too much room for app-level adapters, redactors, and correlation generators. That made the delivery layer configurable, but it also risked losing the durable value of Trellis observability: one stable event vocabulary that external contributors, app developers, and agents can reason about consistently.

Trellis already depends on `evlog`, and the runtime now has a dedicated `src/runtime/observability` vertical that owns config normalization, event typing, capture hooks, correlation envelopes, `evlog` delivery, denial explanations, and runtime observers.

## Decision

Trellis standardizes framework observability on `evlog`.

The Trellis runtime owns the semantic event model. Event names, statuses, transports, reason codes, denial explanations, redaction, and correlation generation are framework contracts, not app extension points. Apps can configure whether observability is enabled, which surfaces emit, the verbosity level, per-family sampling, service labeling, the correlation header name, and agent-denial explainability. Apps cannot replace the delivery adapter, install a custom redactor, or provide a custom correlation generator through Trellis module config.

`evlog` is the delivery and summary substrate. Trellis sends semantic events to `evlog` as structured payloads with `kind: 'trellis-observation'`. Request and runtime summaries use `evlog` request/wide loggers where that shape is useful, but the Trellis event vocabulary remains owned by Trellis rather than inherited from `evlog`.

Observability is fail-open. Failure to normalize optional runtime config, initialize `evlog`, build an event payload, redact an event, emit test capture, or deliver to `evlog` must not fail the user request or mutate business semantics. Internal observability failures may warn for maintainers, but they must not become application behavior.

Observation metadata stays out of business identity. Correlation IDs, observation envelopes, transports, request IDs, and `__trellis` metadata are runtime context only. They must not affect authorization identity, tenant identity, handler arguments, or query cache identity.

Testing uses Trellis capture hooks rather than replacing the logger. `createObservationCapture()` observes emitted semantic events for unit and integration tests while production delivery still runs through the same Trellis observability path.

## Consequences

External contributors should treat `src/runtime/observability` as the boundary for observability changes. Auth, Convex, MCP, server helpers, uploads, and client runtime code should import from that vertical rather than recreating local logging utilities.

New protected-handler, MCP, trust-boundary, or runtime-state features should emit existing semantic events where possible. If a new event is necessary, it must be added to the typed vocabulary, docs, and tests together.

Trellis can provide consistent debugging and agent-facing explanations across transports because the vocabulary does not vary by app. A `guard.denied`, `operation.confirm.drifted`, or `tool.denied` event means the same thing in every Trellis app.

The cost of this decision is less app-level customization. Projects that need additional business logs should use their own logging alongside Trellis observability instead of changing Trellis' framework event model.

`evlog` remains an implementation dependency of Trellis observability. Replacing it would require a new ADR because it would affect delivery behavior, runtime summaries, tests, and the public operational story.
