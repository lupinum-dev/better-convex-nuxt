# Security Policy

## Supported versions

Security fixes are provided for the latest published minor release. Pre-`0.7.0` releases use the superseded auth boundary and are not supported for security-sensitive deployments.

The hardened contract supports Node `^22.12.0 || ^24.11.0 || >=26.0.0`, Nuxt `^4.4.0`, Better Auth `1.6.23`, `@convex-dev/better-auth` `0.12.5`, and the exact Convex version in the published package. Dependency tuple changes require the full security and compatibility gates.

Better Auth, `@convex-dev/better-auth`, and Convex are exact peer dependencies: the consuming application must resolve one physical instance of each. Duplicate instances are outside the supported contract because they split plugin registries and Convex type/runtime identity.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub Security Advisories for this repository and include affected versions, prerequisites, reproduction steps, impact, and any proposed mitigation. Maintainers will acknowledge a complete report within three business days and coordinate disclosure after a fix is available.

## Supported security contract

- Browser auth is same-origin through fixed `/api/auth`; only GET and POST are accepted.
- `convex.siteUrl` is one bare HTTPS origin, except loopback HTTP in development.
- Better Auth uses its default cookie prefix/name, host-only cookies, and `/api/auth` base path. Custom names, prefixes, `Domain` cookies, cross-subdomain cookies, and custom auth base paths are unsupported and fail closed at the proxy boundary.
- Better Auth server `baseURL` is the static Nuxt application origin, and its `trustedOrigins` contains each exact application origin.
- Runtime factories reject missing, surrounding-whitespace, or shorter-than-32-character Better Auth secrets and have no production fallback. A length check cannot prove entropy: operators must provision at least 32 random bytes from a cryptographically secure generator or secret manager (for example, `openssl rand -base64 32`) and own storage and rotation.
- Forwarded headers are untrusted. A client IP is accepted only from the explicitly configured ingress-owned header.
- Better Auth owns session truth. Convex backend functions remain responsible for authorization through `ctx.auth` and application rules.
- Better Auth owns credential hashing, verification, and storage. Consumers must not add a second password store or hash path; they own password acceptance policy, including the breached/common-password blocklist.
- `convex()` is the sole JWT integration. It already embeds the Better Auth JWT and bearer plugins; adding a separate generic `jwt()` plugin is unsupported.
- Better Auth two-factor authentication is not supported on the pinned `@convex-dev/better-auth` `0.12.5` tuple. Its packaged schema omits Better Auth `1.6.23` lockout fields, and its adapter does not implement the native atomic increment that lockout requires; Better Auth's read-then-update fallback can lose concurrent failures. A future validated configuration must order `twoFactor()` before `convex()` so no Convex JWT can be minted for the pre-challenge session.
- The standalone Better Auth OIDC Provider and MCP plugins are unsupported through this module's fixed auth proxy because they emit unprefixed prompt cookies outside the supported namespace. The internal OIDC discovery/JWKS behavior embedded by `convex()` remains supported.
- Production OAuth is conditional on an explicit account-linking policy, encrypted access/refresh-token storage, least-privilege provider scopes, and a real provider callback/recovery rehearsal. Implicit same-email linking, different-email linking, and unlinking the last account are outside the conservative supported policy.
- Convex Better Auth adapter `verbose` mode is a local diagnostic only. It logs request and response headers that can contain session, bearer, and `Set-Cookie` credentials and must remain disabled in production.
- Shipped password examples set `autoSignIn: false`, which removes Better Auth 1.6.23's immediate duplicate-signup 422/session oracle. It does not provide complete account-enumeration resistance: the pinned synthetic duplicate response has a distinguishable optional-field shape, and a follow-up sign-in with the submitted password distinguishes a pre-existing account from the account just created. Public self-service signup therefore remains conditional on an explicitly accepted enumeration policy or an upstream/provider ceremony that closes those oracles.
- The shipped 15-character password floor follows the single-factor minimum in [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/), but it is only a baseline. It is not a breached/common-password blocklist or an account-level abuse control. Consumers own a maintained blocklist policy, and operators own a trusted-ingress per-account and per-IP limiter with real burst/spoof validation.
- Better Auth's default [rate-limit storage is memory](https://better-auth.com/docs/concepts/rate-limit), so it is process-local defense in depth; a missing client IP can collapse clients into one denial bucket. Strict distributed authentication limiting remains an ingress responsibility. Database-backed strict counters are unsupported on the pinned adapter because its read-then-update fallback is not atomic.

### Browser XSS and active bearer boundary

The Convex JWT used by browser HTTP and WebSocket calls is an active bearer credential. It is available to application JavaScript while authenticated and can be present in authenticated SSR hydration state. It must never be copied into local storage, URLs, analytics, logs, error messages, or rendered markup. An `HttpOnly` Better Auth session cookie does not remove this boundary: same-origin script execution can act as the current user and can read or use the browser-held Convex JWT until it expires.

Maintained UI renders user, auth, and backend-controlled values through Vue text interpolation. It does not pass those values to `v-html`, executable attributes, dynamic templates, or script construction. Consumers adding rich HTML must follow [Vue's security guidance](https://vuejs.org/guide/best-practices/security), sanitize it for the intended context, and keep authorization on the backend; frontend escaping is not an authorization control.

Shipped documentation and runtime surfaces do not load mutable third-party runtime scripts. A deployment that adds one owns its code and supply-chain risk and must explicitly audit, pin or self-host it, restrict it to the pages that require it, and include only the necessary origin in its enforced policy. Do not send bearer credentials, auth URLs, or user-controlled fields to analytics or other third parties.

Each deployment owns an enforced [Content Security Policy](https://www.w3.org/TR/CSP3/) matched to its actual application. A conservative policy starts with `default-src 'self'`, `base-uri 'none'`, and `object-src 'none'`; uses nonces or hashes for required scripts; permits only the exact Convex HTTPS and WebSocket origins in `connect-src`; and permits only required image, font, frame, and provider origins. Avoid wildcard sources, `unsafe-eval`, and an unrestricted `unsafe-inline`. Where embedding is not an intentional product feature, set `frame-ancestors 'none'`. Roll the exact policy through report-only observation if needed, then enforce it and rehearse sign-in, OAuth, recovery, SSR hydration, Convex HTTP, and WebSocket reconnect behavior in the deployed environment. CSP is defense in depth, not a substitute for safe rendering or backend authorization.

## Residual risks and deployment responsibility

Already-issued stateless Convex JWTs remain usable until their expiry; the pinned Convex Better Auth adapter defaults to 15 minutes. Better Auth cookie caching can additionally delay recognition of a revoked session for its configured cache lifetime. Deployments requiring faster revocation must shorten both lifetimes or add application-level server revalidation for high-risk operations.

Better Auth `1.6.23` stores OAuth tokens in plaintext by default. `account.encryptOAuthTokens: true` encrypts access and refresh tokens on the ordinary OAuth paths, but the pinned implementation still stores provider ID tokens without that encryption and its direct ID-token linking path bypasses token encryption for all three values. Treat the Better Auth component database, backups, and logs as credential-bearing, minimize provider scopes and token retention, do not expose direct ID-token linking without a separate review, and reassess this limitation on every dependency-tuple change.

The packaged `@convex-dev/better-auth` `0.12.5` component [orders its active-session index as `[expiresAt, userId]`](https://github.com/get-convex/better-auth/blob/c628916b451a6b4cff0f5464f134475464b1a6da/src/component/schema.ts#L36-L47), while Better Auth `1.6.23` [lists active sessions by `userId` and then `expiresAt`](https://github.com/better-auth/better-auth/blob/9dfceee14021fc15a2fb93023f39635f25b0b5ba/packages/better-auth/src/db/internal-adapter.ts#L238-L260). Packaged-component consumers can therefore hit Convex document read limits as session cardinality grows and must upgrade when upstream ships the correctly ordered index. Local-component consumers should add the single `[userId, expiresAt]` index used by the maintained Team and Agentic starters. This is an availability limit, not an authentication bypass; do not add a parallel session projection.

Better Auth `1.6.23` also has a reproducible concurrent first-request initialization race: one cold-start request can lose its async request context and fail. The [upstream fix](https://github.com/better-auth/better-auth/commit/54fab084469a27257e66a0814523ebac7145ef5d) is not in the supported stable tuple. This is a bounded cold-start availability/request failure, not evidence of identity crossover; reassess and upgrade when a compatible release includes the fix.

Pinned Better Auth auth-query atoms can also miss revalidation and signal-listener restoration after the same atom unmounts and remounts; [current upstream fixes that lifecycle](https://github.com/better-auth/better-auth/commit/f6d18fa8f79b9323e10b50f72e2b1a088844e4bb). Better Convex Nuxt's supported `useConvexAuth()` observer is app-lifetime and is not route-remounted. Direct component use of `client.useSession()` retains the upstream stale-session risk and is outside the supported identity path until a compatible upgrade.

An XSS flaw, compromised same-origin dependency, or intentionally trusted third-party script can perform authenticated actions and can exfiltrate the browser-readable Convex JWT for use until expiry. Safe Vue rendering and an enforced CSP reduce exposure but cannot make an active bearer credential revocable or protect it after attacker-controlled script executes. This is a residual browser risk; high-risk backend operations must revalidate canonical authorization state and deployments must keep JWT lifetime proportional to that risk.

Operators own TLS termination, host-header validation, untrusted sibling-subdomain isolation, secret storage, OAuth provider configuration, delivery-provider and account-recovery ceremonies, CSP, logging access, Convex authorization rules, dependency updates, and incident response. A provider or recovery path is supported for a deployment only after its real callback/delivery, denial, expiry, single-use, revocation, and rollback behavior has been rehearsed in that environment.

The project describes releases as security-hardened against a documented threat model. It does not claim complete or universal security.

## Dependency response targets

- Critical or known-exploited production dependency: assess immediately and publish or mitigate within 24 hours.
- High severity production dependency: assess within one business day and publish or mitigate within seven days.
- Medium severity production dependency: disposition within 30 days.
- Low severity and development-only findings: disposition in the next regular maintenance cycle.

An unresolved exception must document affected versions, exposure, compensating controls, owner, and expiry date.
