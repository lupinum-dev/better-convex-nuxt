# 0007: Require Preview/Confirm/Execute For Agent-Facing Destructive Work

Status: Accepted
Date: 2026-04-29

## Context

Destructive work is not all the same. First-party UI often owns enough context for a guarded delete or update. Agent and cross-surface flows need stronger review and drift protection.

## Decision

First-party app UX may use ordinary guarded destructive handlers.

Cross-surface, shared, or agent-facing destructive work uses operation-backed preview and execute flows. MCP destructive tools must be operation-backed.

## Consequences

Generated destructive operation scaffolds should expose preview and execute entrypoints.

MCP destructive flows should use signed, expiring confirmation tokens and should verify that execution still matches the confirmed preview.

This keeps agent workflows useful without turning them into unchecked write paths.
