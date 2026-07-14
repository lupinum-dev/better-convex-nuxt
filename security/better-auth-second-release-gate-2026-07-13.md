# Better Auth integration: second release-gate review

**Review date:** 2026-07-13
**Branch:** `audit/better-auth-security-verification`
**Reviewed HEAD:** `e3ef9e4c`
**Production source revision:** `fb238d96` (`0.6.0`)
**Decision:** **RELEASE BLOCKED — do not promote this revision as secure.**

## Executive decision

This second, independent review confirms the first audit. The current branch adds a report and 26 characterization experiments, but it does not change production source. All 26 experiments pass because they deliberately reproduce the unsafe behavior. They are not approval tests and are excluded from the normal test, CI, and release gates.

No default unauthenticated account takeover, JWT signature bypass, cryptographic break, demonstrated CSRF bypass, SQL injection, XSS, committed production secret, or known production dependency advisory was found. Those positive results do not offset the confirmed proxy trust-boundary and session-lifecycle defects.

The responsible statement today is:

> The integration has been audited and has known release-blocking security and correctness findings under remediation.

It is not responsible to describe this revision as “secure,” “OWASP compliant,” “completely secure,” or “100% secure.” A finite review cannot prove complete security. After remediation and independent validation, a defensible bounded claim would be “security-hardened and reviewed against the documented threat model and OWASP ASVS controls.”

## Reproduced evidence

The following checks were rerun during this review:

| Check                           | Result                     | Meaning                                                                                         |
| ------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm check`                    | 85 files, 749 tests passed | Format, lint, types, boundaries, and ordinary tests are healthy.                                |
| `pnpm check:contracts`          | Passed                     | Consumer and package contracts remain healthy.                                                  |
| `pnpm audit --prod`             | No known vulnerabilities   | No advisory is present in the installed production graph at review time.                        |
| Security characterization suite | 3 files, 26 tests passed   | Every documented unsafe behavior remains reproducible. This is negative evidence, not approval. |

Registry metadata was rechecked. Better Auth `1.6.23` and `@convex-dev/better-auth` `0.12.5` remain the latest stable releases. The installed Convex version is `1.38.0`; `1.42.1` is available. This version difference is not itself a demonstrated vulnerability and should be handled through normal compatibility testing, not an unreviewed security upgrade.

## Confirmed release blockers

### 1. Cross-origin auth-body replay — High, conditional; 100% confidence

`redirect-utils.ts` accepts an upstream-selected HTTP or HTTPS destination when only path and query match, then repeats the original method and body. The experiments replayed credential-bearing POST bodies across 301, 302, 307, and 308 responses and accepted HTTPS downgrade and private-network targets.

This requires a redirect from a misconfigured, compromised, or otherwise influenced trusted upstream; it is not a direct arbitrary browser SSRF. Cookie and Authorization headers are stripped, which narrows impact, but passwords, reset tokens, and MFA request bodies remain sensitive.

**Required fix:** delete internal redirect following. Make exactly one request with `redirect: 'manual'`. Forward intentional OAuth redirects to the browser and fail closed on canonical-host misconfiguration.

### 2. Forged proxy-control headers — High, conditional; 100% confidence

The Nuxt proxy overwrites ordinary forwarded host/protocol headers but preserves inbound `x-better-auth-forwarded-host` and `x-better-auth-forwarded-proto`. The installed Convex adapter restores those attacker-selected values as authoritative forwarded headers. Inbound forwarded IP also survives unless deployment ingress sanitizes it.

**Required fix:** strip `forwarded`, all `x-forwarded-*`, all `x-better-auth-forwarded-*`, host, hop-by-hop, and framing headers. Construct only the authoritative Better Auth marker pair from a validated server-owned origin. Strip client IP by default; support it only through one explicit trusted-ingress header contract.

### 3. Better Auth is not the canonical session source — Medium security, High integration; 100% confidence

The client coordinator reacts to wrapped sign-in/sign-up and its own sign-out path, while the raw Better Auth client is also public. It does not subscribe to Better Auth’s public reactive session result. Real Better Auth 1.6.23 experiments showed successful two-factor completion without Convex reconciliation and raw Better Auth sign-out leaving the coordinator authenticated.

This does not demonstrate an MFA bypass. It demonstrates identity divergence: authenticated Better Auth can leave Convex anonymous, and logged-out Better Auth can leave an already installed Convex identity active in the page.

**Required fix:** create Better Auth’s public `useSession()` once in the client-only Nuxt plugin, inside a Vue `effectScope`. Watch the public reactive result and reconcile Convex on every session revision. Stop the scope through the existing Nuxt owner disposer. Keep SSR state only as the initial snapshot. Do not depend on private `$store` or `$sessionSignal` APIs.

### 4. The advertised operation queue does not serialize operations — Medium; 99–100% confidence

The wrapper performs the Better Auth call before entering the synchronization queue. Concurrent calls therefore start together, pending state remains false during the HTTP operation, and a slow earlier sign-in can complete after a later sign-out and restore authentication.

**Required fix:** either queue the complete Better Auth operation plus reconciliation, with pending accounting around the entire unit, or delete the FIFO guarantee and use canonical session revisions with stale-result guards. Behavior, tests, and documentation must describe the same invariant.

### 5. Cross-request JWT cache cannot represent revocation — Medium opt-in, potentially High for strict revocation; 99–100% confidence

The cache has only per-session-token keys. Broad and targeted revocation endpoints clear the caller’s cache key rather than every revoked target, and an exchange already in flight can repopulate a key after sign-out. Documentation still recommends the feature and suggests invalidation can be immediate.

**Required fix:** delete `auth.cache`, the cache storage module, public clear helper, benchmark, tests that preserve the feature, and cache documentation. Correct retention would require another security-critical source of truth, reverse indexes, invalidation generations, and cross-process atomicity for a small optional optimization.

### 6. `siteUrl` has two security policies — Medium misconfiguration; 100% behavior confidence

Token exchange strictly requires a canonical HTTPS origin except loopback, but runtime/proxy paths preserve and use a raw warning-only value. A path-bearing cleartext URL can therefore become the destination of a cookie-bearing proxy request. The value is owner configuration, not request input, so this is a dangerous deployment failure rather than demonstrated request-driven SSRF.

**Required fix:** one canonical bare-origin validator. Validate at build when a value is present, permit the documented deploy-time override, and perform fatal final runtime validation before any credential-bearing request.

### 7. Proxy deadline and framing are incomplete — Medium availability; 100% confidence

The fetch timeout is cleared when response headers arrive, while body consumption happens later and can stall beyond the deadline. Request bytes are decoded to text while inbound `content-length` survives, so non-UTF-8 data changes length and can produce invalid framing.

**Required fix:** preserve bounded bytes, remove framing headers, and keep one abort deadline active through inbound body reading, upstream fetch, and complete bounded response-body consumption. Buffer and validate the upstream response before mutating the H3 response.

### 8. Cookie and supported-contract mismatches — Low alone, Medium in combination

An explicitly empty secure Better Auth cookie falls through to a stale regular cookie because selection uses truthiness rather than presence. Custom Better Auth cookie naming and upstream base paths are not supported consistently, while the public Nuxt route option changes only the local route.

**Required fix:** use presence-aware secure-cookie precedence. Publish and validate one narrow supported contract: default Better Auth cookie naming and upstream `/api/auth`. Do not claim transparent support for configurations the integration does not implement.

## Architecture and documentation decision

The simplest secure design is a hard cutover:

- fixed same-origin `/api/auth`;
- GET and POST only;
- no library-level CORS or cross-origin trusted-origin surface;
- one strict canonical `siteUrl`;
- one Better Auth session source;
- no cross-request JWT cache;
- no internal redirect policy;
- one explicit trusted-ingress client-IP contract, only when needed;
- one supported Better Auth cookie/base-path contract.

Current documentation is not release-ready because it recommends the cache, documents redirect following, teaches multiple auth mutation paths, and contains configuration examples that do not consistently match the current schema. Documentation must be rewritten after the hard cutover so it describes exactly one normal setup and clearly labels the narrow advanced ingress exception.

## Positive controls to preserve

The second review confirmed useful existing controls that should survive the remediation:

- bounded request and response sizes;
- production error-detail redaction;
- strict token-exchange URL and redirect handling;
- SSR `Vary: Cookie` and private/no-store behavior;
- identity generation/epoch protections;
- exact stable pins for Better Auth and its Convex adapter;
- strong ordinary format, lint, type, boundary, contract, and package checks.

## Promotion acceptance criteria

Promotion remains blocked until all of the following are true:

1. The eight blocker groups above are fixed through the hard-cutover design.
2. The 26 characterization tests are inverted/replaced with fail-closed regression tests.
3. Security regression tests run in `pnpm check`, CI, and release verification.
4. Serial end-to-end coverage exercises email sign-in/up, OAuth callback, OTP/TOTP/backup codes, raw and plugin logout, cross-tab logout, expiry, account switch, revocation, slow headers/body, malformed proxy headers, and trusted-ingress behavior.
5. A `SECURITY.md` documents supported versions, disclosure, threat model, ingress assumptions, residual JWT lifetime, and security response process.
6. An OWASP ASVS 5 Level 2 evidence matrix maps applicable controls to tests, code, deployment responsibility, or an explicit non-applicable rationale.
7. Production dependency audit and SAST/CodeQL run as release gates; fuzzing/DAST targets the proxy boundary.
8. An independent penetration test reviews the remediated release candidate.
9. Documentation contains one secure normal path, no obsolete examples, and no promise of complete security.

## Final confidence statement

Confidence that `e3ef9e4c` is **not** ready to be promoted as secure: **100%**, because the production source is unchanged and the unsafe behaviors were reproduced again.

Confidence in a future remediated release must be reassessed after the acceptance criteria pass. Even then, approval must be bounded to the reviewed versions, documented threat model, supported configuration, and deployment assumptions.
