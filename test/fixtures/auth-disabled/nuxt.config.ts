import ConvexModule from '../../../src/module'

// `auth: false`: a Convex-only build. The module must add no
// Better Auth client, auth engine, proxy handler, or auth middleware to the
// generated client/Nitro graphs. `scripts/check-auth-disabled-build-graph.mjs`
// builds this fixture and scans `.output` for markers unique to the
// auth-enabled-only files (`plugin.auth.client.ts`, `plugin.server.ts`, the
// `convex-auth` route middleware, and the auth proxy server handler).
export default defineNuxtConfig({
  modules: [ConvexModule],
  convex: {
    url: 'https://auth-disabled.convex.cloud',
    siteUrl: 'https://auth-disabled.convex.site',
    auth: false,
  },
  nitro: {
    // Keep the Nitro build small and deterministic for the graph scan.
    preset: 'node-server',
  },
})
