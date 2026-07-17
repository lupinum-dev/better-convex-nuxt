// Packed `/server` subpath consumer. Typechecking proves the published entry
// resolves from the installed tarball rather than an in-app alias.
export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: 'https://server-consumer.convex.cloud',
    siteUrl: 'https://server-consumer.convex.site',
    auth: { publicOrigin: process.env.SITE_URL ?? 'https://server-consumer.example.test' },
  },
})
