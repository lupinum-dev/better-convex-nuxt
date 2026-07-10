// Packed `/server` subpath release gate (vNext §9; internal §16.2). Installs
// the packed `better-convex-nuxt` tarball; `server/api/server-consumer-smoke.ts`
// imports the REAL published `better-convex-nuxt/server` entry (never the
// in-app `#convex/server` alias) so `nuxi typecheck` proves both type
// resolution of the packed subpath and that the deleted server trio no longer
// typechecks there.
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: 'https://server-consumer.convex.cloud',
    siteUrl: 'https://server-consumer.convex.site',
  },
})
