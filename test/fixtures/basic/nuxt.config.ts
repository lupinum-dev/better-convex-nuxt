import ConvexModule from '../../../src/module'

export default defineNuxtConfig({
  modules: [ConvexModule],
  convex: {
    url: 'https://test-convex.convex.cloud',
    auth: {
      url: 'http://localhost:3000',
    },
  },
})
