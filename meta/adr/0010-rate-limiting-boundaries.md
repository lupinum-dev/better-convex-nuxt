# 0010: Keep Rate-Limiting Boundaries Explicit

Status: Accepted
Date: 2026-04-29

## Context

Trellis has MCP ingress protection and Better Auth integration, but consumer apps may also need business-specific quotas inside Convex. A single universal rate limiter would blur responsibilities.

## Decision

Trellis owns:

- MCP ingress rate limiting
- Better Auth rate-limit passthrough
- documentation and examples that explain application-layer quotas

Consumer apps own business quotas, usually inside Convex where the relevant state and tenant policy live.

## Consequences

Do not present Trellis MCP rate limiting as a generic limiter for every Convex function.

If Trellis later adds broader rate-limiting support, it must be justified by real app pressure and fit the trust/tenant model.

For Trellis 1.0, production MCP rate-limit stores must be explicit and
externally shared when a deployment has more than one process. Process-local
stores are development conveniences, not production safety.
