export default {
  modules: ['better-convex-nuxt'],
  pages: true,
  devtools: { enabled: true },
  compatibilityDate: '2026-06-21',
  nitro: {
    experimental: {
      openAPI: false,
    },
  },
  typescript: {
    strict: true,
  },
  convex: {
    auth: {
      enabled: true,
    },
  },
}
