import ConvexModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [ConvexModule],
  convex: {
    url: 'https://consumer-smoke.convex.cloud',
    siteUrl: 'https://consumer-smoke.convex.site',
    permissions: true,
  },
})
