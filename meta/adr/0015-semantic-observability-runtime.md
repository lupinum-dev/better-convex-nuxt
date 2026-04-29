# 0015: Own Semantic Observability In The Runtime

Status: Accepted
Date: 2026-04-29

## Context

Trellis crosses several sensitive boundaries: auth, tenant isolation, unsafe access, trusted forwarding, destructive operations, MCP tools, and server callers. Generic logs are not enough to explain those decisions.

Earlier configurable observability hooks risked making every app invent a different event model.

## Decision

Trellis owns the semantic observability model.

The runtime emits structured decision events with correlation context and delivers them through evlog. Trellis owns redaction and correlation generation. Apps can configure delivery and capture behavior, but they do not redefine the event vocabulary.

## Consequences

Observability is part of the framework contract for debugging trust and authorization decisions.

Event delivery must never break application behavior if the logging backend fails.

Observation metadata remains runtime/transport context and must not participate in business identity or query cache identity.
