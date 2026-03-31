export default defineNuxtConfig({
  modules: ['better-convex-nuxt'],

  compatibilityDate: '2026-03-30',

  devtools: {
    enabled: true,
  },

  typescript: {
    strict: true,
  },

  convex: {
    url: process.env.CONVEX_URL,
    siteUrl: process.env.CONVEX_SITE_URL,
    auth: true,
    logging: 'debug',
    debug: {
      authFlow: true,
      clientAuthFlow: true,
      serverAuthFlow: true,
    },
    tenant: {
      field: 'workspaceId',
      index: 'by_workspace',
    },
  },
})
