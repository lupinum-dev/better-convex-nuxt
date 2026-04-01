export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  convex: {
    url: 'https://consumer-smoke.convex.cloud',
    auth: {
      enabled: false,
    },
  },
})
