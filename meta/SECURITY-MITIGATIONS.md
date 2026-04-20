# Security Mitigations Tracker

This document tracks security concepts that are already implemented in the Trellis codebase.

It is intentionally split into:

- implemented controls that already exist
- the files and tests that enforce them
- open gaps that are still known and should not be mistaken for solved

This is a code inventory, not a marketing claim. A section belongs here only if the mitigation already exists in runtime code, static analysis, tests, or shipped examples.

## Identity, Auth, and Trust Boundaries

### Trusted forwarding boundary

Status: implemented

What exists:

- constant-time trusted-forwarding key comparison
- production rejection of weak or obviously development-like forwarding keys
- canonical subject extraction for forwarded principals and delegations
- strict subject matching between the verified transport envelope and forwarded `principal` / `delegation`
- forwarded identity fields are only readable on verified trusted-forwarding paths

Runtime:

- [src/runtime/trusted-forwarding/shared.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/trusted-forwarding/shared.ts)
- [src/runtime/trusted-forwarding/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/trusted-forwarding/index.ts)
- [src/runtime/convex/server/convex.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/convex/server/convex.ts)
- [src/runtime/auth/define-actor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-actor.ts)

Tests:

- [tests/unit/trusted-forwarding.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/trusted-forwarding.test.ts)
- [tests/unit/server-convex-utils.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/server-convex-utils.test.ts)
- [tests/unit/server-index-exports.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/server-index-exports.test.ts)
- [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts)

### Server auth: verified JWTs on trusted server paths

Status: implemented

What exists:

- server-side auth does not trust payload-only JWT decoding for authentication decisions
- cached auth tokens are accelerators, not trust roots
- server auth verifies JWT signatures before authenticating requests
- cache hits are revalidated against upstream Better Auth session liveness
- invalid or revoked sessions purge cached auth state and fail closed

Runtime:

- [src/runtime/auth/server/auth-resolver.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-resolver.ts)
- [src/runtime/auth/server/verified-jwt.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/verified-jwt.ts)
- [src/runtime/auth/server/auth-cache.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-cache.ts)

Tests:

- [tests/server/ssr-cache.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/server/ssr-cache.server.test.ts)
- [tests/server/server-helpers-auth.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/server/server-helpers-auth.server.test.ts)
- [tests/unit/server-convex-utils.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/server-convex-utils.test.ts)

### Auth proxy boundary hardening

Status: implemented

What exists:

- strict same-origin or explicitly trusted-origin enforcement
- method restrictions on critical auth endpoints such as `/convex/token` and `/get-session`
- malformed path rejection, including traversal-like and double-decoded cases
- request and response body size limits
- canonical-origin redirect following only for safe upstream redirects
- cache eviction on upstream logout-cookie clearing

Runtime:

- [src/runtime/auth/server/api/auth/[...].ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/api/auth/[...].ts)
- [src/runtime/auth/server/api/auth/security.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/api/auth/security.ts)
- [src/runtime/auth/server/api/auth/redirect-utils.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/api/auth/redirect-utils.ts)
- [src/runtime/auth/server/auth-cache.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-cache.ts)

Tests:

- [tests/unit/auth-proxy-handler.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/auth-proxy-handler.server.test.ts)
- [tests/unit/auth-proxy-redirects.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/auth-proxy-redirects.test.ts)
- [tests/unit/owasp.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/owasp.test.ts)

### Auth proxy header and cookie minimization

Status: implemented

What exists:

- only Better Auth cookies are forwarded across the SSR token-exchange boundary
- hop-by-hop and unsafe proxy headers are stripped
- forwarded host, proto, and client IP are overwritten from trusted request context
- unsafe response headers are suppressed on proxy responses

Runtime:

- [src/runtime/auth/server/api/auth/headers.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/api/auth/headers.ts)
- [src/runtime/auth/shared/auth-token.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/shared/auth-token.ts)
- [src/runtime/auth/server/auth-resolver.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-resolver.ts)

Tests:

- [tests/unit/auth-proxy-headers.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/auth-proxy-headers.test.ts)
- [tests/server/server-helpers-auth.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/server/server-helpers-auth.server.test.ts)
- [tests/unit/convex-cache-auth-token.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/convex-cache-auth-token.test.ts)

### Trusted origin normalization and origin matching

Status: implemented

What exists:

- trusted origins are normalized before runtime use
- localhost and `127.0.0.1` development origin pairing is handled explicitly
- wildcard matching is label-scoped instead of suffix-matching arbitrary hosts
- invalid origin patterns are rejected

Runtime:

- [src/runtime/auth/define-auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-auth.ts)
- [src/runtime/utils/config-normalization.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/utils/config-normalization.ts)
- [src/runtime/auth/server/api/auth/security.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/api/auth/security.ts)

Tests:

- [tests/unit/runtime-config.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/runtime-config.test.ts)
- [tests/unit/auth-security-origin.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/auth-security-origin.test.ts)
- [tests/unit/define-auth.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/define-auth.test.ts)

### SSR hydration fail-closed behavior

Status: implemented

What exists:

- if server auth cannot produce a client-safe decoded user, the token is stripped from hydration
- hydration payloads downgrade to unauthenticated instead of leaking undecodable or invalid auth state

Runtime:

- [src/runtime/auth/server/auth-hydration.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-hydration.ts)
- [src/runtime/plugin.server.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/plugin.server.ts)

Tests:

- [tests/unit/plugin-server-auth-misconfig.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/plugin-server-auth-misconfig.test.ts)
- [tests/nuxt/identity-continuity.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/identity-continuity.nuxt.test.ts)
- [tests/nuxt/owasp.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/owasp.nuxt.test.ts)

### SSR auth response caching policy

Status: implemented

What exists:

- authenticated SSR responses are marked private and uncacheable
- SSR auth failures are classified separately from revoked-session failures
- server auth misconfiguration fails loudly in the relevant server path

Runtime:

- [src/runtime/plugin.server.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/plugin.server.ts)
- [src/runtime/auth/server/auth-resolver.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/server/auth-resolver.ts)

Tests:

- [tests/unit/plugin-server-auth-misconfig.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/plugin-server-auth-misconfig.test.ts)
- [tests/server/ssr-cache.server.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/server/ssr-cache.server.test.ts)

### Client auth state machine fail-closed rules

Status: implemented

What exists:

- token-only client state does not count as authenticated
- expired hydrated tokens are refreshed instead of trusted indefinitely
- stale refresh results are discarded
- sign-out wins over pending refresh state
- shared auth engine state is bound to `nuxtApp` instead of module globals to avoid SSR cross-request leakage and duplicated module-scope state

Runtime:

- [src/runtime/auth/client/auth-engine.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/client/auth-engine.ts)
- [src/runtime/auth/client/auth-client.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/client/auth-client.ts)
- [src/runtime/auth/client/auth-hydration.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/client/auth-hydration.ts)

Tests:

- [tests/nuxt/owasp.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/owasp.nuxt.test.ts)
- [tests/nuxt/identity-continuity.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/identity-continuity.nuxt.test.ts)
- [tests/nuxt/useConvexAuthInternal.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/useConvexAuthInternal.nuxt.test.ts)

### Route protection and safe post-auth redirect flow

Status: implemented

What exists:

- route-protection middleware enforces auth before page render
- return-to flow is preserved through `?redirect=...`
- login-loop prevention exists for redirect targets
- unsafe redirect targets fall back to safe internal paths
- client auth flows reuse the safe redirect path instead of hand-rolling redirect logic

Runtime:

- [src/runtime/auth/middleware/route-protection.global.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/middleware/route-protection.global.ts)
- [src/runtime/auth/shared/auth-route-protection.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/shared/auth-route-protection.ts)
- [src/runtime/auth/composables/useAuthRedirect.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/composables/useAuthRedirect.ts)
- [src/runtime/utils/redirect-safety.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/utils/redirect-safety.ts)

Tests:

- [tests/nuxt/useConvexAuthFlow.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/useConvexAuthFlow.nuxt.test.ts)
- [tests/unit/route-protection.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/route-protection.test.ts)
- [tests/e2e/internal-harness-smoke.e2e.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/e2e/internal-harness-smoke.e2e.test.ts)

## MCP, Agents, and Destructive Operations

### MCP output hardening

Status: implemented

What exists:

- structured tool results are not mirrored verbatim into the model text channel by default
- model-visible text requires explicit opt-in
- `withUntrustedText()` frames user-authored text as untrusted content

Runtime:

- [src/runtime/mcp/result-envelope.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/result-envelope.ts)
- [src/runtime/mcp/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/index.ts)

Tests:

- [tests/unit/result-envelope.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/result-envelope.test.ts)

### MCP rate limiting

Status: implemented

What exists:

- rate-limited tools hard-fail in production without an explicit distributed store
- first-party Redis fixed-window store exists
- infrastructure failures in the distributed store surface explicitly
- process-local memory remains as a non-production fallback

Runtime:

- [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)
- [src/runtime/mcp/rate-limiter.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/rate-limiter.ts)

Tests:

- [tests/unit/define-convex-tool.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/define-convex-tool.test.ts)
- [tests/unit/rate-limiter.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/rate-limiter.test.ts)
- [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts)

### MCP session boundary

Status: implemented

What exists:

- session ids are UUIDv4-validated before storage access
- storage is namespaced by both principal identity and session id
- writes carry a TTL so session state does not persist indefinitely

Runtime:

- [src/runtime/mcp/use-mcp-session.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/use-mcp-session.ts)

Tests:

- [tests/unit/use-mcp-session.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/use-mcp-session.test.ts)

### MCP discovery-time permission and auth gating

Status: implemented

What exists:

- tools are hidden from discovery when auth, scoped tenancy, explicit checks, or capability permissions fail
- execution re-checks the same boundaries

Runtime:

- [src/runtime/mcp/define-convex-tool.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-convex-tool.ts)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)
- [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts)

Tests:

- [tests/unit/define-convex-tool.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/define-convex-tool.test.ts)

### Destructive tool binding rules

Status: implemented

What exists:

- generic destructive MCP tools are rejected
- destructive MCP execution must go through `tool.fromOperation(...)`
- doctor already flags destructive-looking tools that bypass the supported pattern

Runtime:

- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)
- [src/runtime/mcp/types.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/types.ts)
- [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts)

Tests:

- [tests/unit/define-convex-tool.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/define-convex-tool.test.ts)
- [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts)

### Confirmation token signing and expiry

Status: implemented

What exists:

- destructive confirmation tokens are signed JWTs
- tokens carry audience binding and expiry
- payloads include operation id, execute path, preview path, principal key, tenant key, args hash, preview hash, and `jti`

Runtime:

- [src/runtime/mcp/confirmation-token.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/confirmation-token.ts)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)
- [src/runtime/functions/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts)

Tests:

- [tests/unit/mcp-confirmation-token.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/mcp-confirmation-token.test.ts)
- [tests/e2e/mcp-smoke.e2e.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/e2e/mcp-smoke.e2e.test.ts)

### Replay protection and audit trail for destructive execution

Status: partially implemented

What exists:

- destructive execution checks whether a `jti` has already been redeemed
- replayed confirmation tokens are rejected
- destructive flows write audit/redemption records through the supported path

Runtime:

- [src/runtime/functions/index.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/index.ts)
- [src/runtime/mcp/define-mcp-app.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/mcp/define-mcp-app.ts)

Tests:

- [tests/e2e/mcp-smoke.e2e.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/e2e/mcp-smoke.e2e.test.ts)

Note:

- this does not make external side effects atomically replay-safe across every action boundary; see Open Work

## Multi-Tenancy, Permissions, and Visibility

### Tenant isolation static validation

Status: implemented

What exists:

- tenant-isolation table coverage is validated against schema shape
- duplicate and conflicting table classifications are rejected
- tenant field and tenant index presence are checked
- destructive-safety schema drift is also statically validated here

Runtime and analysis:

- [src/analysis/validation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/validation.ts)

Tests:

- [tests/unit/tenant-analysis-validation.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/tenant-analysis-validation.test.ts)
- [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts)

### ESLint security boundaries

Status: implemented

What exists:

- actor access before auth narrowing is rejected
- null-unsafe actor checks are rejected
- protected handlers are pushed to `enforce()` before DB access
- structured guards must stay synchronous and DB-free
- tenant-scoped collection reads require `.withIndex(...)`
- unsafe `ctx.db.get()` on tenant docs requires explicit tenant validation before use
- `escapeTenantIsolation(...)` requires an explicit reason

Runtime and lint:

- [src/eslint/rules/auth.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/eslint/rules/auth.ts)
- [src/eslint/rules/tenant.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/eslint/rules/tenant.ts)

Tests:

- [tests/unit/eslint-plugin.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/eslint-plugin.test.ts)

### Permission context and fail-closed capability projection

Status: implemented

What exists:

- only declared permissions are projected
- anonymous callers receive `null` context
- reserved keys cannot be overwritten by permission-context extensions
- client permission handling fails closed when permission context belongs to a previous user

Runtime:

- [src/runtime/auth/define-permission-context.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/auth/define-permission-context.ts)
- [src/runtime/composables/configured-permissions.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/composables/configured-permissions.ts)

Tests:

- [tests/nuxt/usePermissions.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/usePermissions.nuxt.test.ts)

### Typed load/authorize pattern

Status: implemented

What exists:

- structured operation and handler typing pushes authorization toward loaded records instead of raw args
- this is a design constraint that reduces IDOR-by-args mistakes, even though it does not make them impossible

Runtime:

- [src/runtime/functions/define-operation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/functions/define-operation.ts)

Tests:

- [tests/types/authorize-shorthand.types.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/types/authorize-shorthand.types.ts)

### Redaction and visibility primitives

Status: implemented as primitives and example pattern

What exists:

- the framework exports field-redaction primitives
- shipped examples demonstrate applying row visibility plus field redaction before returning data

Runtime:

- [src/runtime/visibility/define-redaction.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/visibility/define-redaction.ts)

Tests:

- [tests/unit/visibility-primitives.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/visibility-primitives.test.ts)

Examples:

- [examples/05-visibility-access/convex/features/articles/redaction.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/05-visibility-access/convex/features/articles/redaction.ts)
- [examples/05-visibility-access/convex/features/articles/domain.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/05-visibility-access/convex/features/articles/domain.ts)
- [examples/05-visibility-access/convex/knowledgeBase.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/05-visibility-access/convex/knowledgeBase.test.ts)

Note:

- structural enforcement that all public returns use redaction is still open; see Open Work

## Doctor and Static Audit Coverage

### Doctor security checks

Status: implemented

What exists:

- trusted-forwarding key strength and public-exposure checks
- forwarded-principal misuse detection
- tenant-isolation coverage and schema drift checks
- destructive-safety schema checks
- MCP rate-limit store support checks
- destructive MCP binding checks
- permission query wiring checks

Runtime and analysis:

- [src/cli/commands/doctor.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/cli/commands/doctor.ts)
- [src/analysis/validation.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/analysis/validation.ts)

Tests:

- [tests/unit/cli-doctor.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/cli-doctor.test.ts)

## Redirects, Webhooks, and Example-Level Security Patterns

### Redirect validation

Status: implemented

What exists:

- protocol-relative, encoded slash, backslash, control-character, zero-width, and bidi-shaped redirect payloads are rejected
- fallback resolution keeps redirects inside safe internal paths

Runtime:

- [src/runtime/utils/redirect-safety.ts](/Users/matthias/Git/0_libs/WORK/trellis/src/runtime/utils/redirect-safety.ts)

Tests:

- [tests/unit/owasp.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/unit/owasp.test.ts)
- [tests/nuxt/useConvexAuthFlow.nuxt.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/tests/nuxt/useConvexAuthFlow.nuxt.test.ts)

### Webhook signature verification

Status: implemented

What exists:

- shared constant-time webhook secret comparison helper
- shipped examples use the helper instead of direct string comparison

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

### Delegated service webhook example pattern

Status: implemented as shipped example pattern

What exists:

- example routes validate request shape, verify a route-owned secret, and then forward a trusted service principal plus delegated user identity into business logic
- example tests cover permission-equivalent delegated service flows

Examples:

- [examples/07-mcp-reference/server/api/runbook-webhook.post.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/server/api/runbook-webhook.post.ts)
- [examples/07-mcp-reference/test/mcpReference.test.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/07-mcp-reference/test/mcpReference.test.ts)
- [examples/03-team-workspace/server/api/webhook.post.ts](/Users/matthias/Git/0_libs/WORK/trellis/examples/03-team-workspace/server/api/webhook.post.ts)

## Open Work

These are still not fully solved and should remain explicitly tracked:

- runtime backstop for tenant-scoped `.collect()` without an indexed tenant path
- explicit dangerous-mode gating for `unsafe.*` and `escapeTenantIsolation(...)`
- stronger structural enforcement that redaction is applied at public return boundaries
- safer first-class delegation helpers for represented-user MCP flows
- stronger destructive confirmation binding to canonical resource snapshots instead of developer-chosen preview summaries alone
- runtime startup enforcement that destructive redemption schema and `by_jti` index are present
- full replay safety for external side effects performed outside the Convex transaction boundary
- stronger framework-level webhook replay/idempotency helpers

## Verification Commands

Recent validation run for the hardening pass documented here:

```bash
pnpm vitest run tests/server/ssr-cache.server.test.ts tests/server/server-helpers-auth.server.test.ts tests/unit/server-convex-utils.test.ts tests/unit/result-envelope.test.ts tests/unit/define-convex-tool.test.ts tests/unit/owasp.test.ts tests/unit/example-webhook-security.test.ts tests/unit/use-mcp-session.test.ts tests/unit/plugin-server-auth-misconfig.test.ts tests/nuxt/owasp.nuxt.test.ts
pnpm --dir examples/03-team-workspace test
pnpm --dir examples/04-saas-platform test
pnpm --dir examples/07-mcp-reference test
pnpm exec eslint src/runtime/auth/server/auth-resolver.ts src/runtime/auth/server/verified-jwt.ts src/runtime/mcp/define-convex-tool.ts src/runtime/mcp/define-mcp-app.ts src/runtime/mcp/index.ts src/runtime/mcp/result-envelope.ts src/runtime/mcp/use-mcp-session.ts src/runtime/server/index.ts src/runtime/server/webhooks.ts src/runtime/utils/redirect-safety.ts tests/server/server-helpers-auth.server.test.ts tests/server/ssr-cache.server.test.ts tests/support/auth/server-jwt.ts tests/unit/result-envelope.test.ts tests/unit/example-webhook-security.test.ts tests/unit/use-mcp-session.test.ts tests/unit/server-convex-utils.test.ts examples/03-team-workspace/server/api/webhook.post.ts examples/03-team-workspace/server/api/webhook.post.test.ts examples/04-saas-platform/server/api/webhook.post.ts examples/04-saas-platform/server/api/webhook.post.test.ts examples/07-mcp-reference/server/api/runbook-webhook.post.ts examples/07-mcp-reference/server/api/runbook-webhook.post.test.ts
pnpm exec tsc -p tsconfig.publish-surface.json --noEmit
```
