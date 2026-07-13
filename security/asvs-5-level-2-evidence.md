# OWASP ASVS 5 Level 2 evidence map

This is a release-maintained evidence index, not a certification. Exact ASVS control identifiers must be finalized during the independent assessment; the repository evidence below is mandatory for every release candidate.

| Control area                     | Library evidence                                                                     | Deployment responsibility                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| Architecture and threat model    | `src/ARCHITECTURE.md`, security audit reports, fixed ownership boundaries            | Review application data flows and authorization model                       |
| Authentication                   | Better Auth public-session reconciliation and auth regression tests                  | Configure Better Auth methods, MFA, OAuth, email, and exact trusted origins |
| Session management               | No cross-request JWT cache; logout, expiry, account-switch, and stale-revision tests | Choose token/session lifetimes appropriate to revocation needs              |
| Access control                   | Convex identity installation and identity-generation isolation tests                 | Enforce every product authorization rule in Convex functions                |
| Input and request validation     | Strict site origin, exact Origin, method, body-size, byte, and IP-header tests       | Validate host/TLS at ingress and application inputs in Convex functions     |
| Communication security           | HTTPS-only site origin except loopback                                               | Operate TLS, HSTS, DNS, and trusted proxy infrastructure                    |
| Error handling and logging       | Production error redaction and diagnostic sanitizer tests                            | Protect logs, alert on auth failures, maintain incident response            |
| Data protection                  | Auth-cookie filtering, no-store/Vary behavior, no credential redirect replay         | Manage secrets, retention, backups, and privacy obligations                 |
| Malicious input and availability | Bounded bodies, complete deadline, malformed-header regression tests                 | Rate limiting, WAF/edge limits, monitoring, and capacity planning           |
| Supply chain                     | Exact Better Auth pins, production audit, package/contract gates, CodeQL             | Review dependency updates and advisories before deployment                  |

## Release completion evidence

- `pnpm check`
- `pnpm check:contracts`
- `pnpm audit --prod`
- deterministic auth E2E suite
- CodeQL/SAST result
- proxy fuzz/DAST result
- independent penetration-test report and disposition of findings
