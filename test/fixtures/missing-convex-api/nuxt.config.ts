import ConvexModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [ConvexModule],
  convex: {
    url: 'https://missing-api.convex.cloud',
    siteUrl: 'https://missing-api.convex.site',
    auth: {
      publicOrigin: process.env.SITE_URL ?? 'https://missing-api.example.test',
      proxy: { trustedClientIpHeader: 'x-test-client-ip' },
    },
  },
})
