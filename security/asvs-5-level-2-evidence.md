# OWASP ASVS 5.0.0 Level 2 evidence map

This is a complete responsibility and evidence index for all 253 Level 1 and Level 2 controls in the stable OWASP ASVS 5.0.0 release. It is not an ASVS certification of consumer applications or deployments.

Canonical evidence: `security/asvs-5.0.0-l2-evidence.json`

Source: https://github.com/OWASP/ASVS/releases/tag/v5.0.0_release

## Coverage summary

| Chapter                             | Controls | Library verified | External responsibility |
| ----------------------------------- | -------: | ---------------: | ----------------------: |
| Encoding and Sanitization           |       27 |                2 |                      25 |
| Validation and Business Logic       |       11 |                0 |                      11 |
| Web Frontend Security               |       19 |                3 |                      16 |
| API and Web Service                 |       10 |                2 |                       8 |
| File Handling                       |        9 |                0 |                       9 |
| Authentication                      |       35 |                0 |                      35 |
| Session Management                  |       18 |                0 |                      18 |
| Authorization                       |        7 |                0 |                       7 |
| Self-contained Tokens               |        7 |                0 |                       7 |
| OAuth and OIDC                      |       29 |                1 |                      28 |
| Cryptography                        |       14 |                0 |                      14 |
| Secure Communication                |        9 |                2 |                       7 |
| Configuration                       |       13 |                5 |                       8 |
| Data Protection                     |        9 |                3 |                       6 |
| Secure Coding and Architecture      |       13 |                9 |                       4 |
| Security Logging and Error Handling |       16 |                5 |                      11 |
| WebRTC                              |        7 |                0 |                       7 |

## Library-owned verified controls

| ASVS control  | Evidence                                                      |
| ------------- | ------------------------------------------------------------- |
| v5.0.0-1.2.2  | `test/security/proxy-property-regressions.test.ts`            |
| v5.0.0-1.3.6  | `src/runtime/utils/site-url.ts`                               |
| v5.0.0-3.4.2  | `src/runtime/server/api/auth/security.ts`                     |
| v5.0.0-3.5.1  | `test/security/proxy-regressions.test.ts`                     |
| v5.0.0-3.5.2  | `test/security/proxy-regressions.test.ts`                     |
| v5.0.0-4.1.3  | `src/runtime/server/api/auth/headers.ts`                      |
| v5.0.0-4.2.1  | `src/runtime/server/api/auth/headers.ts`                      |
| v5.0.0-10.1.1 | `src/runtime/server/api/auth/headers.ts`                      |
| v5.0.0-12.2.1 | `src/runtime/utils/site-url.ts`                               |
| v5.0.0-12.3.1 | `src/runtime/utils/site-url.ts`                               |
| v5.0.0-13.1.1 | `src/ARCHITECTURE.md`                                         |
| v5.0.0-13.2.4 | `src/runtime/utils/site-url.ts`                               |
| v5.0.0-13.2.5 | `src/runtime/utils/site-url.ts`                               |
| v5.0.0-13.4.2 | `test/security/proxy-regressions.test.ts`                     |
| v5.0.0-13.4.4 | `src/runtime/server/api/auth/[...].ts`                        |
| v5.0.0-14.2.2 | `src/runtime/server/api/auth/[...].ts`                        |
| v5.0.0-14.3.1 | `test/security/client-auth-regressions.test.ts`               |
| v5.0.0-14.3.2 | `test/security/proxy-regressions.test.ts`                     |
| v5.0.0-15.1.1 | `SECURITY.md`                                                 |
| v5.0.0-15.1.2 | `scripts/generate-sbom.mjs`                                   |
| v5.0.0-15.1.3 | `security/better-auth-hardening-implementation-2026-07-13.md` |
| v5.0.0-15.2.1 | `.github/workflows/ci.yml`                                    |
| v5.0.0-15.2.2 | `src/runtime/server/api/auth/body-size.ts`                    |
| v5.0.0-15.2.3 | `scripts/check-package-exports.mjs`                           |
| v5.0.0-15.3.2 | `test/security/proxy-regressions.test.ts`                     |
| v5.0.0-15.3.4 | `test/unit/auth-proxy-headers.test.ts`                        |
| v5.0.0-15.3.5 | `tsconfig.json`                                               |
| v5.0.0-16.2.5 | `src/runtime/utils/sanitize-diagnostic.ts`                    |
| v5.0.0-16.4.1 | `src/runtime/utils/sanitize-diagnostic.ts`                    |
| v5.0.0-16.5.1 | `test/security/proxy-regressions.test.ts`                     |
| v5.0.0-16.5.2 | `src/runtime/auth/client-engine.ts`                           |
| v5.0.0-16.5.3 | `test/security/client-auth-regressions.test.ts`               |

## Responsibility meanings

- **library**: implemented and backed by repository evidence.
- **upstream**: owned by the pinned Better Auth or Convex implementation and requiring integration verification.
- **consumer**: owned by authorization and application code using this library.
- **deployment**: owned by production infrastructure, configuration, monitoring, and operations.
- **not-applicable**: functionality is not implemented by this library.

A release may claim only that the library-owned controls are verified. External controls must be assessed against the deployed consumer application before making an application-level ASVS claim.
