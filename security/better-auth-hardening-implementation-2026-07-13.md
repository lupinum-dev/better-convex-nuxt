# Better Auth hardening implementation report

**Implementation date:** 2026-07-13
**Branch:** `fix/better-auth-security-hardening`
**Baseline audit:** `security/better-auth-second-release-gate-2026-07-13.md`

## Decision

The eight locally reproducible blocker groups from the baseline audit have been remediated in source, tests, public configuration, active documentation, and release automation. The implementation is suitable for release-candidate review. It is not a proof of complete security and is not an unconditional production-security approval because the external release gates listed below must run against the actual deployed candidate.

## Implemented controls

1. The auth proxy makes exactly one upstream request with `redirect: 'manual'`; internal redirect replay was deleted.
2. Host, framing, hop-by-hop, `Forwarded`, `X-Forwarded-*`, and Better Auth forwarding markers are stripped. The module reconstructs only its server-owned host/protocol markers. Client IP is absent by default and may come only from one explicitly configured ingress-owned header containing one valid IP.
3. Better Auth's public Vue `useSession()` result is observed in a disposable effect scope. Session absence and errors fail closed, and revision/epoch checks reject stale token-exchange results.
4. Complete integrated sign-in, sign-up, and sign-out operations enter one FIFO queue, with pending state covering queue wait and execution.
5. The cross-request JWT cache, cache API, benchmark, invalidation claims, and configuration were deleted. SSR and server calls exchange per request.
6. One strict bare-origin `siteUrl` validator is used at module, runtime, proxy, and token-exchange boundaries. HTTPS is required except for loopback development.
7. Proxy request and response bodies remain bounded bytes. One abort deadline covers inbound reading, upstream fetch, and complete response consumption. Upstream bodies are buffered before the H3 response is mutated.
8. Secure-cookie selection is presence-aware. The supported Better Auth route and cookie contract is narrow and documented.

The normal browser contract is fixed same-origin `/api/auth`, GET/POST only, private/no-store responses, default Better Auth cookie naming, and upstream `/api/auth`. Cross-origin CORS, custom proxy routes, internal redirects, and token caching are intentionally not alternative modes.

## Verification evidence

| Gate                             | Result                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                     | Passed: format, lint, module/server types, boundaries, 87 files and 730 tests                                     |
| Mandatory security project       | Passed: proxy, session, queue, cookie/config, plugin contracts, property regressions, and full-body deadlines     |
| `pnpm check:contracts`           | Passed, including MFA/OAuth client typing and five packed package-entry probes                                    |
| `pnpm check:asvs`                | Passed: all 253 OWASP ASVS 5.0.0 Level 1/2 controls have unique IDs, ownership, disposition, and evidence         |
| `pnpm check:sbom`                | Passed: CycloneDX 1.6 model contains 262 production components and the required auth/Convex dependencies          |
| `pnpm audit --prod`              | Passed: no known production dependency vulnerabilities                                                            |
| Deterministic core E2E           | Passed three consecutive runs: eight isolated files per run with no provider/environment skips                    |
| Extended auth session E2E        | Passed: raw Better Auth logout across two tabs, Convex identity clearing, logout, and account switching           |
| Real Nitro proxy security probes | Passed: method/origin rejection before upstream, forwarding-header removal, schema-changing plugin route, cookies |

The former aggregate-runner port collision was removed by using one fresh Vitest/Nuxt process per E2E file. The dev-overlay-only fixture was deleted because its nested Vite dev server was the conflicting duplicate path; equivalent configuration redaction and failure behavior remains covered deterministically by the security project.

## Confidence and severity reassessment

Confidence that the eight audited implementation defects are addressed by this branch is **high (approximately 90–95%)**, based on direct code-path removal, deterministic and seeded regression tests, real Nuxt/Nitro execution, full local auth loops, cross-tab identity testing, type/packed-package contract probes, exact ASVS bookkeeping, dependency audit, and SBOM validation.

Confidence cannot honestly be 100%. Unknown vulnerabilities, deployment mistakes, upstream defects, OAuth-provider behavior, and controls outside this library remain possible. Stateless Convex JWTs also remain valid until expiry; deployments needing immediate revocation must shorten lifetime or add application-level server revalidation.

## Remaining external and deployment release gates

Before promoting a release as security-hardened:

1. Run the pinned CodeQL and TruffleHog workflows on the release-candidate commit and disposition every result.
2. Run the scheduled Nuxt `4.4.0`/latest compatibility matrix and the extended E2E workflow in clean GitHub-hosted runners.
3. Run proxy fuzzing/DAST against the deployed candidate and real ingress, including malformed framing, slow bodies, header confusion, origin variants, and redirect responses.
4. Exercise the application's configured OAuth providers and MFA/OTP/TOTP/backup-code flows with production-like provider credentials and secrets. Local contract simulations verify library integration shape, not external provider behavior.
5. Confirm production cookie, TLS, trusted-ingress, CSP, rate-limit, monitoring, secret-rotation, backup, and incident-response configuration owned by the consumer/deployment.
6. Obtain an independent penetration test and have an independent assessor review the ASVS responsibility/evidence decisions; close or explicitly accept every finding.

The defensible claim after those gates pass is: **security-hardened and reviewed against the documented supported contract and threat model**. Do not claim that the library is completely secure, universally OWASP-compliant, or immune to bad actors.
