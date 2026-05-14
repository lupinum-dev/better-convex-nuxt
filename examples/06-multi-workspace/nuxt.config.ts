export default defineNuxtConfig({
  modules: ['@lupinum/trellis', '@nuxt/ui'],
  css: ['~~/assets/css/main.css'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  typescript: {
    strict: true,
  },

  trellis: {
    url: process.env.CONVEX_URL,
    auth: {},
    permissions: {
      query: 'permissions/context.getAccessContext',
      codegen: true,
    },
  },
})
