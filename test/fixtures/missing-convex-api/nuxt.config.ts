import ConvexModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [ConvexModule],
  convex: {
    url: 'https://missing-api.convex.cloud',
    siteUrl: 'https://missing-api.convex.site',
  },
})
