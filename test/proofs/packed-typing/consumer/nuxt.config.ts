// Packed §5.8 proof-1 consumer. Installs the packed `better-convex-nuxt`
// tarball and pins the vNext proof stack. Phase 0 proves the typed-client
// mechanism from the node_modules-resident `/auth-client` entry (injected as a
// prototype by scripts/inject-auth-client-entry.mjs); Phase 3 swaps in the real
// published entry.
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: 'https://packed-typing.convex.cloud',
    siteUrl: 'https://packed-typing.convex.site',
  },
  typescript: {
    // Include the app-program assertions but not the separate base-fallback
    // program (that is its own TypeScript program via tsconfig.base-fallback.json,
    // matching the vNext §8 isolation contract for separate consumer programs).
    tsConfig: {
      exclude: ['../base-fallback'],
    },
  },
})
