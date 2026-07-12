# Better Auth integration security verification

**Review date:** 2026-07-12  
**Repository:** `better-convex-nuxt`  
**Reviewed branch:** `audit/better-auth-security-verification`  
**Reviewed repository commit:** `fb238d96` (`0.6.0`)  
**Verdict:** release-block until the proxy trust-boundary and client session-lifecycle findings are fixed and their characterization tests are inverted into fail-closed regression tests.

## Executive conclusion

The integration is not currently supportable as “100% secure” or as completely equivalent to Better Auth. No finite review can prove that claim, and the OWASP Top 10 is an awareness list rather than a security certification. The current [OWASP Top 10:2025](https://owasp.org/Top10/2025/) describes itself that way. [OWASP ASVS 5.0.0](https://owasp.org/www-project-application-security-verification-standard/) is the more appropriate basis for a measurable verification program.

This review did **not** find a default, unauthenticated account-takeover path, a JWT signature bypass, a Better Auth cryptographic break, a demonstrated CSRF bypass, SQL injection, XSS, or a committed production secret. The pinned production dependency graph reported zero known vulnerabilities through `pnpm audit --prod` at review time. The exact Better Auth version is also outside the affected range of the historical [scheme-less callback open-redirect advisory](https://github.com/better-auth/better-auth/security/advisories/GHSA-hjpm-7mrm-26w8).

It did confirm important integration flaws:

1. The proxy replays password/reset/MFA request bodies across an upstream-selected cross-origin redirect, including HTTPS downgrade and private-network destinations.
2. User-supplied `x-better-auth-forwarded-*` headers cross the Nuxt boundary and are restored as authoritative forwarded host/protocol by the installed Convex adapter.
3. Better Auth's canonical session signal is not the source of identity. Two-factor completion can leave Convex anonymous, while raw/plugin logout can leave the page's Convex identity authenticated.
4. The documented identity-operation queue begins only after the Better Auth operation finishes. A slow sign-in can overtake a later sign-out.
5. The optional cross-request JWT cache cannot implement Better Auth's revocation semantics and can be repopulated by an exchange that was already in flight.

The first two are **High impact under explicit preconditions**, not universal Critical issues. The session-lifecycle and queue findings are **release-blocking integration defects** with Medium standalone security severity. Cache revocation is Medium when the cache is explicitly enabled and may be High for an application whose threat model requires immediate revocation.

The shortest defensible hardening path is deletion and consolidation: delete redirect following, delete the cross-request JWT cache, make Better Auth session state the one identity source, and make one strict canonical origin/path/cookie contract govern every server path.

## Scope and limits

Reviewed:

- Nuxt auth proxy request/response handling, origin checks, headers, redirects, bodies, cookies, deadlines, and error behavior.
- Server-side cookie-to-Convex-token exchange and the optional JWT cache.
- Client identity coordination, sign-in/sign-up/sign-out ordering, two-factor plugin behavior, and raw Better Auth client behavior.
- Configuration normalization for `siteUrl`, proxy route, cookies, and upstream base path.
- Exact source and package behavior of the pinned Better Auth and Convex adapter releases.
- Relevant OWASP Top 10:2025 categories and selected 2021 SSRF guidance that remains directly applicable.

Not established by this review:

- Security of an application's Convex authorization rules, database rules, OAuth provider configuration, email delivery, CSP, deployment ingress, TLS termination, secrets management, logging backend, or incident response.
- A complete line-by-line cryptographic audit of Better Auth itself.
- A formal ASVS attestation, third-party penetration test, fuzzing campaign, or public-infrastructure DAST.
- Immediate invalidation of already issued stateless Convex JWTs. Clearing local state and cookies does not revoke a token that another holder already possesses; applications with that requirement need an explicit short-lifetime or server-side revocation design.

Confidence percentages below describe confidence that the stated behavior exists in this exact revision. They do not estimate exploit probability.

## Reproducible evidence and provenance

### Exact upstream revisions

| Component                 | Installed/latest stable at review | Exact reviewed source                                                              |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| Better Auth               | `1.6.23`                          | tag `v1.6.23`, commit `9dfceee14021fc15a2fb93023f39635f25b0b5ba`                   |
| `@convex-dev/better-auth` | `0.12.5`                          | tag `v0.12.5`, npm `gitHead` and commit `c628916b451a6b4cff0f5464f134475464b1a6da` |

Both packages are exact production pins in `package.json`. Registry metadata and cloned tags agreed. Relevant upstream comparisons are linked to immutable commits:

- The Convex adapter [restores `x-forwarded-host` and `x-forwarded-proto` from `x-better-auth-forwarded-*`](https://github.com/get-convex/better-auth/blob/c628916b451a6b4cff0f5464f134475464b1a6da/src/client/create-client.ts#L88-L106).
- Its official Next.js proxy [deletes framing headers, forwards bytes, and owns both ordinary and Better Auth forwarding markers](https://github.com/get-convex/better-auth/blob/c628916b451a6b4cff0f5464f134475464b1a6da/src/nextjs/index.ts#L43-L72).
- Its React integration [keys Convex token installation from Better Auth's canonical session ID](https://github.com/get-convex/better-auth/blob/c628916b451a6b4cff0f5464f134475464b1a6da/src/react/index.tsx#L104-L170).

Better Auth itself warns that forwarded host/protocol headers must not be forgeable and that untrusted values can manipulate callbacks and redirects. It also says IP headers must be overwritten or sanitized by a trusted ingress. See the official [security reference](https://better-auth.com/docs/reference/security) and [rate-limit documentation](https://better-auth.com/docs/concepts/rate-limit).

### Verification runs

Before adding the audit harness:

- `pnpm check`: passed formatting, lint, both type-checks, architectural boundaries, and 749 tests in 85 files.
- Targeted auth/security suite: 126 tests in 11 files passed.
- `pnpm check:contracts && pnpm typecheck:fixtures`: passed.
- Isolated auth-proxy E2E: passed.
- Full-stack signup, authenticated SSR, sign-out, and protected redirect E2E: passed.
- `pnpm audit --prod`: 0 known production dependency vulnerabilities.

The combined E2E command was not counted as evidence because a Nuxt/Vite IPC and port collision prevented a trustworthy combined run. The same relevant flows passed in isolated runs.

This branch adds an explicit characterization harness:

```sh
pnpm exec vitest run --config vitest.security.config.ts --reporter=verbose
```

Result: **26/26 experiments passed** across three files. These tests deliberately assert current behavior, including unsafe behavior. They are isolated from normal CI so they cannot be mistaken for approval tests. Each must be inverted or replaced with a fail-closed regression test when its fix lands.

## Finding register

| ID         | Finding                                                              | Severity                                              | Exposure/precondition                                                                  |    Confidence |
| ---------- | -------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------: |
| BCN-SEC-01 | Cross-origin auth-body replay and destination expansion              | High, conditional                                     | Trusted auth upstream returns a same-path/query redirect to another origin             |          100% |
| BCN-SEC-02 | Better Auth proxy-control headers cross an untrusted boundary        | High, conditional                                     | Client can set marker headers and Better Auth/plugins use forwarded origin dynamically |          100% |
| BCN-SEC-03 | Better Auth session changes are not canonical for Convex identity    | Medium security; High integration priority            | Raw/plugin/2FA session-changing APIs are used                                          |          100% |
| BCN-SEC-04 | Auth operations execute outside the claimed serial queue             | Medium                                                | Overlapping operations in one client                                                   |           99% |
| BCN-SEC-05 | Optional JWT cache does not follow session revocation                | Medium opt-in; potentially High for strict revocation | Cache enabled and revoked/stolen session has cached or in-flight token                 |           99% |
| BCN-SEC-06 | `siteUrl` is strict in token exchange but raw in proxy/runtime paths | Medium misconfiguration                               | Owner supplies noncanonical, cleartext, or path-bearing value                          | 100% behavior |
| BCN-SEC-07 | Client-controlled forwarded IP survives the proxy                    | Medium, deployment-dependent                          | Ingress does not overwrite it and Better Auth relies on it                             |          100% |
| BCN-SEC-08 | Fetch deadline ends at response headers                              | Medium availability                                   | Slow or stalled upstream response body                                                 |          100% |
| BCN-SEC-09 | Request body is text-transcoded while stale framing is retained      | Low security; Medium compatibility/availability       | Non-UTF-8 body or future binary plugin route                                           |          100% |
| BCN-SEC-10 | Empty secure cookie falls back to a regular cookie                   | Low alone; Medium with cache                          | Empty secure cookie plus stale regular cookie/cache entry                              |          100% |
| BCN-SEC-11 | Cache accepts a JWT without readable `exp`                           | Low defense-in-depth                                  | Cache enabled and trusted token source/storage is malformed                            | 100% behavior |
| BCN-SEC-12 | Custom Better Auth cookie prefix/name is dropped                     | Low compatibility, fail-closed                        | Better Auth cookie customization is enabled                                            |          100% |
| BCN-SEC-13 | Nuxt proxy route is not the upstream Better Auth `basePath`          | Low compatibility, fail-closed                        | Nondefault upstream Better Auth base path is used                                      |          100% |

No finding is rated Critical in the tested threat model.

## Detailed findings

### BCN-SEC-01 — Cross-origin auth-body replay

**Evidence.** [`getCanonicalRedirectTarget`](../src/runtime/server/api/auth/redirect-utils.ts) accepts any different HTTP(S) origin when only path and query match. It does not require HTTPS, the configured host, a public address, or an allowlist. [`fetchWithCanonicalRedirects`](../src/runtime/server/api/auth/redirect-utils.ts) then reuses the original method and body. The proxy supplies the complete auth body from [`[...].ts`](../src/runtime/server/api/auth/[...].ts).

The local HTTP experiment proved that JSON containing a password and reset token was replayed as a POST across 301, 302, 307, and 308. Cookie and Authorization headers were correctly removed, which materially narrows the claim, but the sensitive body was unchanged. Separate characterization proves that the predicate accepts HTTPS-to-HTTP downgrade and a loopback destination.

**Impact and preconditions.** This can disclose body credentials or turn the proxy into a second server-side request hop. It is not a direct arbitrary SSRF from a normal browser request: the configured upstream must supply the redirect, or the deployment must otherwise permit an attacker to influence that response. That precondition is why this is conditional High rather than Critical.

**Fix.** Delete internal redirect following. Use one validated final `siteUrl` and `redirect: 'manual'`; return intentional OAuth redirects to the browser unchanged. A canonical-host redirect is a deployment error and should fail closed. This also follows OWASP's application-layer SSRF guidance to positively allow destinations and [disable HTTP redirects](https://owasp.org/Top10/2021/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/).

**Release test.** A 3xx from the upstream must cause exactly one outbound request, regardless of Location. Password, reset, verification, and MFA bodies must never reach a second origin.

### BCN-SEC-02 — Proxy-control header confusion

**Evidence.** [`buildAuthProxyForwardHeaders`](../src/runtime/server/api/auth/headers.ts) removes hop-by-hop headers and overwrites ordinary `x-forwarded-host/proto`, but preserves inbound `x-better-auth-forwarded-host/proto`. The installed Convex adapter intentionally restores the ordinary forwarded headers from those markers. The experiment passed attacker-selected marker values through this library, invoked the real installed adapter route, and observed those values restored for Better Auth.

**Impact and preconditions.** With a static Better Auth `baseURL`, Better Auth says that static value wins, so default impact is constrained. With `trustedProxyHeaders`, dynamic host deployments, or plugins that consume forwarded origin, forged values can affect callback, verification, or redirect construction. Better Auth's own [trusted proxy guidance](https://better-auth.com/docs/reference/security) explicitly requires that end users cannot set these headers.

**Fix.** Strip inbound `forwarded`, all `x-forwarded-*`, and all `x-better-auth-forwarded-*` control fields at the application trust boundary. Set the official Convex marker pair from one validated request origin owned by the server. Prefer a static Better Auth `baseURL`; if multiple hosts are supported, require an exact allowlist before creating the markers. Host validation belongs at ingress and in this boundary, not in downstream plugins.

**Release test.** Every attacker-supplied proxy-control value must be absent or replaced before the Convex adapter. Static and approved multi-host callback URLs must be tested end to end.

### BCN-SEC-03 — Session lifecycle divergence

**Evidence.** [`client-engine.ts`](../src/runtime/auth/client-engine.ts) wraps only `signIn` and `signUp` and owns a separate `signOut`. [`useConvexAuth.ts`](../src/runtime/composables/useConvexAuth.ts) also exposes the raw Better Auth client. The coordinator does not subscribe to Better Auth's `$sessionSignal` or `useSession()` result.

Against the real Better Auth 1.6.23 client and two-factor plugin, experiments proved:

- successful `/two-factor/verify-otp` changes the Better Auth session and toggles `$sessionSignal`, while the coordinator remains anonymous and never performs the Convex exchange;
- raw `client.signOut()` clears the Better Auth session and toggles the signal, while the coordinator retains the previous user and Convex JWT.

This does **not** prove an MFA bypass. The verified 2FA path fails to install the authenticated Convex identity; it does not authenticate without the factor. The security concern is the opposite direction: a logout outside the library wrapper can leave an already installed Convex identity active in the current page until cleared, rejected, or expired.

**Fix.** Make Better Auth session/session ID the sole client identity trigger, matching the official Convex React integration. Reconcile on every canonical session change; immediately remove Convex auth when the session disappears. Keep wrappers only as ergonomic operation helpers, not as the identity source.

**Release test.** Exercise email, social callback completion, OTP/TOTP/backup-code verification, raw logout, plugin logout, session expiry, account switch, and cross-tab change. In every case Better Auth and Convex must converge to the same identity before protected UI becomes ready.

### BCN-SEC-04 — Operation queue starts too late

**Evidence.** [`createIntegratedAuthNamespace`](../src/runtime/auth/integrated-namespace.ts) awaits `Reflect.apply` before calling the queued `synchronizeIdentity`. Only the token exchange/identity commit is queued. In contrast, the library-owned sign-out queues the complete Better Auth operation.

Experiments proved both sign-ins start concurrently, settle by completion order, and leave `isPending` false during the Better Auth request. More importantly, a slow sign-in invoked before sign-out can finish after sign-out and restore authentication, contradicting the documented invocation-order invariant.

**Fix.** If serial invocation remains a public guarantee, queue the complete operation—Better Auth call, result handling, and reconciliation—as one unit, with pending accounting around that unit. Avoid a nested queue by extracting an unqueued internal reconciliation function. If serialization is not actually required, delete the guarantee and let canonical Better Auth session state decide identity; do not keep a queue that appears stronger than it is.

**Release test.** Deterministically cover sign-in/sign-in, sign-in/sign-out, sign-out/sign-in, thrown operations, redirects, and cancellation. The last invoked operation must have the documented outcome.

### BCN-SEC-05 — Cache/revocation mismatch

**Evidence.** [`auth-cache.ts`](../src/runtime/server/utils/auth-cache.ts) has only `jwt:hash(sessionToken)` keys. The proxy classifies sign-out, revoke-session, revoke-sessions, revoke-other-sessions, and delete-user together, captures only the caller's cookie, and clears only that key after a successful response.

Experiments proved:

- `revoke-session(B)` clears caller A and leaves B cached;
- `revoke-other-sessions` clears A and leaves revoked B/C cached;
- `revoke-sessions` and `delete-user` also leave B/C cached;
- an exchange started before sign-out can write A back after the clear.

The cache is opt-in and its TTL is clamped to at most 60 seconds, so this is not a default-path High. Within that window, however, a formerly valid/stolen session cookie can receive a cached Convex JWT without Better Auth rechecking the revoked session. That JWT may then remain usable until its own expiry.

**Fix.** Delete the cross-request JWT cache. Correct retention would require a session/user reverse index, revocation generations or tombstones, atomic suppression of in-flight writes, and invalidation for revocations that bypass this Nuxt proxy. That creates another security-critical source of truth for a small optional optimization.

**Release test.** With no cross-request cache, every server request exchanges against Better Auth. If the cache is retained despite this recommendation, all five revocation paths, external revocation, process concurrency, storage concurrency, and in-flight exchange races require invariant tests.

### BCN-SEC-06 — Inconsistent `siteUrl` validation

**Evidence.** [`normalizeSiteUrl`](../src/runtime/server/utils/token-exchange.ts) correctly requires a bare HTTPS origin except loopback. Runtime normalization preserves a raw value, while the proxy concatenates `${siteUrl}/api/auth...`. The experiment showed that `http://internal.example/private-prefix` is rejected by token exchange but accepted by the runtime/proxy sink, including forwarding the Better Auth cookie to the resulting cleartext path.

This is a dangerous owner/deployment configuration and credential-downgrade path. It is not demonstrated SSRF by itself because `siteUrl` is not request-controlled in this library.

**Fix.** Move the existing strict normalizer to the one canonical configuration boundary and fail startup/build. Every consumer must receive the already normalized origin; no second validator and no warning-only path.

### BCN-SEC-07 — Forwarded IP spoofing

**Evidence.** The proxy preserves inbound `x-forwarded-for` unchanged. Better Auth uses forwarded IP for rate limiting and security metadata and warns that ingress must overwrite/sanitize it. If deployment ingress already does so, this finding is mitigated.

**Fix.** Secure default: strip forwarded IP headers. Support a client IP only through an explicit trusted-ingress contract that names the platform-owned header and matches Better Auth's `trustedProxies`/`ipAddressHeaders` configuration. Do not silently trust an appending header chain.

### BCN-SEC-08 — Deadline excludes response body

**Evidence.** [`fetchWithTimeout`](../src/runtime/server/utils/http.ts) clears its abort timer as soon as `fetch()` returns response headers. The proxy reads the body later. A real local server returned headers and stalled; bounded body reading remained pending beyond the configured timeout.

**Impact.** Availability/resource retention from a slow upstream or network failure. Body-size limits do not provide a time limit.

**Fix.** Define a request deadline that remains active through body consumption and cancellation. Return or consume a deadline-scoped response rather than a response whose abort owner has already been cleaned up.

### BCN-SEC-09 — Text transformation plus stale framing

**Evidence.** The proxy reads request bytes, converts them with `TextDecoder`, and retains inbound `Content-Length`. Invalid UTF-8 became the three-byte replacement character while the header remained one byte; the real fetch did not complete a valid request. The official Convex proxy instead removes framing headers and forwards `ArrayBuffer` bytes.

**Fix.** Proxy all non-GET/HEAD bodies as bounded bytes and delete `content-length`, `transfer-encoding`, and `connection` before fetch so the HTTP client owns framing. This is primarily compatibility and availability for future/custom plugin routes, not a demonstrated credential bypass in normal JSON flows.

### BCN-SEC-10 — Empty secure-cookie fallback

**Evidence.** Better Auth treats the presence of an empty `__Secure-better-auth.session_token` as authoritative. The local helper uses `secure || regular`, reviving a stale regular cookie. The experiment compared both implementations directly.

**Fix.** Match upstream's presence-aware precedence exactly. Without the local cache, Better Auth still sees both forwarded cookies and rejects the empty-secure case; the meaningful security combination is this parser plus a stale local cache entry.

### BCN-SEC-11 — Missing `exp` accepted by cache

**Evidence.** The local cache treats a missing/unreadable expiry as usable for configured TTL. The official Convex adapter refreshes instead. Behavior is confirmed, but the prior claim of a direct auth bypass is not: cache population follows a successful trusted upstream exchange, and Convex still verifies JWT signature and claims when it receives the token.

**Fix.** Fail closed: a cached token is usable only when `exp` is readable and future; delete malformed entries. Deleting the cache resolves the issue entirely.

### BCN-SEC-12 and BCN-SEC-13 — Supported-contract gaps

Better Auth supports custom cookie prefix/name, and the Convex adapter supports a custom upstream `basePath`. This library recognizes only `better-auth.*` cookies and always targets upstream `/api/auth`, while `auth.route` changes only the Nuxt-facing route. Both experiments fail closed by losing authentication or reaching the wrong route; neither establishes an authorization bypass.

The simplest safe choice is to publish and validate a narrow supported contract: default Better Auth cookie naming and upstream `/api/auth`. If full customization is a release requirement, cookie naming and base path must each have one configuration source shared by Better Auth, its Convex route registration, the Nuxt proxy, token exchange, and SSR session fallback. Do not add a second loosely related path option. Forwarding every application cookie would restore compatibility but would also disclose unrelated cookies to the Convex site; it is not the preferred shortcut.

## Claims corrected or not substantiated

| Prior/general claim                                           | Result                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| “There is a universal Critical account takeover.”             | Not substantiated. No default unauthenticated takeover was found.                                                                    |
| “Redirect following forwards Cookie and Authorization.”       | Refuted. Those headers are removed on the second hop; the body and other headers are replayed.                                       |
| “Any browser user can choose an SSRF destination.”            | Not substantiated. The redirect destination comes from the configured upstream; raw `siteUrl` comes from owner/deployment config.    |
| “The 2FA bug bypasses the second factor.”                     | Refuted by tested behavior. Successful verification fails to synchronize Convex; no factor bypass was shown.                         |
| “Cache revocation is insecure by default.”                    | Refuted as stated. The cache is opt-in; the flaw is real when enabled.                                                               |
| “A JWT without `exp` bypasses Convex authentication.”         | Not substantiated. Local cache acceptance differs from upstream, but Convex validation remains and the population source is trusted. |
| “Custom cookie prefix or base path is an auth vulnerability.” | Downgraded to fail-closed compatibility unless combined with another flaw.                                                           |
| “Passing the unit suite proves OWASP compliance.”             | Refuted. Tests are evidence for named invariants, not a certification.                                                               |

## Positive controls observed

The review also found strong defensive work that should be preserved:

- strict origin matching rather than reflecting arbitrary CORS origins;
- production proxy errors that avoid leaking internal transport details;
- bounded request and response sizes;
- strict server token-exchange origin validation, manual redirect handling, and credential CR/LF rejection;
- `private, no-store` on critical auth proxy responses and private SSR auth responses;
- generation/epoch protections around Convex client identity replacement;
- Better Auth's own origin/CSRF, secure-cookie, password hashing, OAuth state/PKCE, and rate-limit controls remain in the upstream implementation when not disabled. See Better Auth's [security reference](https://better-auth.com/docs/reference/security).

## OWASP Top 10:2025 coverage assessment

This is a risk mapping, not a “pass.” Library code cannot establish application-wide compliance.

| Category                                   | Assessment for this integration                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control                  | No direct authorization-rule bypass found. Stale Convex identity after raw logout can preserve access in the current client and must be fixed. Application Convex functions remain out of scope.                                                                                          |
| A02 Security Misconfiguration              | Open: raw/warn-only `siteUrl`, dynamic forwarding-header assumptions, and deployment-dependent client-IP trust. Configuration must fail closed.                                                                                                                                           |
| A03 Software Supply Chain Failures         | Exact current pins, matching source commits, lockfile, and zero `pnpm audit --prod` findings are positive. Continuous advisories, provenance/SBOM, and CI policy are still required.                                                                                                      |
| A04 Cryptographic Failures                 | No custom password/JWT cryptography or signature bypass found in this layer. Cleartext nonloopback `siteUrl` acceptance is an avoidable transport downgrade.                                                                                                                              |
| A05 Injection                              | No SQL, command, template, or header CR/LF injection path was demonstrated in reviewed auth code. This does not cover consuming applications or every Better Auth plugin.                                                                                                                 |
| A06 Insecure Design                        | Open: duplicate session truth, cross-origin redirect replay, and a revocation-sensitive derived cache. The proposed deletions address the architectural causes.                                                                                                                           |
| A07 Authentication Failures                | Open: logout/session divergence, incomplete plugin/2FA synchronization, queue race, and opt-in revocation-cache mismatch. OWASP specifically calls out failure to invalidate sessions/tokens during logout in [A07:2025](https://owasp.org/Top10/2025/A07_2025-Authentication_Failures/). |
| A08 Software or Data Integrity Failures    | No update/signature pipeline audit was completed. Exact package/source matching is evidence, not full build provenance.                                                                                                                                                                   |
| A09 Security Logging and Alerting Failures | Library debug/error logging exists, but production detection, retention, alerting, privacy, and response are deployment responsibilities and were not verified.                                                                                                                           |
| A10 Mishandling of Exceptional Conditions  | Open: response-body deadline gap, malformed framing behavior, and auth-operation race. [A10:2025](https://owasp.org/Top10/2025/A10_2025-Mishandling_of_Exceptional_Conditions/) explicitly covers race, resource, timing, and fail-closed errors.                                         |

## Recommended hard cutover

### Release blockers

1. **Delete canonical redirect following.** A configured upstream is final or configuration fails.
2. **Own the proxy trust boundary.** Strip all proxy-control/framing headers; set only validated forwarding markers; define trusted IP ingress explicitly.
3. **Make Better Auth session state canonical.** Remove wrapper completion as the source of authentication; reconcile all session changes and clear Convex immediately on session loss.
4. **Either serialize complete auth operations or delete the serialization promise.** Do not queue only the final third of an operation.
5. **Delete the cross-request JWT cache.** It is derived security state without a correct rebuild/invalidation story.

### Same hardening release

6. Normalize `siteUrl` once at startup and pass only the validated origin.
7. Forward bounded bytes, let fetch own HTTP framing, and keep one deadline through body consumption.
8. Match secure-cookie precedence; choose and enforce either the default-only cookie/base-path contract or one genuinely shared custom contract.
9. Document the stateless Convex JWT residual lifetime and give high-security consumers a tested short-lifetime/revalidation pattern.

### Do not solve these with

- redirect denylists, private-IP regexes, or another redirect mode;
- a second host/path/cookie configuration source;
- more cache indexes without a proven atomic revocation design;
- wrappers for every current Better Auth plugin method;
- compatibility shims that keep old and new auth state paths alive together.

## Definition of “defensibly secure” for this library

“Completely secure” is not a testable acceptance criterion. A defensible release target is:

1. A written threat model identifies browser, Nuxt server, deployment ingress, Convex site, Better Auth, storage, and plugin trust boundaries.
2. The supported Better Auth configuration surface is explicit. Unsupported cookie, base-path, proxy-header, and security-disable options fail build/startup rather than silently diverging.
3. OWASP ASVS 5.0.0 Level 2 requirements relevant to a reusable web auth integration are selected, assigned stable `v5.0.0-*` identifiers, and linked to automated or manual evidence.
4. Every finding above has a negative regression test. The unsafe characterization suite no longer passes unchanged.
5. Real E2E covers email, OAuth callback, every supported 2FA method, account switch, raw/plugin/cross-tab logout, expiry, all revocations, malformed headers/bodies, slow bodies, and deployment proxy behavior.
6. CI runs format, lint, types, boundaries, unit/integration/E2E security gates, production dependency audit, secret scan, and a maintained SAST rule set.
7. Dependency advisories and upstream Better Auth/Convex changes are reviewed continuously; package source/provenance is recorded for releases.
8. An independent penetration test reviews the fixed implementation and a representative production deployment. Critical/High findings block release; Medium findings need an owned remediation or documented risk acceptance.
9. Security reporting, supported-version policy, patch SLA, and incident/credential-rotation procedures are published.

Meeting those criteria can justify a high, bounded level of confidence. It still would not justify promising that the library is invulnerable.

## Experiment files

- [`proxy-security-claims.test.ts`](../test/security/proxy-security-claims.test.ts): redirect body replay, redirect destination expansion, Convex marker restoration, forwarded IP, byte/framing transformation, and response-body deadline.
- [`client-auth-claims.test.ts`](../test/security/client-auth-claims.test.ts): underlying operation ordering, pending coverage, sign-in/sign-out race, real Better Auth two-factor session signal, and raw logout divergence.
- [`cache-config-claims.test.ts`](../test/security/cache-config-claims.test.ts): exact package pins, cookie semantics, missing expiry, every broad revocation class, in-flight repopulation, raw `siteUrl`, custom cookie prefix, and base-path behavior.
- [`vitest.security.config.ts`](../vitest.security.config.ts): isolated characterization configuration.
