# Security Mitigations Tracker

This document tracks security hardening that has already landed in the Trellis codebase.

It is intentionally implementation-focused:
- what was mitigated
- where the mitigation lives
- which tests cover it
- what is still open

## Implemented

### Server auth: verified JWTs on trusted server paths

Status: implemented

What changed:
- server-side auth no longer trusts payload-only JWT decoding for authentication decisions
- cached auth tokens are treated as accelerators, not trust roots
- server auth now verifies JWT signatures before authenticating a request
- cache hits are revalidated against Better Auth session liveness before the cached token is accepted
- revoked or invalid sessions purge the cache and fail closed

Runtime:
- [src/runtime/auth/server/auth-resolver.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-resolver.ts)
- [src/runtime/auth/server/verified-jwt.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/verified-jwt.ts)
- [src/runtime/auth/server/auth-cache.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-cache.ts)

Tests:
- [tests/server/ssr-cache.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/server/ssr-cache.server.test.ts)
- [tests/server/server-helpers-auth.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/server/server-helpers-auth.server.test.ts)
- [tests/unit/server-convex-utils.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/server-convex-utils.test.ts)

### MCP output hardening

Status: implemented

What changed:
- structured tool results are no longer mirrored verbatim into the model text channel by default
- model-visible text now requires explicit opt-in
- `withUntrustedText()` frames user-authored text as untrusted content instead of letting raw data become instructions by default

Runtime:
- [src/runtime/mcp/result-envelope.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/result-envelope.ts)
- [src/runtime/mcp/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/index.ts)

Tests:
- [tests/unit/result-envelope.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/result-envelope.test.ts)

### MCP rate limiting: production store required

Status: implemented

What changed:
- defining a rate-limited MCP tool in production without an explicit distributed store now throws
- process-local memory is no longer silently accepted as a production default for rate-limited tools

Runtime:
- [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)

Tests:
- [tests/unit/define-convex-tool.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/define-convex-tool.test.ts)

### MCP sessions: principal binding and TTL

Status: implemented

What changed:
- MCP session storage is now namespaced by both session id and caller identity
- writes carry a TTL so session state does not persist indefinitely

Runtime:
- [src/runtime/mcp/use-mcp-session.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/use-mcp-session.ts)

Tests:
- [tests/unit/use-mcp-session.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/use-mcp-session.test.ts)

### Redirect validation: Unicode and invisible characters

Status: implemented

What changed:
- redirect validation now rejects control characters, zero-width characters, bidi overrides, and similar path-shaping code points

Runtime:
- [src/runtime/utils/redirect-safety.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/utils/redirect-safety.ts)

Tests:
- [tests/unit/owasp.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/owasp.test.ts)

### Webhook signature verification: constant-time compare

Status: implemented

What changed:
- added a shared constant-time webhook signature helper
- migrated shipped webhook examples to use the helper
- updated example tests to mock the new helper explicitly

Runtime:
- [src/runtime/server/webhooks.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/webhooks.ts)
- [src/runtime/server/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/server/index.ts)

Examples:
- [examples/03-team-workspace/server/api/webhook.post.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/03-team-workspace/server/api/webhook.post.ts)
- [examples/04-saas-platform/server/api/webhook.post.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/04-saas-platform/server/api/webhook.post.ts)
- [examples/07-mcp-reference/server/api/runbook-webhook.post.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/server/api/runbook-webhook.post.ts)

Tests:
- [tests/unit/example-webhook-security.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/example-webhook-security.test.ts)
- [examples/03-team-workspace/server/api/webhook.post.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/03-team-workspace/server/api/webhook.post.test.ts)
- [examples/04-saas-platform/server/api/webhook.post.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/04-saas-platform/server/api/webhook.post.test.ts)
- [examples/07-mcp-reference/server/api/runbook-webhook.post.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/server/api/runbook-webhook.post.test.ts)

## Open Work

These items are not solved by the hardening above and should remain tracked separately:

- runtime backstop for tenant-scoped `.collect()` without an indexed tenant path
- explicit dangerous-mode gating for `unsafe.*` and `escapeTenantIsolation(...)`
- destructive confirmation binding to canonical resource snapshots rather than developer-chosen summaries alone
- runtime enforcement that destructive redemption schema and `by_jti` index are present
- stronger structural redaction enforcement at public return boundaries
- safer first-class delegation helpers for represented-user MCP flows
- stronger webhook replay/idempotency helpers at the framework boundary

## Verification Commands

Repo-level validation that passed with this hardening set:

```bash
pnpm vitest run tests/server/ssr-cache.server.test.ts tests/server/server-helpers-auth.server.test.ts tests/unit/server-convex-utils.test.ts tests/unit/result-envelope.test.ts tests/unit/define-convex-tool.test.ts tests/unit/owasp.test.ts tests/unit/example-webhook-security.test.ts tests/unit/use-mcp-session.test.ts tests/unit/plugin-server-auth-misconfig.test.ts tests/nuxt/owasp.nuxt.test.ts
pnpm --dir examples/03-team-workspace test
pnpm --dir examples/04-saas-platform test
pnpm --dir examples/07-mcp-reference test
pnpm exec eslint src/runtime/auth/server/auth-resolver.ts src/runtime/auth/server/verified-jwt.ts src/runtime/mcp/define-convex-tool.ts src/runtime/mcp/define-mcp-app.ts src/runtime/mcp/index.ts src/runtime/mcp/result-envelope.ts src/runtime/mcp/use-mcp-session.ts src/runtime/server/index.ts src/runtime/server/webhooks.ts src/runtime/utils/redirect-safety.ts tests/server/server-helpers-auth.server.test.ts tests/server/ssr-cache.server.test.ts tests/support/auth/server-jwt.ts tests/unit/result-envelope.test.ts tests/unit/example-webhook-security.test.ts tests/unit/use-mcp-session.test.ts tests/unit/server-convex-utils.test.ts examples/03-team-workspace/server/api/webhook.post.ts examples/03-team-workspace/server/api/webhook.post.test.ts examples/04-saas-platform/server/api/webhook.post.ts examples/04-saas-platform/server/api/webhook.post.test.ts examples/07-mcp-reference/server/api/runbook-webhook.post.ts examples/07-mcp-reference/server/api/runbook-webhook.post.test.ts
pnpm exec tsc -p tsconfig.publish-surface.json --noEmit
```
