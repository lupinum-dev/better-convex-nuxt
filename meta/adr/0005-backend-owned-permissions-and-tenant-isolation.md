# 0005: Keep Permissions And Tenant Isolation Backend-Owned

Status: Accepted
Date: 2026-04-29

## Context

Trellis apps often need roles, workspace membership, tenant isolation, row visibility, and projected UI capabilities. If each surface implements its own checks, permission drift is likely.

## Decision

Permissions and tenant boundaries are backend-owned.

Frontend capability state is a projection of backend truth. Tenant-aware apps use runtime-enforced isolation. Cross-tenant or unsafe access paths must be explicit and narrow.

## Consequences

UI checks improve ergonomics but do not replace handler authorization.

Examples and generated code should make `_can` data, permission-context queries, guards, and tenant indexes visible.

Doctor, lint, and tests should continue to pressure dangerous or ambiguous access paths.
