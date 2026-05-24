# Security

This document is the durable security inventory for Trellis. It records the security boundaries the framework is expected to maintain; it is not a temporary mitigation checklist.

## Core Rule

Transport identity is not app authorization.

Every protected path should resolve:

1. how the call arrived
2. who the caller is in the app
3. which tenant scope applies
4. which permission allows the work
5. whether the work crosses a dangerous boundary

## Trusted Forwarding

Forwarded principals are valid only on verified trusted-forwarding lanes.

Expected properties:

- server routes verify external requests before forwarding identity
- Convex handlers accept forwarded principal data only through trusted-forwarding-aware validators
- weak or missing trusted-forwarding keys should fail closed
- examples must not read `args.principal` as public identity

Trusted forwarding is the foundation for server routes, webhooks, component bridge paths, and scoped MCP flows that need to act for a user or service.

## Auth Proxy Boundary

Better Auth integration must preserve the auth boundary instead of widening it.

Expected properties:

- auth endpoints minimize forwarded headers and cookies
- request bodies are size-limited where appropriate
- redirect targets are validated
- server auth state fails closed when verification cannot complete
- SSR auth responses avoid leaking user-specific state through shared caches

## Principal And Actor Resolution

A principal is transport identity. An actor is app identity.

Expected properties:

- app code owns actor resolution
- signed-in does not imply authorized
- webhook or server traffic does not imply admin
- delegated service flows state who is acting and for whom
- tests can exercise trusted-forwarding paths through test-only helpers

## Tenant Isolation

Tenant-aware apps must enforce isolation at runtime.

Expected properties:

- tenant tables have explicit tenant ownership
- tenant queries use tenant-scoped indexes or equivalent guarded access
- cross-tenant reads are explicit and narrow
- unsafe access surfaces require intent, not convenience
- doctor and lint checks should inventory obvious drift

## Permission Projection

Frontend permission state is projected from backend truth.

Expected properties:

- permission-context queries are app-owned
- `_can` data is derived by backend policy
- UI gates improve UX but do not replace handler authorization
- route guards are broad gates, not record-level proof

## Destructive Operations

Destructive agent-facing work requires preview and confirmation.

Expected properties:

- first-party UI may use ordinary guarded destructive handlers when the UI owns context
- MCP destructive tools must be operation-backed
- previews describe the target and effect
- confirmation tokens are signed and expire
- execution checks preview drift before applying changes
- replay-sensitive paths should have an audit trail

## MCP Boundary

MCP is a projection of the app model, not a side backend.

Expected properties:

- tool discovery respects auth and permission state
- scoped tools use trusted forwarding
- public tools are explicitly public
- destructive tools use confirmation
- MCP rate limiting protects ingress
- result envelopes avoid leaking internal errors or unsafe metadata

## Rate Limiting

Trellis owns MCP ingress protection and Better Auth rate-limit passthrough. App-specific business quotas belong in the consumer app, usually inside Convex where the relevant state lives.

Do not present Trellis MCP rate limiting as a universal Convex function limiter.

## Redirects And Webhooks

Redirect and webhook boundaries must be explicit.

Expected properties:

- post-auth redirects are validated against allowed local targets
- webhook routes verify signatures before calling Convex
- delegated webhook examples make the service actor and delegated user visible
- server routes should use trusted forwarding when calling protected Convex handlers for a caller

## Observability

Security-relevant decisions should be observable without changing business identity.

Expected properties:

- decision metadata can be captured at trust and authorization boundaries
- observation envelopes do not participate in query cache identity
- correlation metadata is transport/runtime state, not app data

## Supply Chain And Publishing

Publishing is a security boundary.

Expected properties:

- no long-lived npm publish tokens in CI
- release jobs use the committed lockfile and no package-manager cache
- fresh dependency resolution respects `minimumReleaseAge`
- temporary workspace overrides are explained and removed once upstreams carry
  the patched versions
- packed tarballs contain no `workspace:*` dependency ranges
- publishable packages are reviewed from `.pack/*.tgz` before release
- first package releases are manual owner-controlled publishes with 2FA
- later releases should use npm trusted publishing plus staged publishing

## Validation

Use the repo gates that match the changed surface:

```bash
pnpm run lint
pnpm run check
pnpm run test:contracts
pnpm run test:types
pnpm run test:e2e
```

`pnpm run release:verify` is the release gate.
