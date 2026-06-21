export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],
  pages: true,
  devtools: { enabled: true },
  compatibilityDate: '2026-06-21',
  typescript: {
    strict: true
  },
  convex: {
    auth: {
      enabled: true
    }
  }
})

