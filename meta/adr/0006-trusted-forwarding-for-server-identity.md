# 0006: Use Trusted Forwarding For Server Identity

Status: Accepted
Date: 2026-04-29

## Context

Server routes, webhooks, component bridges, and MCP paths sometimes need to call Convex while preserving a verified caller identity. Raw public args are not a safe identity channel.

## Decision

Trusted forwarding is the canonical server-to-Convex identity bridge.

Forwarded principals are accepted only through verified trusted-forwarding-aware paths. Server routes must verify incoming requests before forwarding identity.

## Consequences

Examples should not teach `args.principal` as public identity.

Webhook and MCP flows must make the verification boundary visible.

Weak trusted-forwarding configuration should fail closed where possible.
