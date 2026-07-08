export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: 'https://consumer-smoke.convex.cloud',
    siteUrl: 'https://consumer-smoke.convex.site',
    permissions: true,
  },
  // Real consumers resolve `better-convex-nuxt` from node_modules; this linked
  // fixture has no such entry, so map the bare specifier to the package's types
  // entry. This lets the F-22 `declare module 'better-convex-nuxt'`
  // augmentation (types/convex-user.d.ts) resolve and merge. Paths are relative
  // to the generated .nuxt/tsconfig.json; nuxt defu-merges this into its own.
  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          'better-convex-nuxt': ['../../../../dist/types.d.mts'],
        },
      },
    },
  },
})
