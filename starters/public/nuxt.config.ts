export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  devtools: { enabled: true },
  compatibilityDate: '2026-06-21',
  typescript: {
    strict: true
  },
  convex: {
    auth: {
      enabled: false
    },
    defaults: {
      auth: 'none'
    }
  }
})
