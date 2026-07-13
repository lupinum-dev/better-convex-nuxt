# Better Auth hardening implementation report

**Implementation date:** 2026-07-13  
**Branch:** `fix/better-auth-security-hardening`  
**Baseline audit:** `security/better-auth-second-release-gate-2026-07-13.md`

## Decision

The eight locally reproducible blocker groups from the baseline audit have been remediated in source, tests, public configuration, and active documentation. The implementation is suitable for release-candidate review. It is not a proof of complete security and is not yet an unconditional production-security approval because the external release gates listed below have not run against a deployed candidate.

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

| Gate                        | Result                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm check`                | Passed: format, lint, types, boundaries, 85 files and 718 tests                                            |
| Mandatory security project  | Passed: proxy, session, queue, cookie/config, and full-body deadline regressions                           |
| `pnpm check:contracts`      | Passed, including packed package-entry probes                                                              |
| `pnpm audit --prod`         | No known vulnerabilities                                                                                   |
| Isolated proxy E2E          | Passed against a real Nuxt/Nitro server and local upstream                                                 |
| Isolated full auth-loop E2E | Passed: signup, authenticated dashboard, signout, protected redirect                                       |
| Aggregate `pnpm test:e2e`   | Harness blocked: serial Nuxt fixtures contend for Vite HMR port `24678` and lose the dev-server IPC socket |

The aggregate-runner failure is reproducible infrastructure evidence, not an observed auth assertion failure. The security-relevant proxy and full local auth-loop files pass in fresh isolated Vitest processes.

## Confidence and severity reassessment

Confidence that the eight audited implementation defects are addressed by this branch is **high (approximately 90–95%)**, based on direct code-path removal, deterministic regression tests, real Nuxt proxy execution, a full local auth loop, type/contract probes, and dependency audit.

Confidence cannot honestly be 100%. Unknown vulnerabilities, deployment mistakes, upstream defects, OAuth-provider behavior, and controls outside this library remain possible. Stateless Convex JWTs also remain valid until expiry; deployments needing immediate revocation must shorten lifetime or add application-level server revalidation.

## Remaining release gates

Before promoting a release as security-hardened:

1. Repair or isolate the aggregate E2E fixture runner, then run the full serial matrix without skipped provider-dependent cases.
2. Run the added CodeQL workflow on the release candidate and disposition every result.
3. Run proxy fuzzing/DAST against a deployed candidate, including malformed framing, slow bodies, header confusion, origin variants, and redirect responses.
4. Exercise configured OAuth, MFA/OTP/TOTP/backup codes, cross-tab logout, expiry, account switching, and revocation with production-like secrets and ingress.
5. Obtain an independent penetration test and close or explicitly accept its findings.
6. Finalize exact OWASP ASVS 5 Level 2 control identifiers and evidence with the independent assessor.

The defensible claim after those gates pass is: **security-hardened and reviewed against the documented supported contract and threat model**. Do not claim that the library is completely secure, universally OWASP-compliant, or immune to bad actors.
