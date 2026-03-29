# Security Review 2026-03-29

## Dependency Triage

Post-fix `pnpm audit --prod --audit-level=moderate` still reports 4 advisories. After review, all remaining hits are upstream dependency-chain issues rather than direct findings in this module's runtime code.

- `happy-dom` via `better-auth -> vitest -> happy-dom`: tooling-only transitive dependency pulled by an upstream production dependency. No direct runtime import in this module was found during review. Residual risk remains until upstream trims or updates that dependency chain.
- `picomatch` via `@nuxt/kit -> tinyglobby -> picomatch`: build/install-time dependency in a required module dependency chain. Residual risk remains upstream.
- `yaml` via `better-auth -> vitest -> vite -> yaml`: tooling-only transitive dependency pulled by an upstream production dependency. Residual risk remains upstream.
- `@nuxt/devtools-kit`: unused production dependency in this repo. It was removed because it widened the published dependency surface without any source import.

## Surface Review

- Auth proxy: `PASS` after hardening encoded traversal rejection. Verified origin checks for preflight and non-preflight requests, critical endpoint method restrictions, off-origin redirect rejection, and request/response body-size enforcement.
- Redirect safety: `PASS` after hardening encoded slash and backslash rejection for redirect targets.
- Token handling and cache invalidation: `PASS`. Session-cookie extraction and cache clearing already fail closed for unrelated cookies.
- Upload flow: `PASS`. Client content type is not treated as trust and malformed upload responses already fail closed.
- MCP tools: `PASS WITH NOTE`. Auth, permission, preview, and destructive confirmation gates are already covered. Authenticated rate limiting is now isolated per caller; anonymous abuse still shares a bucket by tool name.
- Devtools exposure: `PASS`. Server route is dev-only and file serving is path-confined by resolution plus directory checks.
- Package contents: `FAIL -> FIXED`. Local macOS metadata files in `src/runtime/devtools` polluted generated `dist` output. A hygiene test now blocks that regression.

## Findings

1. `medium` - double-encoded auth subpaths were not rejected
   - Surface: auth proxy path validation
   - Exploit sketch: traversal-like encodings such as `%252e%252e` or `%255c` survived the first decode pass and could be forwarded upstream for a second decode by downstream infrastructure.
   - Impact: published consumers
   - Resolution: reject residual encoded dot/slash/backslash sequences after one decode pass.

2. `medium` - encoded slash/backslash redirect targets were not rejected explicitly
   - Surface: post-auth redirect validation
   - Exploit sketch: encoded separator variants such as `%2F`, `%5C`, and their double-encoded forms could bypass raw-string checks and rely on later normalization.
   - Impact: published consumers
   - Resolution: reject encoded slash/backslash sequences before navigation.

3. `low` - unused production dependency widened audit surface
   - Surface: package dependency tree
   - Exploit sketch: no direct exploit in module logic; unnecessary dependency introduced avoidable prod advisories and extra install surface.
   - Impact: published consumers
   - Resolution: remove `@nuxt/devtools-kit` from production dependencies.

4. `low` - local `.DS_Store` files polluted generated build output
   - Surface: package hygiene
   - Exploit sketch: non-code metadata files were copied into `dist/runtime/devtools`.
   - Impact: local dev/build output and potentially published artifacts if not filtered
   - Resolution: remove the junk files and add a hygiene test.
