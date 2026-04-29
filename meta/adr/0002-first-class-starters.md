# 0002: Keep Current Starters First-Class

Status: Accepted
Date: 2026-04-29

## Context

The repository currently contains and documents multiple starter lanes. Some older planning material narrowed the list, which created unnecessary conflict with the implementation.

## Decision

Treat the current starters as first-class:

- `public`
- `personal`
- `workspace`
- `cms`

MCP remains a capability on `workspace`, not a separate starter taxonomy.

## Consequences

Docs, examples, CLI behavior, and `doctor` checks should avoid contradicting the starters that actually exist.

Future positioning can change, but Trellis should not demote an existing maintained starter without implementation evidence and a replacement decision.
