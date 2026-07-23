# Exact Vue MCP App consumer checkpoint — 2026-07-23

## Outcome

The neutral production MCP App consumer now passes against the immutable local
Vue `0.8.0-beta.15` and MCP `0.1.0-beta.5` tarballs. The consumer:

- installs both exact tarballs in a temporary application;
- proves the lockfile references both tarballs;
- compares installed package bytes with candidate manifests;
- production-bundles the App from `better-convex-vue/mcp-app`;
- rejects any fallback to `packages/vue/src`;
- negotiates the locked RC through the installed `@better-convex/mcp`;
- proves useful structured/text fallback;
- runs the capable-host browser boundary matrix; and
- scans the App, fallback, and bridge boundary for the bearer sentinel.

## Proof correction

The first run failed closed with HTTP 500 because the consumer proof still
constructed its own SDK `McpServer` through the removed `createServer()` option.
That API was intentionally hard-cut during stabilization. The immutable MCP
candidate already exposes the corrected package-owned lifecycle:

```text
createConvexMcpHandler({ configureServer(..., server) })
```

The proof was corrected to register its tool on the package-owned server. No
candidate bytes changed and no compatibility path was added.

## Executed command

```text
node scripts/check-vue-mcp-app-consumer.mjs \
  --vue-tarball .release-artifacts/vue/0.8.0-beta.15/better-convex-vue-0.8.0-beta.15.tgz \
  --mcp-tarball .release-artifacts/mcp/0.1.0-beta.5/better-convex-mcp-0.1.0-beta.5.tgz
```

Result:

```text
Packed MCP App consumer passed Vue 0.8.0-beta.15 with MCP 0.1.0-beta.5.
```

Focused formatting and ESLint checks for the corrected runner also pass.

## Remaining `P7-013` scope

This checkpoint proves the neutral exact-package capable-host and fallback
consumer. `P7-013` remains open until the materially different Ginko
publish-impact App is also built from the exact installed Vue/MCP candidates
without its current source alias. Different-origin and real external host
evidence remains a later protected/experimental stabilization gate; it is not
fabricated by this local harness.
