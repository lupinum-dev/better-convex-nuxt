# 0011: Improve Raw MCP Projection Before Adding A Resource DSL

Status: Accepted
Date: 2026-04-29

## Context

MCP resources, prompts, sessions, and tools can be verbose. A larger declaration DSL could reduce repetition, but adding it too early risks hiding transport boundaries and creating another abstraction layer before the raw model is clean.

## Decision

Improve the raw MCP surface first.

An optional resource declaration DSL may be added later only if the raw primitives are stable and the DSL removes real duplication without hiding auth, permission, tenant, or destructive-operation boundaries.

## Consequences

Current MCP docs and examples should remain explicit about transport edges.

Future DSL work must preserve debugging clarity and should project existing app resources rather than inventing a side model.
