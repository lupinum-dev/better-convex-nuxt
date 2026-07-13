# Security Policy

## Supported versions

Security fixes are provided for the latest published minor release. Pre-`0.7.0` releases use the superseded auth boundary and are not supported for security-sensitive deployments.

The hardened contract supports Node `^22.12.0 || ^24.11.0 || >=26.0.0`, Nuxt `^4.4.0`, Better Auth `1.6.23`, `@convex-dev/better-auth` `0.12.5`, and the exact Convex version in the published package. Dependency tuple changes require the full security and compatibility gates.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub Security Advisories for this repository and include affected versions, prerequisites, reproduction steps, impact, and any proposed mitigation. Maintainers will acknowledge a complete report within three business days and coordinate disclosure after a fix is available.

## Supported security contract

- Browser auth is same-origin through fixed `/api/auth`; only GET and POST are accepted.
- `convex.siteUrl` is one bare HTTPS origin, except loopback HTTP in development.
- Better Auth uses its default cookie prefix/name and `/api/auth` base path.
- Better Auth server `baseURL` is the static Nuxt application origin, and its `trustedOrigins` contains each exact application origin.
- Forwarded headers are untrusted. A client IP is accepted only from the explicitly configured ingress-owned header.
- Better Auth owns session truth. Convex backend functions remain responsible for authorization through `ctx.auth` and application rules.

## Residual risks and deployment responsibility

Already-issued stateless Convex JWTs remain usable until their expiry. Deployments requiring faster revocation must shorten token lifetime or add application-level server revalidation. Operators own TLS termination, host-header validation, secret storage, OAuth provider configuration, CSP, logging access, Convex authorization rules, dependency updates, and incident response.

The project describes releases as security-hardened against a documented threat model. It does not claim complete or universal security.

## Dependency response targets

- Critical or known-exploited production dependency: assess immediately and publish or mitigate within 24 hours.
- High severity production dependency: assess within one business day and publish or mitigate within seven days.
- Medium severity production dependency: disposition within 30 days.
- Low severity and development-only findings: disposition in the next regular maintenance cycle.

An unresolved exception must document affected versions, exposure, compensating controls, owner, and expiry date.
